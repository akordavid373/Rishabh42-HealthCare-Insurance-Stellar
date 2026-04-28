const express = require('express');
const router = express.Router();
const backupService = require('../services/backupService');
const { authenticateToken } = require('../middleware/auth');

// Middleware to check if user is admin (assuming role-based access)
const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ error: 'Access denied. Admin privileges required.' });
  }
};

/**
 * @route POST /api/backup/trigger
 * @desc Manually trigger a database backup
 */
router.post('/trigger', authenticateToken, isAdmin, async (req, res, next) => {
  try {
    const result = await backupService.performBackup();
    
    // Simulate replication if requested
    if (req.body.replicate) {
      result.replication = await backupService.replicateToRemoteRegion(result.path);
    }
    
    res.json({
      message: 'Backup completed successfully',
      backup: {
        fileName: result.fileName,
        verified: result.verified,
        timestamp: result.timestamp,
        replication: result.replication
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/backup/list
 * @desc List all available backups
 */
router.get('/list', authenticateToken, isAdmin, (req, res) => {
  try {
    const backups = backupService.listBackups();
    res.json(backups);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/backup/verify
 * @desc Verify a specific backup file
 */
router.post('/verify', authenticateToken, isAdmin, async (req, res) => {
  const { fileName } = req.body;
  if (!fileName) return res.status(400).json({ error: 'File name is required' });

  try {
    const backups = backupService.listBackups();
    const backup = backups.find(b => b.fileName === fileName);
    
    if (!backup) return res.status(404).json({ error: 'Backup file not found' });

    const isValid = await backupService.verifyBackup(backup.path);
    res.json({ fileName, isValid, verifiedAt: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/backup/test-recovery
 * @desc Run a full recovery test cycle
 */
router.post('/test-recovery', authenticateToken, isAdmin, async (req, res) => {
  try {
    const report = await backupService.runRecoveryTest();
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/backup/dr-plan
 * @desc Get the Disaster Recovery Plan
 */
router.get('/dr-plan', authenticateToken, (req, res) => {
  // In a real app, this might read from a DB or file
  res.json({
    planName: 'Healthcare Patient Dashboard Disaster Recovery Plan',
    lastUpdated: '2026-04-28',
    version: '1.0.0',
    recoveryTimeObjective: '4 hours',
    recoveryPointObjective: '24 hours',
    backupFrequency: 'Daily',
    encryption: 'AES-256-GCM',
    storage: 'Local + Cross-Region (Simulated S3)'
  });
});

module.exports = router;
