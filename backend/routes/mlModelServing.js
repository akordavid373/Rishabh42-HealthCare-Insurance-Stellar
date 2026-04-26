const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const mlService = require('../services/mlModelServingService');

const router = express.Router();
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
};

// Register a model version
router.post('/models',
  body('name').isString().notEmpty(),
  body('version').isString().notEmpty(),
  body('model_type').isIn(['risk_scoring', 'diagnosis_assist', 'fraud_detection', 'premium_prediction', 'custom']),
  body('input_schema').optional().isObject(),
  body('output_schema').optional().isObject(),
  validate,
  async (req, res, next) => {
    try {
      const model = await mlService.registerModel(req.body);
      res.status(201).json(model);
    } catch (err) { next(err); }
  }
);

// List models
router.get('/models',
  query('name').optional().isString(),
  query('status').optional().isIn(['staging', 'production', 'deprecated', 'archived']),
  query('model_type').optional().isString(),
  validate,
  async (req, res, next) => {
    try {
      const models = await mlService.listModels(req.query);
      res.json(models);
    } catch (err) { next(err); }
  }
);

// Promote model status
router.patch('/models/:modelId/status',
  param('modelId').isUUID(),
  body('status').isIn(['staging', 'production', 'deprecated', 'archived']),
  validate,
  async (req, res, next) => {
    try {
      const result = await mlService.promoteModel(req.params.modelId, req.body.status);
      res.json(result);
    } catch (err) { next(err); }
  }
);

// Run inference
router.post('/models/:modelId/predict',
  param('modelId').isUUID(),
  body('input').isObject(),
  validate,
  async (req, res, next) => {
    try {
      const result = await mlService.predict(req.params.modelId, req.body.input, {
        ab_variant: req.body.ab_variant
      });
      res.json(result);
    } catch (err) {
      if (err.message.includes('not found')) return res.status(404).json({ error: err.message });
      next(err);
    }
  }
);

// Get model performance metrics
router.get('/models/:modelId/metrics',
  param('modelId').isUUID(),
  query('metric').optional().isString(),
  query('hours').optional().isInt({ min: 1, max: 720 }),
  validate,
  async (req, res, next) => {
    try {
      const metrics = await mlService.getModelMetrics(
        req.params.modelId, req.query.metric, req.query.hours
      );
      res.json(metrics);
    } catch (err) { next(err); }
  }
);

// Create A/B experiment
router.post('/experiments',
  body('name').isString().notEmpty(),
  body('variants').isArray({ min: 2 }),
  body('variants.*.name').isString(),
  body('variants.*.model_id').isUUID(),
  body('variants.*.weight').isFloat({ min: 0, max: 100 }),
  validate,
  async (req, res, next) => {
    try {
      const experiment = await mlService.createExperiment(req.body);
      res.status(201).json(experiment);
    } catch (err) { next(err); }
  }
);

// Get experiment results
router.get('/experiments/:experimentId/results',
  param('experimentId').isUUID(),
  validate,
  async (req, res, next) => {
    try {
      const results = await mlService.getExperimentResults(req.params.experimentId);
      res.json(results);
    } catch (err) {
      if (err.message.includes('not found')) return res.status(404).json({ error: err.message });
      next(err);
    }
  }
);

module.exports = router;
