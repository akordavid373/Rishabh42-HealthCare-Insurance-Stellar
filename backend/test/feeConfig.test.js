const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const TEST_DB_PATH = path.join(__dirname, '../test_fee_config.db');

// Point services at the test database before requiring them.
process.env.DB_PATH = TEST_DB_PATH;

const feeConfigService = require('../services/feeConfigService');

function createFeeConfigTable() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(TEST_DB_PATH);
    db.run(
      `CREATE TABLE IF NOT EXISTS fee_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        asset_code TEXT NOT NULL,
        fee_context TEXT NOT NULL CHECK (fee_context IN ('network', 'processing')),
        fee_type TEXT NOT NULL CHECK (fee_type IN ('flat', 'percentage', 'flat_plus_percentage')),
        flat_amount REAL DEFAULT 0,
        percentage_rate REAL DEFAULT 0,
        min_fee REAL DEFAULT 0,
        max_fee REAL,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(asset_code, fee_context)
      )`,
      (err) => {
        db.close();
        if (err) reject(err); else resolve();
      }
    );
  });
}

describe('FeeConfigService', () => {
  beforeAll(async () => {
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    await createFeeConfigTable();
  });

  afterAll(() => {
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  describe('seedDefaults()', () => {
    it('should seed default fee configs without errors', async () => {
      await feeConfigService.seedDefaults();
      const configs = await feeConfigService.listConfigs();
      expect(configs.length).toBeGreaterThanOrEqual(5); // 4 network + 1 processing default
    });

    it('should be idempotent (run twice without duplicating)', async () => {
      const configsBefore = await feeConfigService.listConfigs();
      await feeConfigService.seedDefaults();
      const configsAfter = await feeConfigService.listConfigs();
      expect(configsAfter.length).toBe(configsBefore.length);
    });
  });

  describe('getFeeConfig()', () => {
    it('should return XLM network fee config from DB', async () => {
      const config = await feeConfigService.getFeeConfig('XLM', 'network');
      expect(config).not.toBeNull();
      expect(config.asset_code).toBe('XLM');
      expect(config.fee_context).toBe('network');
      expect(config.fee_type).toBe('percentage');
      expect(config.percentage_rate).toBe(0.00001);
    });

    it('should return USDC network fee config from DB', async () => {
      const config = await feeConfigService.getFeeConfig('USDC', 'network');
      expect(config).not.toBeNull();
      expect(config.asset_code).toBe('USDC');
      expect(config.percentage_rate).toBe(0.001);
    });

    it('should fall back to _default for processing context', async () => {
      const config = await feeConfigService.getFeeConfig('USD', 'processing');
      expect(config).not.toBeNull();
      expect(config.fee_type).toBe('percentage');
      expect(config.percentage_rate).toBe(0.029);
    });

    it('should return ETH network fee config from DB', async () => {
      const config = await feeConfigService.getFeeConfig('ETH', 'network');
      expect(config).not.toBeNull();
      expect(config.percentage_rate).toBe(0.002);
    });
  });

  describe('calculateFee()', () => {
    it('should calculate percentage-based fee for XLM', async () => {
      const fee = await feeConfigService.calculateFee(1000, 'XLM', 'network');
      // 1000 * 0.00001 = 0.01
      expect(fee).toBeCloseTo(0.01, 6);
    });

    it('should calculate percentage-based processing fee', async () => {
      const fee = await feeConfigService.calculateFee(100, 'USD', 'processing');
      // 100 * 0.029 = 2.9
      expect(fee).toBeCloseTo(2.9, 6);
    });

    it('should return 0 for unknown asset with no fallback', async () => {
      const fee = await feeConfigService.calculateFee(100, 'UNKNOWN_ASSET', 'network');
      expect(fee).toBe(0);
    });
  });

  describe('upsertConfig()', () => {
    it('should create a new flat fee config for USDC processing', async () => {
      const config = await feeConfigService.upsertConfig({
        asset_code: 'USDC',
        fee_context: 'processing',
        fee_type: 'flat',
        flat_amount: 0.50,
        percentage_rate: 0,
      });
      expect(config.asset_code).toBe('USDC');
      expect(config.fee_type).toBe('flat');
      expect(config.flat_amount).toBe(0.50);
    });

    it('should calculate flat fee correctly after upsert', async () => {
      const fee = await feeConfigService.calculateFee(5000, 'USDC', 'processing');
      expect(fee).toBe(0.50); // flat $0.50 regardless of amount
    });

    it('should update existing config on conflict', async () => {
      await feeConfigService.upsertConfig({
        asset_code: 'USDC',
        fee_context: 'processing',
        fee_type: 'flat_plus_percentage',
        flat_amount: 0.25,
        percentage_rate: 0.01,
      });
      const fee = await feeConfigService.calculateFee(1000, 'USDC', 'processing');
      // 0.25 + (1000 * 0.01) = 0.25 + 10 = 10.25
      expect(fee).toBeCloseTo(10.25, 6);
    });

    it('should reject invalid fee_type', async () => {
      await expect(feeConfigService.upsertConfig({
        asset_code: 'XLM',
        fee_context: 'network',
        fee_type: 'invalid',
      })).rejects.toThrow('fee_type must be');
    });

    it('should reject invalid fee_context', async () => {
      await expect(feeConfigService.upsertConfig({
        asset_code: 'XLM',
        fee_context: 'invalid',
        fee_type: 'flat',
      })).rejects.toThrow('fee_context must be');
    });

    it('should reject missing required fields', async () => {
      await expect(feeConfigService.upsertConfig({
        fee_context: 'network',
        fee_type: 'flat',
      })).rejects.toThrow('required');
    });
  });

  describe('min_fee and max_fee caps', () => {
    it('should enforce min_fee', async () => {
      await feeConfigService.upsertConfig({
        asset_code: 'MIN_TEST',
        fee_context: 'processing',
        fee_type: 'percentage',
        percentage_rate: 0.001,
        min_fee: 5.00,
      });
      // 100 * 0.001 = 0.10, but min_fee = 5.00
      const fee = await feeConfigService.calculateFee(100, 'MIN_TEST', 'processing');
      expect(fee).toBe(5.00);
    });

    it('should enforce max_fee', async () => {
      await feeConfigService.upsertConfig({
        asset_code: 'MAX_TEST',
        fee_context: 'processing',
        fee_type: 'percentage',
        percentage_rate: 0.10,
        max_fee: 50.00,
      });
      // 1000 * 0.10 = 100, but max_fee = 50.00
      const fee = await feeConfigService.calculateFee(1000, 'MAX_TEST', 'processing');
      expect(fee).toBe(50.00);
    });
  });

  describe('deactivateConfig()', () => {
    it('should deactivate a fee config', async () => {
      await feeConfigService.upsertConfig({
        asset_code: 'DEACT_TEST',
        fee_context: 'network',
        fee_type: 'flat',
        flat_amount: 1.00,
      });
      await feeConfigService.deactivateConfig('DEACT_TEST', 'network');

      // Should now fall back to hardcoded default (no match -> 0)
      const fee = await feeConfigService.calculateFee(100, 'DEACT_TEST', 'network');
      expect(fee).toBe(0);
    });

    it('should throw when deactivating non-existent config', async () => {
      await expect(
        feeConfigService.deactivateConfig('NONEXISTENT', 'network')
      ).rejects.toThrow('Fee config not found');
    });
  });

  describe('listConfigs()', () => {
    it('should list all configs', async () => {
      const configs = await feeConfigService.listConfigs();
      expect(Array.isArray(configs)).toBe(true);
      expect(configs.length).toBeGreaterThan(0);
    });

    it('should filter by asset_code', async () => {
      const configs = await feeConfigService.listConfigs({ asset_code: 'XLM' });
      configs.forEach(c => expect(c.asset_code).toBe('XLM'));
    });

    it('should filter by fee_context', async () => {
      const configs = await feeConfigService.listConfigs({ fee_context: 'network' });
      configs.forEach(c => expect(c.fee_context).toBe('network'));
    });

    it('should filter by is_active', async () => {
      const active = await feeConfigService.listConfigs({ is_active: true });
      active.forEach(c => expect(c.is_active).toBe(true));
    });
  });
});
