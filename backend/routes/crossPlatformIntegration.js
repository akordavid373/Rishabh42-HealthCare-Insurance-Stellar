const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const integrationService = require('../services/crossPlatformIntegrationService');

const router = express.Router();

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
};

// Register a new platform integration
router.post('/integrations',
  body('platform_name').isString().notEmpty(),
  body('platform_type').isIn(['EHR', 'LIS', 'RIS', 'PACS', 'PMS', 'PHARMACY', 'INSURANCE']),
  body('data_standard').isIn(['HL7_FHIR', 'HL7_V2', 'DICOM', 'ICD10', 'CPT', 'SNOMED']),
  body('endpoint_url').isURL(),
  body('auth_type').optional().isIn(['api_key', 'bearer', 'basic', 'none']),
  validate,
  async (req, res, next) => {
    try {
      const integration = await integrationService.registerIntegration(req.body);
      res.status(201).json(integration);
    } catch (err) { next(err); }
  }
);

// List integrations
router.get('/integrations',
  query('platform_type').optional().isString(),
  query('status').optional().isIn(['active', 'inactive', 'error']),
  validate,
  async (req, res, next) => {
    try {
      const integrations = await integrationService.getIntegrations(req.query);
      res.json(integrations);
    } catch (err) { next(err); }
  }
);

// Update integration status
router.patch('/integrations/:integrationId/status',
  param('integrationId').isUUID(),
  body('status').isIn(['active', 'inactive']),
  validate,
  async (req, res, next) => {
    try {
      const result = await integrationService.updateIntegrationStatus(
        req.params.integrationId, req.body.status
      );
      res.json(result);
    } catch (err) { next(err); }
  }
);

// Trigger data sync
router.post('/integrations/:integrationId/sync',
  param('integrationId').isUUID(),
  body('direction').optional().isIn(['inbound', 'outbound', 'bidirectional']),
  body('records').optional().isArray(),
  validate,
  async (req, res, next) => {
    try {
      const result = await integrationService.syncData(req.params.integrationId, req.body);
      req.io?.emit('integration-sync', { integration_id: req.params.integrationId, result });
      res.json(result);
    } catch (err) { next(err); }
  }
);

// Get sync logs for an integration
router.get('/integrations/:integrationId/logs',
  param('integrationId').isUUID(),
  query('limit').optional().isInt({ min: 1, max: 200 }),
  validate,
  async (req, res, next) => {
    try {
      const logs = await integrationService.getSyncLogs(
        req.params.integrationId, req.query.limit
      );
      res.json(logs);
    } catch (err) { next(err); }
  }
);

module.exports = router;
