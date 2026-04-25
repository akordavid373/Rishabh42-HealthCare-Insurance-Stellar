const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const paymentService = require('../services/advancedPaymentService');

const router = express.Router();

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
};

// Initiate a payment (fiat or crypto)
router.post('/initiate',
  body('payer_id').notEmpty(),
  body('payee_id').notEmpty(),
  body('amount').isFloat({ min: 0.01 }),
  body('currency').isIn(['USD', 'EUR', 'GBP', 'XLM', 'ETH', 'BTC', 'USDC']),
  body('payment_method').optional().isIn(['standard', 'instant_transfer', 'crypto']),
  validate,
  async (req, res, next) => {
    try {
      const result = await paymentService.initiatePayment(req.body);
      req.io?.emit('payment-initiated', { transaction_id: result.transaction_id, status: result.status });
      res.status(201).json(result);
    } catch (err) {
      if (err.message.includes('blocked')) return res.status(403).json({ error: err.message });
      next(err);
    }
  }
);

// Get transaction by ID
router.get('/transactions/:transactionId',
  param('transactionId').isUUID(),
  validate,
  async (req, res, next) => {
    try {
      const tx = await paymentService.getTransaction(req.params.transactionId);
      res.json(tx);
    } catch (err) {
      if (err.message === 'Transaction not found') return res.status(404).json({ error: err.message });
      next(err);
    }
  }
);

// Get transaction history for a payer
router.get('/history/:payerId',
  param('payerId').notEmpty(),
  query('limit').optional().isInt({ min: 1, max: 200 }),
  query('offset').optional().isInt({ min: 0 }),
  query('currency').optional().isString(),
  query('status').optional().isIn(['pending', 'completed', 'failed', 'blocked']),
  validate,
  async (req, res, next) => {
    try {
      const history = await paymentService.getTransactionHistory(req.params.payerId, req.query);
      res.json(history);
    } catch (err) { next(err); }
  }
);

// Currency conversion
router.get('/convert',
  query('amount').isFloat({ min: 0 }),
  query('from').isString().notEmpty(),
  query('to').isString().notEmpty(),
  validate,
  async (req, res, next) => {
    try {
      const result = await paymentService.convertCurrency(
        parseFloat(req.query.amount), req.query.from, req.query.to
      );
      res.json(result);
    } catch (err) {
      if (err.message.includes('Unsupported')) return res.status(400).json({ error: err.message });
      next(err);
    }
  }
);

module.exports = router;
