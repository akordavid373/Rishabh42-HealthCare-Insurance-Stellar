const express = require('express');
const { body, query, validationResult } = require('express-validator');
const zeroTrustMiddleware = require('../middleware/zeroTrust');
const behavioralAnalysisService = require('../services/behavioralAnalysisService');
const threatIntelligenceService = require('../services/threatIntelligenceService');
const anomalyDetectionService = require('../services/anomalyDetectionService');
const incidentResponseService = require('../services/incidentResponseService');
const complianceValidationService = require('../services/complianceValidationService');
const performanceMonitoringService = require('../services/performanceMonitoringService');
const { setCache, deleteCache } = require('../middleware/cache');

const router = express.Router();

// Initialize all security services
async function initializeServices() {
  try {
    await behavioralAnalysisService.initializeTables();
    await threatIntelligenceService.initializeTables();
    await anomalyDetectionService.initializeTables();
    await incidentResponseService.initializeTables();
    await complianceValidationService.initializeTables();
    await performanceMonitoringService.initializeTables();
    console.log('Security services initialized successfully');
  } catch (error) {
    console.error('Error initializing security services:', error);
  }
}

// Initialize services on module load
initializeServices();

// Zero-Trust Authentication Routes
router.post('/auth/verify-device', async (req, res, next) => {
  const { userId, deviceName, deviceFingerprint } = req.body;
  
  try {
    if (!userId || !deviceName || !deviceFingerprint) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['userId', 'deviceName', 'deviceFingerprint']
      });
    }

    zeroTrustMiddleware.trustDevice(userId, deviceFingerprint, deviceName);
    
    res.json({
      message: 'Device trusted successfully',
      deviceName: deviceName,
      fingerprint: deviceFingerprint
    });
  } catch (error) {
    console.error('Error trusting device:', error);
    next(error);
  }
});

router.get('/auth/security-stats', zeroTrustMiddleware.zeroTrustAuth(), async (req, res, next) => {
  try {
    const stats = zeroTrustMiddleware.getSecurityStats();
    
    setCache(req.originalUrl, stats);
    res.json(stats);
  } catch (error) {
    console.error('Error getting security stats:', error);
    next(error);
  }
});

// Behavioral Analysis Routes
router.post('/behavior/record', zeroTrustMiddleware.zeroTrustAuth(), async (req, res, next) => {
  const { eventType, eventData, riskScore } = req.body;
  
  try {
    if (!eventType || !eventData) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['eventType', 'eventData']
      });
    }

    await behavioralAnalysisService.recordBehaviorEvent(
      req.user.id,
      eventType,
      eventData,
      riskScore
    );
    
    res.json({
      message: 'Behavior event recorded successfully',
      eventType: eventType,
      userId: req.user.id
    });
  } catch (error) {
    console.error('Error recording behavior event:', error);
    next(error);
  }
});

router.get('/behavior/anomalies/:userId', zeroTrustMiddleware.zeroTrustAuth(), async (req, res, next) => {
  const { userId } = req.params;
  const { status } = req.query;
  
  try {
    // Only allow users to view their own anomalies unless admin
    if (req.user.role !== 'admin' && parseInt(userId) !== req.user.id) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only view your own behavioral anomalies'
      });
    }

    const anomalies = await behavioralAnalysisService.getUserAnomalies(userId, status);
    
    setCache(req.originalUrl, anomalies);
    res.json(anomalies);
  } catch (error) {
    console.error('Error getting behavioral anomalies:', error);
    next(error);
  }
});

router.get('/behavior/stats/:userId', zeroTrustMiddleware.zeroTrustAuth(), async (req, res, next) => {
  const { userId } = req.params;
  const { period = 30 } = req.query;
  
  try {
    // Only allow users to view their own stats unless admin
    if (req.user.role !== 'admin' && parseInt(userId) !== req.user.id) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only view your own behavioral statistics'
      });
    }

    const stats = await behavioralAnalysisService.getBehavioralStats(userId, parseInt(period));
    
    setCache(req.originalUrl, stats);
    res.json(stats);
  } catch (error) {
    console.error('Error getting behavioral stats:', error);
    next(error);
  }
});

// Threat Intelligence Routes
router.post('/threat/check-ip', zeroTrustMiddleware.zeroTrustAuth(), async (req, res, next) => {
  const { ip } = req.body;
  
  try {
    if (!ip) {
      return res.status(400).json({
        error: 'Missing required field',
        required: ['ip']
      });
    }

    const reputation = await threatIntelligenceService.checkIPReputation(ip);
    
    // Create alert if high risk
    if (reputation.risk_level === 'critical' || reputation.risk_level === 'high') {
      await threatIntelligenceService.createSecurityAlert(
        'suspicious_ip',
        reputation.risk_level,
        `Suspicious IP detected: ${ip}`,
        { ip: ip, reputation: reputation },
        req.user.id
      );
    }
    
    res.json(reputation);
  } catch (error) {
    console.error('Error checking IP reputation:', error);
    next(error);
  }
});

router.post('/threat/check-domain', zeroTrustMiddleware.zeroTrustAuth(), async (req, res, next) => {
  const { domain } = req.body;
  
  try {
    if (!domain) {
      return res.status(400).json({
        error: 'Missing required field',
        required: ['domain']
      });
    }

    const reputation = await threatIntelligenceService.checkDomainReputation(domain);
    
    // Create alert if high risk
    if (reputation.risk_level === 'critical' || reputation.risk_level === 'high') {
      await threatIntelligenceService.createSecurityAlert(
        'suspicious_domain',
        reputation.risk_level,
        `Suspicious domain detected: ${domain}`,
        { domain: domain, reputation: reputation },
        req.user.id
      );
    }
    
    res.json(reputation);
  } catch (error) {
    console.error('Error checking domain reputation:', error);
    next(error);
  }
});

router.post('/threat/check-file', zeroTrustMiddleware.zeroTrustAuth(), async (req, res, next) => {
  const { fileHash, fileName } = req.body;
  
  try {
    if (!fileHash) {
      return res.status(400).json({
        error: 'Missing required field',
        required: ['fileHash']
      });
    }

    const reputation = await threatIntelligenceService.checkFileReputation(fileHash, fileName);
    
    // Create alert if malware detected
    if (reputation.malware_detected) {
      await threatIntelligenceService.createSecurityAlert(
        'malware_detected',
        'critical',
        `Malware detected in file: ${fileName || 'unknown'}`,
        { fileHash: fileHash, fileName: fileName, reputation: reputation },
        req.user.id
      );
    }
    
    res.json(reputation);
  } catch (error) {
    console.error('Error checking file reputation:', error);
    next(error);
  }
});

router.get('/threat/alerts', zeroTrustMiddleware.zeroTrustAuth(), async (req, res, next) => {
  const { status, limit = 50 } = req.query;
  
  try {
    // Only admins can view all alerts
    if (req.user.role !== 'admin') {
      const alerts = await threatIntelligenceService.getSecurityAlerts(req.user.id, status, limit);
      return res.json(alerts);
    }

    const alerts = await threatIntelligenceService.getSecurityAlerts(null, status, limit);
    
    setCache(req.originalUrl, alerts);
    res.json(alerts);
  } catch (error) {
    console.error('Error getting threat alerts:', error);
    next(error);
  }
});

router.put('/threat/alerts/:alertId/resolve', zeroTrustMiddleware.zeroTrustAuth(), async (req, res, next) => {
  const { alertId } = req.params;
  
  try {
    // Only admins can resolve alerts
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Admin access required to resolve alerts'
      });
    }

    await threatIntelligenceService.resolveSecurityAlert(alertId);
    
    deleteCache('/api/security/threat/alerts');
    
    res.json({
      message: 'Security alert resolved successfully',
      alertId: alertId
    });
  } catch (error) {
    console.error('Error resolving security alert:', error);
    next(error);
  }
});

router.get('/threat/stats', zeroTrustMiddleware.zeroTrustAuth(), async (req, res, next) => {
  const { period = 24 } = req.query;
  
  try {
    // Only admins can view threat statistics
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Admin access required to view threat statistics'
      });
    }

    const stats = await threatIntelligenceService.getThreatStats(parseInt(period));
    
    setCache(req.originalUrl, stats);
    res.json(stats);
  } catch (error) {
    console.error('Error getting threat stats:', error);
    next(error);
  }
});

// Anomaly Detection Routes
router.post('/anomaly/metric', zeroTrustMiddleware.zeroTrustAuth(), async (req, res, next) => {
  const { entityType, entityId, metricName, value, context } = req.body;
  
  try {
    if (!entityType || !entityId || !metricName || value === undefined) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['entityType', 'entityId', 'metricName', 'value']
      });
    }

    const anomalies = await anomalyDetectionService.recordMetric(
      entityType,
      entityId,
      metricName,
      value,
      context || {}
    );
    
    res.json({
      message: 'Metric recorded successfully',
      metricName: metricName,
      value: value,
      anomaliesDetected: anomalies.length,
      anomalies: anomalies
    });
  } catch (error) {
    console.error('Error recording metric:', error);
    next(error);
  }
});

router.get('/anomaly/detected', zeroTrustMiddleware.zeroTrustAuth(), async (req, res, next) => {
  const { entityType, entityId, status = 'open', limit = 50 } = req.query;
  
  try {
    // Only admins can view all anomalies
    if (req.user.role !== 'admin' && (!entityType || !entityId)) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Admin access required to view all anomalies'
      });
    }

    const anomalies = await anomalyDetectionService.getAnomalies(
      entityType,
      entityId,
      status,
      parseInt(limit)
    );
    
    setCache(req.originalUrl, anomalies);
    res.json(anomalies);
  } catch (error) {
    console.error('Error getting anomalies:', error);
    next(error);
  }
});

router.get('/anomaly/stats', zeroTrustMiddleware.zeroTrustAuth(), async (req, res, next) => {
  const { period = 24 } = req.query;
  
  try {
    // Only admins can view anomaly statistics
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Admin access required to view anomaly statistics'
      });
    }

    const stats = await anomalyDetectionService.getAnomalyStats(parseInt(period));
    
    setCache(req.originalUrl, stats);
    res.json(stats);
  } catch (error) {
    console.error('Error getting anomaly stats:', error);
    next(error);
  }
});

// Incident Response Routes
router.post('/incident/create', zeroTrustMiddleware.zeroTrustAuth(), async (req, res, next) => {
  const incidentData = req.body;
  
  try {
    if (!incidentData.incidentType || !incidentData.title || !incidentData.description) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['incidentType', 'title', 'description']
      });
    }

    const incidentId = await incidentResponseService.createIncident(incidentData, req.user.id);
    
    res.json({
      message: 'Security incident created successfully',
      incidentId: incidentId
    });
  } catch (error) {
    console.error('Error creating incident:', error);
    next(error);
  }
});

router.get('/incident/:incidentId', zeroTrustMiddleware.zeroTrustAuth(), async (req, res, next) => {
  const { incidentId } = req.params;
  
  try {
    const incident = await incidentResponseService.getIncident(incidentId);
    
    if (!incident) {
      return res.status(404).json({
        error: 'Incident not found',
        incidentId: incidentId
      });
    }
    
    setCache(req.originalUrl, incident);
    res.json(incident);
  } catch (error) {
    console.error('Error getting incident:', error);
    next(error);
  }
});

router.get('/incident/:incidentId/timeline', zeroTrustMiddleware.zeroTrustAuth(), async (req, res, next) => {
  const { incidentId } = req.params;
  
  try {
    const timeline = await incidentResponseService.getIncidentTimeline(incidentId);
    
    setCache(req.originalUrl, timeline);
    res.json(timeline);
  } catch (error) {
    console.error('Error getting incident timeline:', error);
    next(error);
  }
});

router.get('/incidents', zeroTrustMiddleware.zeroTrustAuth(), async (req, res, next) => {
  const { status = 'open', limit = 50 } = req.query;
  
  try {
    const incidents = await incidentResponseService.getActiveIncidents(status, parseInt(limit));
    
    setCache(req.originalUrl, incidents);
    res.json(incidents);
  } catch (error) {
    console.error('Error getting incidents:', error);
    next(error);
  }
});

router.put('/incident/:incidentId/resolve', zeroTrustMiddleware.zeroTrustAuth(), async (req, res, next) => {
  const { incidentId } = req.params;
  const resolutionData = req.body;
  
  try {
    await incidentResponseService.resolveIncident(incidentId, resolutionData, req.user.id);
    
    deleteCache('/api/security/incidents');
    deleteCache(`/api/security/incident/${incidentId}`);
    
    res.json({
      message: 'Incident resolved successfully',
      incidentId: incidentId
    });
  } catch (error) {
    console.error('Error resolving incident:', error);
    next(error);
  }
});

router.get('/incident/stats', zeroTrustMiddleware.zeroTrustAuth(), async (req, res, next) => {
  const { period = 30 } = req.query;
  
  try {
    // Only admins can view incident statistics
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Admin access required to view incident statistics'
      });
    }

    const stats = await incidentResponseService.getIncidentStats(parseInt(period));
    
    setCache(req.originalUrl, stats);
    res.json(stats);
  } catch (error) {
    console.error('Error getting incident stats:', error);
    next(error);
  }
});

// Compliance Validation Routes
router.post('/compliance/validate', zeroTrustMiddleware.zeroTrustAuth(), async (req, res, next) => {
  const { entityType, entityId, frameworkId } = req.body;
  
  try {
    if (!entityType || !entityId || !frameworkId) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['entityType', 'entityId', 'frameworkId']
      });
    }

    const validation = await complianceValidationService.validateCompliance(
      entityType,
      entityId,
      frameworkId,
      req.user.id
    );
    
    res.json(validation);
  } catch (error) {
    console.error('Error validating compliance:', error);
    next(error);
  }
});

router.get('/compliance/validation/:entityType/:entityId', zeroTrustMiddleware.zeroTrustAuth(), async (req, res, next) => {
  const { entityType, entityId } = req.params;
  const { frameworkId } = req.query;
  
  try {
    const results = await complianceValidationService.getValidationResults(
      entityType,
      entityId,
      frameworkId
    );
    
    setCache(req.originalUrl, results);
    res.json(results);
  } catch (error) {
    console.error('Error getting validation results:', error);
    next(error);
  }
});

router.get('/compliance/findings', zeroTrustMiddleware.zeroTrustAuth(), async (req, res, next) => {
  const { status = 'open', severity, limit = 50 } = req.query;
  
  try {
    // Only admins can view all findings
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Admin access required to view compliance findings'
      });
    }

    const findings = await complianceValidationService.getComplianceFindings(
      status,
      severity,
      parseInt(limit)
    );
    
    setCache(req.originalUrl, findings);
    res.json(findings);
  } catch (error) {
    console.error('Error getting compliance findings:', error);
    next(error);
  }
});

router.post('/compliance/report', zeroTrustMiddleware.zeroTrustAuth(), async (req, res, next) => {
  const { frameworkId, periodStart, periodEnd } = req.body;
  
  try {
    if (!frameworkId || !periodStart || !periodEnd) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['frameworkId', 'periodStart', 'periodEnd']
      });
    }

    // Only admins can generate reports
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Admin access required to generate compliance reports'
      });
    }

    const report = await complianceValidationService.generateComplianceReport(
      frameworkId,
      periodStart,
      periodEnd,
      req.user.id
    );
    
    res.json(report);
  } catch (error) {
    console.error('Error generating compliance report:', error);
    next(error);
  }
});

// Performance Monitoring Routes
router.post('/performance/metric', zeroTrustMiddleware.zeroTrustAuth(), async (req, res, next) => {
  const { metricType, metricName, value, unit, tags, source, context } = req.body;
  
  try {
    if (!metricType || !metricName || value === undefined || !unit) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['metricType', 'metricName', 'value', 'unit']
      });
    }

    const metricId = await performanceMonitoringService.recordMetric(
      metricType,
      metricName,
      value,
      unit,
      tags || {},
      source || 'api',
      context || {}
    );
    
    res.json({
      message: 'Performance metric recorded successfully',
      metricId: metricId
    });
  } catch (error) {
    console.error('Error recording performance metric:', error);
    next(error);
  }
});

router.get('/performance/metrics', zeroTrustMiddleware.zeroTrustAuth(), async (req, res, next) => {
  const { metricType, metricName, period = 24, limit = 1000 } = req.query;
  
  try {
    const metrics = await performanceMonitoringService.getMetrics(
      metricType,
      metricName,
      parseInt(period),
      parseInt(limit)
    );
    
    setCache(req.originalUrl, metrics);
    res.json(metrics);
  } catch (error) {
    console.error('Error getting performance metrics:', error);
    next(error);
  }
});

router.get('/performance/api', zeroTrustMiddleware.zeroTrustAuth(), async (req, res, next) => {
  const { endpoint, period = 24, limit = 1000 } = req.query;
  
  try {
    const metrics = await performanceMonitoringService.getAPIPerformance(
      endpoint,
      parseInt(period),
      parseInt(limit)
    );
    
    setCache(req.originalUrl, metrics);
    res.json(metrics);
  } catch (error) {
    console.error('Error getting API performance metrics:', error);
    next(error);
  }
});

router.get('/performance/alerts', zeroTrustMiddleware.zeroTrustAuth(), async (req, res, next) => {
  const { status = 'active', severity, limit = 50 } = req.query;
  
  try {
    // Only admins can view all alerts
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Admin access required to view performance alerts'
      });
    }

    const alerts = await performanceMonitoringService.getAlerts(status, severity, parseInt(limit));
    
    setCache(req.originalUrl, alerts);
    res.json(alerts);
  } catch (error) {
    console.error('Error getting performance alerts:', error);
    next(error);
  }
});

router.get('/performance/stats', zeroTrustMiddleware.zeroTrustAuth(), async (req, res, next) => {
  const { period = 24 } = req.query;
  
  try {
    // Only admins can view performance statistics
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Admin access required to view performance statistics'
      });
    }

    const stats = await performanceMonitoringService.getPerformanceStats(parseInt(period));
    
    setCache(req.originalUrl, stats);
    res.json(stats);
  } catch (error) {
    console.error('Error getting performance stats:', error);
    next(error);
  }
});

router.post('/performance/report', zeroTrustMiddleware.zeroTrustAuth(), async (req, res, next) => {
  const { period = 24 } = req.body;
  
  try {
    // Only admins can generate reports
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Admin access required to generate performance reports'
      });
    }

    const report = await performanceMonitoringService.generatePerformanceReport(
      parseInt(period),
      req.user.id
    );
    
    res.json(report);
  } catch (error) {
    console.error('Error generating performance report:', error);
    next(error);
  }
});

// Security Dashboard Summary
router.get('/dashboard', zeroTrustMiddleware.zeroTrustAuth(), async (req, res, next) => {
  try {
    // Get comprehensive security overview
    const [
      securityStats,
      threatStats,
      anomalyStats,
      incidentStats,
      performanceStats
    ] = await Promise.all([
      Promise.resolve(zeroTrustMiddleware.getSecurityStats()),
      threatIntelligenceService.getThreatStats(24),
      anomalyDetectionService.getAnomalyStats(24),
      incidentResponseService.getIncidentStats(24),
      performanceMonitoringService.getPerformanceStats(24)
    ]);

    const dashboard = {
      zero_trust: securityStats,
      threat_intelligence: threatStats,
      anomaly_detection: anomalyStats,
      incident_response: incidentStats,
      performance_monitoring: performanceStats,
      overall_health: {
        security_score: this.calculateOverallSecurityScore(securityStats, threatStats, anomalyStats),
        risk_level: this.calculateOverallRiskLevel(threatStats, anomalyStats, incidentStats),
        compliance_status: 'compliant', // This would be calculated from compliance validations
        last_updated: new Date().toISOString()
      }
    };

    setCache(req.originalUrl, dashboard);
    res.json(dashboard);
  } catch (error) {
    console.error('Error getting security dashboard:', error);
    next(error);
  }
});

// Helper functions for dashboard
function calculateOverallSecurityScore(securityStats, threatStats, anomalyStats) {
  let score = 100;
  
  // Deduct points for active threats
  score -= (threatStats.critical_alerts * 10);
  score -= (threatStats.high_alerts * 5);
  
  // Deduct points for anomalies
  score -= (anomalyStats.reduce((sum, stat) => sum + stat.total_anomalies, 0) * 2);
  
  // Deduct points for blocked IPs
  score -= (securityStats.blockedIPs * 3);
  
  return Math.max(0, Math.min(100, score));
}

function calculateOverallRiskLevel(threatStats, anomalyStats, incidentStats) {
  const criticalThreats = threatStats.critical_alerts || 0;
  const criticalIncidents = incidentStats.critical_incidents || 0;
  const totalAnomalies = anomalyStats.reduce((sum, stat) => sum + stat.total_anomalies, 0);
  
  if (criticalThreats > 0 || criticalIncidents > 0) return 'critical';
  if (threatStats.high_alerts > 5 || totalAnomalies > 50) return 'high';
  if (threatStats.high_alerts > 0 || totalAnomalies > 10) return 'medium';
  return 'low';
}

module.exports = router;
