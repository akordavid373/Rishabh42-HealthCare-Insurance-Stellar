const express = require('express');
const router = express.Router();
const advancedCacheService = require('../services/advancedCacheService');
const { authenticateToken } = require('../middleware/auth');
const feeConfigService = require('../services/feeConfigService');
const insuranceMarketplaceService = require('../services/insuranceMarketplaceService');



// Middleware to check if user is admin
const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ error: 'Access denied. Admin privileges required.' });
  }
};

/**
 * @route GET /api/cache/metrics
 * @desc Get basic cache performance metrics
 */
router.get('/metrics', authenticateToken, isAdmin, (req, res) => {
  res.json(advancedCacheService.getMetrics());
});

/**
 * @route GET /api/cache/analytics
 * @desc Get detailed cache analytics
 */
router.get('/analytics', authenticateToken, isAdmin, (req, res) => {
  const metrics = advancedCacheService.getMetrics();
  
  // Calculate some additional insights
  const insights = {
    performance: metrics.hitRatio > 0.8 ? 'Excellent' : metrics.hitRatio > 0.5 ? 'Good' : 'Needs Optimization',
    recommendation: metrics.hitRatio < 0.3 ? 'Increase TTL or expand warmed data set' : 'None',
    healthStatus: metrics.redisStatus === 'connected' ? 'Healthy' : 'Degraded (L1 Only)'
  };

  res.json({
    ...metrics,
    insights,
    timestamp: new Date().toISOString()
  });
});

/**
 * @route POST /api/cache/warm
 * @desc Trigger cache warming for specific resources
 */
router.post('/warm', authenticateToken, isAdmin, async (req, res) => {
  const { resources } = req.body; // Array of resource types: ['insurance_plans', 'fee_configs']
  
  if (!resources || !Array.isArray(resources)) {
    return res.status(400).json({ error: 'Resources array is required' });
  }

  const warmingTasks = [];

  if (resources.includes('fee_configs')) {
    warmingTasks.push({
      key: '/api/fee-configs',
      fetcher: () => feeConfigService.listConfigs(),
      options: { ttl: 3600 }
    });
  }

  if (resources.includes('insurance_plans')) {
    warmingTasks.push({
      key: '/api/marketplace/search',
      fetcher: () => insuranceMarketplaceService.searchPolicies(),
      options: { ttl: 3600 }
    });
  }

  // Add more resources as needed...

  if (warmingTasks.length === 0) {
    return res.status(400).json({ error: 'No valid resources specified for warming' });
  }

  advancedCacheService.warmCache(warmingTasks);
  
  res.json({ 
    message: 'Cache warming started', 
    resources: warmingTasks.map(t => t.key),
    taskCount: warmingTasks.length 
  });
});


/**
 * @route POST /api/cache/invalidate
 * @desc Invalidate cache by pattern
 */
router.post('/invalidate', authenticateToken, isAdmin, async (req, res) => {
  const { pattern } = req.body;
  if (!pattern) return res.status(400).json({ error: 'Pattern is required' });

  const success = await advancedCacheService.invalidate(pattern);
  res.json({ success, pattern });
});

module.exports = router;
