const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const iotService = require('../services/iotHealthMonitoringService');

const router = express.Router();

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
};

// Register IoT device
router.post('/devices',
  body('patient_id').isInt({ min: 1 }),
  body('device_type').isIn(['heart_rate_monitor', 'blood_pressure', 'glucose_meter', 'pulse_oximeter', 'thermometer', 'multi_sensor']),
  body('device_name').isString().notEmpty(),
  body('manufacturer').isString().notEmpty(),
  body('model').isString().notEmpty(),
  validate,
  async (req, res, next) => {
    try {
      const device = await iotService.registerDevice(req.body.patient_id, req.body);
      req.io?.emit('device-registered', { patient_id: req.body.patient_id, device });
      res.status(201).json(device);
    } catch (err) { next(err); }
  }
);

// Get patient devices
router.get('/devices/patient/:patientId',
  param('patientId').isInt({ min: 1 }),
  validate,
  async (req, res, next) => {
    try {
      const devices = await iotService.getDevices(req.params.patientId);
      res.json(devices);
    } catch (err) { next(err); }
  }
);

// Update device status
router.patch('/devices/:deviceId/status',
  param('deviceId').isUUID(),
  body('status').isIn(['active', 'inactive', 'maintenance']),
  validate,
  async (req, res, next) => {
    try {
      const result = await iotService.updateDeviceStatus(req.params.deviceId, req.body.status);
      res.json(result);
    } catch (err) { next(err); }
  }
);

// Ingest health reading from device
router.post('/readings/:deviceId',
  param('deviceId').isUUID(),
  body('readings').isObject(),
  validate,
  async (req, res, next) => {
    try {
      const result = await iotService.ingestReading(req.params.deviceId, req.body.readings);
      if (result.alerts.length > 0) {
        req.io?.to(`patient-${result.alerts[0]?.patient_id}`).emit('health-alert', result.alerts);
      }
      res.status(201).json(result);
    } catch (err) { next(err); }
  }
);

// Get patient readings
router.get('/readings/patient/:patientId',
  param('patientId').isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 500 }),
  query('offset').optional().isInt({ min: 0 }),
  validate,
  async (req, res, next) => {
    try {
      const result = await iotService.getPatientReadings(req.params.patientId, req.query);
      res.json(result);
    } catch (err) { next(err); }
  }
);

// Get active alerts for patient
router.get('/alerts/patient/:patientId',
  param('patientId').isInt({ min: 1 }),
  validate,
  async (req, res, next) => {
    try {
      const alerts = await iotService.getActiveAlerts(req.params.patientId);
      res.json(alerts);
    } catch (err) { next(err); }
  }
);

// Acknowledge alert
router.patch('/alerts/:alertId/acknowledge',
  param('alertId').isUUID(),
  validate,
  async (req, res, next) => {
    try {
      const result = await iotService.acknowledgeAlert(req.params.alertId, req.user?.id);
      res.json(result);
    } catch (err) { next(err); }
  }
);

// Trigger emergency response
router.post('/emergency',
  body('patient_id').isInt({ min: 1 }),
  body('alert_id').isUUID(),
  validate,
  async (req, res, next) => {
    try {
      const response = await iotService.triggerEmergencyResponse(
        req.body.patient_id, req.body.alert_id, req.user?.id
      );
      req.io?.to(`patient-${req.body.patient_id}`).emit('emergency-response', response);
      res.status(201).json(response);
    } catch (err) { next(err); }
  }
);

module.exports = router;
