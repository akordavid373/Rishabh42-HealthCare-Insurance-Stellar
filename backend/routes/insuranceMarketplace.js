const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const marketplaceService = require('../services/insuranceMarketplaceService');

const router = express.Router();

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
};

// List a new insurance policy
router.post('/policies',
  body('provider_id').notEmpty(),
  body('policy_name').isString().notEmpty(),
  body('policy_type').isIn(['health', 'dental', 'vision', 'life', 'disability', 'critical_illness']),
  body('coverage_amount').isFloat({ min: 1000 }),
  body('monthly_premium').isFloat({ min: 1 }),
  body('deductible').optional().isFloat({ min: 0 }),
  validate,
  async (req, res, next) => {
    try {
      const policy = await marketplaceService.listPolicy(req.body);
      res.status(201).json(policy);
    } catch (err) { next(err); }
  }
);

// Search/browse policies
router.get('/policies',
  query('policy_type').optional().isString(),
  query('max_premium').optional().isFloat({ min: 0 }),
  query('min_coverage').optional().isFloat({ min: 0 }),
  query('max_deductible').optional().isFloat({ min: 0 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  validate,
  async (req, res, next) => {
    try {
      const policies = await marketplaceService.searchPolicies(req.query);
      res.json(policies);
    } catch (err) { next(err); }
  }
);

// Compare multiple policies
router.post('/policies/compare',
  body('policy_ids').isArray({ min: 2, max: 5 }),
  body('policy_ids.*').isUUID(),
  validate,
  async (req, res, next) => {
    try {
      const result = await marketplaceService.comparePolicies(req.body.policy_ids);
      res.json(result);
    } catch (err) { next(err); }
  }
);

// Submit policy rating
router.post('/policies/:policyId/ratings',
  param('policyId').isUUID(),
  body('rating').isInt({ min: 1, max: 5 }),
  body('review').optional().isString().isLength({ max: 1000 }),
  validate,
  async (req, res, next) => {
    try {
      const result = await marketplaceService.submitRating(
        req.params.policyId, req.user?.id, req.body.rating, req.body.review
      );
      res.status(201).json(result);
    } catch (err) { next(err); }
  }
);

// Automated underwriting
router.post('/underwriting',
  body('patient_id').isInt({ min: 1 }),
  body('policy_id').isUUID(),
  validate,
  async (req, res, next) => {
    try {
      const result = await marketplaceService.runUnderwriting(
        req.body.patient_id, req.body.policy_id
      );
      res.json(result);
    } catch (err) { next(err); }
  }
);

// File a dispute
router.post('/disputes',
  body('policy_id').isUUID(),
  body('reason').isString().notEmpty(),
  body('description').isString().isLength({ min: 10, max: 2000 }),
  validate,
  async (req, res, next) => {
    try {
      const dispute = await marketplaceService.fileDispute(
        req.body.policy_id, req.user?.id, req.body
      );
      res.status(201).json(dispute);
    } catch (err) { next(err); }
  }
);

// Get disputes
router.get('/disputes',
  query('policy_id').optional().isUUID(),
  query('status').optional().isIn(['open', 'under_review', 'resolved', 'closed']),
  validate,
  async (req, res, next) => {
    try {
      const disputes = await marketplaceService.getDisputes({
        ...req.query,
        user_id: req.user?.id
      });
      res.json(disputes);
    } catch (err) { next(err); }
  }
);

module.exports = router;
