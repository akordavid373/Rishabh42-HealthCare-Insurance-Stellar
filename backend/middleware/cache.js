const advancedCacheService = require('../services/advancedCacheService');
const monitoringService = require('../services/monitoringService');

function cacheMiddleware(req, res, next) {
  const key = req.originalUrl;
  
  if (req.method !== 'GET') {
    return next();
  }

  // Check if encryption is needed for this route (example logic)
  const isSensitive = key.includes('/patients/') || key.includes('/medical-records/');
  const resourceType = _getResourceType(key);

  advancedCacheService.get(key, { encrypted: isSensitive })
    .then(data => {
      if (data) {
        monitoringService.cacheHitsCounter.inc({ resource_type: resourceType });
        return res.json(data);
      }
      
      monitoringService.cacheMissesCounter.inc({ resource_type: resourceType });
      next();
    })
    .catch(err => {
      console.error('Cache middleware error:', err);
      next();
    });
}

function _getResourceType(key) {
  if (key.includes('/patients')) return 'patient';
  if (key.includes('/medical-records')) return 'medical_record';
  if (key.includes('/claims')) return 'claim';
  if (key.includes('/appointments')) return 'appointment';
  if (key.includes('/payments')) return 'payment';
  return 'other';
}

function setCache(key, data, options = {}) {
  // Automatically encrypt sensitive data
  const isSensitive = key.includes('/patients/') || key.includes('/medical-records/');
  advancedCacheService.set(key, data, { ...options, encrypted: options.encrypted || isSensitive });
}

function deleteCache(pattern) {
  advancedCacheService.invalidate(pattern);
}

function clearCache() {
  advancedCacheService.invalidate(''); // Clear all
}

module.exports = {
  cacheMiddleware,
  setCache,
  deleteCache,
  clearCache
};

