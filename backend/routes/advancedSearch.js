const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const searchService = require('../services/advancedSearchService');

const router = express.Router();
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
};

// Full-text / semantic search
router.get('/',
  query('q').isString().notEmpty().withMessage('Query parameter q is required'),
  query('entity_types').optional().isString(),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('offset').optional().isInt({ min: 0 }),
  query('patient_id').optional().isInt({ min: 1 }),
  validate,
  async (req, res, next) => {
    try {
      const { q, entity_types, limit, offset, patient_id, ...filters } = req.query;
      const types = entity_types ? entity_types.split(',') : undefined;
      const result = await searchService.search(q, { entity_types: types, limit, offset, patient_id, filters });
      res.json(result);
    } catch (err) { next(err); }
  }
);

// Faceted search (POST for complex filter payloads)
router.post('/faceted',
  body('query').isString().notEmpty(),
  body('entity_types').optional().isArray(),
  body('filters').optional().isObject(),
  body('limit').optional().isInt({ min: 1, max: 100 }),
  body('offset').optional().isInt({ min: 0 }),
  validate,
  async (req, res, next) => {
    try {
      const result = await searchService.search(req.body.query, req.body);
      res.json(result);
    } catch (err) { next(err); }
  }
);

// Intelligent recommendations for a patient
router.get('/recommendations/:patientId',
  param('patientId').isInt({ min: 1 }),
  validate,
  async (req, res, next) => {
    try {
      const result = await searchService.getRecommendations(req.params.patientId, req.query);
      res.json(result);
    } catch (err) { next(err); }
  }
);

// Search analytics
router.get('/analytics',
  query('hours').optional().isInt({ min: 1, max: 720 }),
  validate,
  async (req, res, next) => {
    try {
      const analytics = await searchService.getSearchAnalytics(req.query.hours);
      res.json(analytics);
    } catch (err) { next(err); }
  }
);

module.exports = router;
