const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../database/healthcare.db');

const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'XLM', 'ETH', 'BTC', 'USDC'];
const CRYPTO_CURRENCIES = ['XLM', 'ETH', 'BTC', 'USDC'];

class AdvancedPaymentService {
  getDatabase() {
    return new sqlite3.Database(DB_PATH);
  }

  async initiatePayment(paymentData) {
    const db = this.getDatabase();
    const transactionId = uuidv4();
    try {
      if (!SUPPORTED_CURRENCIES.includes(paymentData.currency)) {
        throw new Error(`Unsupported currency. Supported: ${SUPPORTED_CURRENCIES.join(', ')}`);
      }

      const fraudScore = await this.runFraudCheck(paymentData);
      if (fraudScore.risk_level === 'high') {
        await this.logTransaction(db, transactionId, paymentData, 'blocked', fraudScore);
        throw new Error('Transaction blocked due to high fraud risk');
      }

      const isCrypto = CRYPTO_CURRENCIES.includes(paymentData.currency);
      const settlement = isCrypto
        ? await this.processCryptoPayment(paymentData, transactionId)
        : await this.processFiatPayment(paymentData, transactionId);

      const status = settlement.instant ? 'completed' : 'pending';
      await this.logTransaction(db, transactionId, paymentData, status, fraudScore, settlement);

      return {
        transaction_id: transactionId,
        status,
        currency: paymentData.currency,
        amount: paymentData.amount,
        settlement,
        fraud_score: fraudScore.score,
        created_at: new Date().toISOString()
      };
    } finally {
      db.close();
    }
  }

  async runFraudCheck(paymentData) {
    const db = this.getDatabase();
    try {
      // Check recent transaction velocity
      const recentCount = await new Promise((resolve, reject) => {
        db.get(
          `SELECT COUNT(*) as count FROM advanced_payment_transactions
           WHERE payer_id = ? AND created_at >= datetime('now', '-1 hour')`,
          [paymentData.payer_id],
          (err, row) => { if (err) reject(err); else resolve(row ? row.count : 0); }
        );
      });

      let score = 0;
      const flags = [];

      if (recentCount > 10) { score += 40; flags.push('high_velocity'); }
      if (paymentData.amount > 10000) { score += 20; flags.push('large_amount'); }
      if (CRYPTO_CURRENCIES.includes(paymentData.currency) && paymentData.amount > 5000) {
        score += 15; flags.push('large_crypto');
      }
      if (!paymentData.payer_id) { score += 30; flags.push('anonymous_payer'); }

      return {
        score,
        risk_level: score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low',
        flags
      };
    } finally {
      db.close();
    }
  }

  async processCryptoPayment(paymentData, transactionId) {
    // Simulate Stellar/crypto settlement
    const txHash = crypto.createHash('sha256')
      .update(`${transactionId}${Date.now()}`)
      .digest('hex');

    return {
      type: 'crypto',
      network: paymentData.currency === 'XLM' ? 'stellar' : 'blockchain',
      tx_hash: txHash,
      instant: true,
      settlement_time: new Date().toISOString(),
      network_fee: this.estimateCryptoFee(paymentData.currency, paymentData.amount)
    };
  }

  async processFiatPayment(paymentData, transactionId) {
    return {
      type: 'fiat',
      processor: 'internal',
      reference: `REF-${transactionId.slice(0, 8).toUpperCase()}`,
      instant: paymentData.payment_method === 'instant_transfer',
      settlement_time: paymentData.payment_method === 'instant_transfer'
        ? new Date().toISOString()
        : new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      processing_fee: this.calculateProcessingFee(paymentData.amount, paymentData.currency)
    };
  }

  estimateCryptoFee(currency, amount) {
    const feeRates = { XLM: 0.00001, ETH: 0.002, BTC: 0.0001, USDC: 0.001 };
    return (feeRates[currency] || 0.001) * amount;
  }

  calculateProcessingFee(amount, currency) {
    return Math.round(amount * 0.029 * 100) / 100; // 2.9% standard
  }

  async logTransaction(db, transactionId, paymentData, status, fraudScore, settlement = {}) {
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO advanced_payment_transactions
          (transaction_id, payer_id, payee_id, amount, currency, payment_method, status,
           fraud_score, fraud_flags, settlement_data, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [transactionId, paymentData.payer_id, paymentData.payee_id,
         paymentData.amount, paymentData.currency,
         paymentData.payment_method || 'standard',
         status, fraudScore.score,
         JSON.stringify(fraudScore.flags || []),
         JSON.stringify(settlement)],
        (err) => { if (err) reject(err); else resolve(); }
      );
    });
  }

  async getTransaction(transactionId) {
    const db = this.getDatabase();
    try {
      const tx = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM advanced_payment_transactions WHERE transaction_id = ?',
          [transactionId], (err, row) => { if (err) reject(err); else resolve(row); });
      });
      if (!tx) throw new Error('Transaction not found');
      return {
        ...tx,
        fraud_flags: JSON.parse(tx.fraud_flags || '[]'),
        settlement_data: JSON.parse(tx.settlement_data || '{}')
      };
    } finally {
      db.close();
    }
  }

  async getTransactionHistory(payerId, options = {}) {
    const db = this.getDatabase();
    const { limit = 50, offset = 0, currency, status } = options;
    try {
      let query = 'SELECT * FROM advanced_payment_transactions WHERE payer_id = ?';
      const params = [payerId];
      if (currency) { query += ' AND currency = ?'; params.push(currency); }
      if (status) { query += ' AND status = ?'; params.push(status); }
      query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(parseInt(limit), parseInt(offset));

      const rows = await new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => { if (err) reject(err); else resolve(rows); });
      });

      return rows.map(r => ({
        ...r,
        fraud_flags: JSON.parse(r.fraud_flags || '[]'),
        settlement_data: JSON.parse(r.settlement_data || '{}')
      }));
    } finally {
      db.close();
    }
  }

  async convertCurrency(amount, fromCurrency, toCurrency) {
    // Simulated exchange rates (in production, fetch from live API)
    const rates = {
      USD: 1, EUR: 0.92, GBP: 0.79,
      XLM: 8.5, ETH: 0.00035, BTC: 0.000016, USDC: 1
    };
    if (!rates[fromCurrency] || !rates[toCurrency]) {
      throw new Error('Unsupported currency pair');
    }
    const usdAmount = amount / rates[fromCurrency];
    const converted = usdAmount * rates[toCurrency];
    return {
      from: fromCurrency, to: toCurrency,
      original_amount: amount,
      converted_amount: Math.round(converted * 1000000) / 1000000,
      rate: rates[toCurrency] / rates[fromCurrency],
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = new AdvancedPaymentService();
