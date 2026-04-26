const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const feeConfigService = require('../services/feeConfigService');

const router = express.Router();

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
};

// List all fee configs, with optional filters
router.get('/',
  query('asset_code').optional().isString(),
  query('fee_context').optional().isIn(['network', 'processing']),
  query('is_active').optional().isBoolean(),
  validate,
  async (req, res, next) => {
    try {
      const filters = {};
      if (req.query.asset_code) filters.asset_code = req.query.asset_code;
      if (req.query.fee_context) filters.fee_context = req.query.fee_context;
      if (req.query.is_active !== undefined) filters.is_active = req.query.is_active === 'true';

      const configs = await feeConfigService.listConfigs(filters);
      res.json(configs);
    } catch (err) { next(err); }
  }
);

// Get fee config for a specific asset and context
router.get('/:assetCode/:feeContext',
  param('assetCode').isString().notEmpty(),
  param('feeContext').isIn(['network', 'processing']),
  validate,
  async (req, res, next) => {
    try {
      const config = await feeConfigService.getFeeConfig(req.params.assetCode, req.params.feeContext);
      if (!config) return res.status(404).json({ error: 'Fee config not found' });
      res.json(config);
    } catch (err) { next(err); }
  }
);

// Calculate fee for a given amount, asset, and context
router.get('/calculate/:assetCode/:feeContext',
  param('assetCode').isString().notEmpty(),
  param('feeContext').isIn(['network', 'processing']),
  query('amount').isFloat({ min: 0 }),
  validate,
  async (req, res, next) => {
    try {
      const amount = parseFloat(req.query.amount);
      const fee = await feeConfigService.calculateFee(amount, req.params.assetCode, req.params.feeContext);
      const config = await feeConfigService.getFeeConfig(req.params.assetCode, req.params.feeContext);
      res.json({
        asset_code: req.params.assetCode,
        fee_context: req.params.feeContext,
        amount,
        fee,
        config
      });
    } catch (err) { next(err); }
  }
);

// Create or update a fee config
router.put('/',
  body('asset_code').isString().notEmpty(),
  body('fee_context').isIn(['network', 'processing']),
  body('fee_type').isIn(['flat', 'percentage', 'flat_plus_percentage']),
  body('flat_amount').optional().isFloat({ min: 0 }),
  body('percentage_rate').optional().isFloat({ min: 0 }),
  body('min_fee').optional().isFloat({ min: 0 }),
  body('max_fee').optional().isFloat({ min: 0 }),
  validate,
  async (req, res, next) => {
    try {
      const config = await feeConfigService.upsertConfig(req.body);
      res.json(config);
    } catch (err) {
      if (err.message.includes('required') || err.message.includes('must be')) {
        return res.status(400).json({ error: err.message });
      }
      next(err);
    }
  }
);

// Deactivate a fee config (soft-delete, reverts to default behavior)
router.delete('/:assetCode/:feeContext',
  param('assetCode').isString().notEmpty(),
  param('feeContext').isIn(['network', 'processing']),
  validate,
  async (req, res, next) => {
    try {
      await feeConfigService.deactivateConfig(req.params.assetCode, req.params.feeContext);
      res.json({ message: 'Fee config deactivated' });
    } catch (err) {
      if (err.message === 'Fee config not found') return res.status(404).json({ error: err.message });
      next(err);
    }
  }
);

// Seed default fee configs
router.post('/seed',
  async (req, res, next) => {
    try {
      await feeConfigService.seedDefaults();
      const configs = await feeConfigService.listConfigs();
      res.json({ message: 'Default fee configs seeded', configs });
    } catch (err) { next(err); }
  }
);

module.exports = router;
