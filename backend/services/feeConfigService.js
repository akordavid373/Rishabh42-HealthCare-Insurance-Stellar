const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../database/healthcare.db');

// Default fee configs used as fallback when no DB config exists for an asset.
const DEFAULT_FEE_CONFIGS = {
  network: {
    XLM:  { fee_type: 'percentage', flat_amount: 0, percentage_rate: 0.00001, min_fee: 0, max_fee: null },
    ETH:  { fee_type: 'percentage', flat_amount: 0, percentage_rate: 0.002,   min_fee: 0, max_fee: null },
    BTC:  { fee_type: 'percentage', flat_amount: 0, percentage_rate: 0.0001,  min_fee: 0, max_fee: null },
    USDC: { fee_type: 'percentage', flat_amount: 0, percentage_rate: 0.001,   min_fee: 0, max_fee: null },
  },
  processing: {
    _default: { fee_type: 'percentage', flat_amount: 0, percentage_rate: 0.029, min_fee: 0, max_fee: null },
  }
};

class FeeConfigService {
  getDatabase() {
    return new sqlite3.Database(DB_PATH);
  }

  // Seed the fee_configs table with default values (idempotent via INSERT OR IGNORE).
  async seedDefaults() {
    const db = this.getDatabase();
    try {
      const rows = [];
      for (const [context, assets] of Object.entries(DEFAULT_FEE_CONFIGS)) {
        for (const [asset, cfg] of Object.entries(assets)) {
          rows.push({ asset_code: asset, fee_context: context, ...cfg });
        }
      }

      for (const row of rows) {
        await new Promise((resolve, reject) => {
          db.run(
            `INSERT OR IGNORE INTO fee_configs
              (asset_code, fee_context, fee_type, flat_amount, percentage_rate, min_fee, max_fee, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
            [row.asset_code, row.fee_context, row.fee_type, row.flat_amount, row.percentage_rate, row.min_fee, row.max_fee],
            (err) => { if (err) reject(err); else resolve(); }
          );
        });
      }
    } finally {
      db.close();
    }
  }

  // Get the active fee config for a given asset and context.
  // Falls back to DB `_default` row, then to hardcoded defaults.
  async getFeeConfig(assetCode, feeContext) {
    const db = this.getDatabase();
    try {
      // Try exact asset match first
      let config = await new Promise((resolve, reject) => {
        db.get(
          `SELECT * FROM fee_configs WHERE asset_code = ? AND fee_context = ? AND is_active = 1`,
          [assetCode, feeContext],
          (err, row) => { if (err) reject(err); else resolve(row); }
        );
      });

      if (config) return this._formatConfig(config);

      // Try _default for this context
      config = await new Promise((resolve, reject) => {
        db.get(
          `SELECT * FROM fee_configs WHERE asset_code = '_default' AND fee_context = ? AND is_active = 1`,
          [feeContext],
          (err, row) => { if (err) reject(err); else resolve(row); }
        );
      });

      if (config) return this._formatConfig(config);

      // Hardcoded fallback
      const contextDefaults = DEFAULT_FEE_CONFIGS[feeContext] || {};
      const fallback = contextDefaults[assetCode] || contextDefaults._default;
      if (fallback) return { asset_code: assetCode, fee_context: feeContext, ...fallback, is_active: 1 };

      return null;
    } finally {
      db.close();
    }
  }

  // Calculate a fee given an amount, asset, and context.
  async calculateFee(amount, assetCode, feeContext) {
    const config = await this.getFeeConfig(assetCode, feeContext);
    if (!config) return 0;
    return this._applyFeeConfig(config, amount);
  }

  _applyFeeConfig(config, amount) {
    let fee;
    switch (config.fee_type) {
      case 'flat':
        fee = config.flat_amount;
        break;
      case 'percentage':
        fee = amount * config.percentage_rate;
        break;
      case 'flat_plus_percentage':
        fee = config.flat_amount + (amount * config.percentage_rate);
        break;
      default:
        fee = 0;
    }

    if (config.min_fee != null && fee < config.min_fee) fee = config.min_fee;
    if (config.max_fee != null && fee > config.max_fee) fee = config.max_fee;

    return Math.round(fee * 1000000) / 1000000;
  }

  // List all fee configs, optionally filtered.
  async listConfigs(filters = {}) {
    const db = this.getDatabase();
    try {
      let query = 'SELECT * FROM fee_configs WHERE 1=1';
      const params = [];

      if (filters.asset_code) { query += ' AND asset_code = ?'; params.push(filters.asset_code); }
      if (filters.fee_context) { query += ' AND fee_context = ?'; params.push(filters.fee_context); }
      if (filters.is_active !== undefined) { query += ' AND is_active = ?'; params.push(filters.is_active ? 1 : 0); }

      query += ' ORDER BY fee_context, asset_code';

      return await new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
          if (err) reject(err); else resolve((rows || []).map(r => this._formatConfig(r)));
        });
      });
    } finally {
      db.close();
    }
  }

  // Upsert a fee config for a given asset + context.
  async upsertConfig(configData) {
    const { asset_code, fee_context, fee_type, flat_amount, percentage_rate, min_fee, max_fee } = configData;

    if (!asset_code || !fee_context || !fee_type) {
      throw new Error('asset_code, fee_context, and fee_type are required');
    }
    if (!['flat', 'percentage', 'flat_plus_percentage'].includes(fee_type)) {
      throw new Error('fee_type must be flat, percentage, or flat_plus_percentage');
    }
    if (!['network', 'processing'].includes(fee_context)) {
      throw new Error('fee_context must be network or processing');
    }

    const db = this.getDatabase();
    try {
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO fee_configs (asset_code, fee_context, fee_type, flat_amount, percentage_rate, min_fee, max_fee, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1)
           ON CONFLICT(asset_code, fee_context)
           DO UPDATE SET fee_type = excluded.fee_type,
                         flat_amount = excluded.flat_amount,
                         percentage_rate = excluded.percentage_rate,
                         min_fee = excluded.min_fee,
                         max_fee = excluded.max_fee,
                         is_active = 1,
                         updated_at = CURRENT_TIMESTAMP`,
          [asset_code, fee_context, fee_type,
           flat_amount ?? 0, percentage_rate ?? 0,
           min_fee ?? 0, max_fee ?? null],
          (err) => { if (err) reject(err); else resolve(); }
        );
      });

      return this.getFeeConfig(asset_code, fee_context);
    } finally {
      db.close();
    }
  }

  // Deactivate a fee config (soft-delete). Falls back to defaults when inactive.
  async deactivateConfig(assetCode, feeContext) {
    const db = this.getDatabase();
    try {
      const result = await new Promise((resolve, reject) => {
        db.run(
          `UPDATE fee_configs SET is_active = 0, updated_at = CURRENT_TIMESTAMP
           WHERE asset_code = ? AND fee_context = ?`,
          [assetCode, feeContext],
          function (err) { if (err) reject(err); else resolve(this.changes); }
        );
      });
      if (result === 0) throw new Error('Fee config not found');
    } finally {
      db.close();
    }
  }

  _formatConfig(row) {
    return {
      id: row.id,
      asset_code: row.asset_code,
      fee_context: row.fee_context,
      fee_type: row.fee_type,
      flat_amount: row.flat_amount,
      percentage_rate: row.percentage_rate,
      min_fee: row.min_fee,
      max_fee: row.max_fee,
      is_active: !!row.is_active,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}

module.exports = new FeeConfigService();
