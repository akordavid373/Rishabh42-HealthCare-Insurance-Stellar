const express = require('express');
const fraudDetectionService = require('../services/fraudDetectionService');
const { setCache, deleteCache } = require('../middleware/cache');

const router = express.Router();

router.post('/analyze/:claimId', async (req, res, next) => {
  const { claimId } = req.params;
  
  try {
    const analysis = await fraudDetectionService.analyzeClaimFraud(parseInt(claimId));
    
    deleteCache('/api/claims');
    deleteCache(`/api/claims/${claimId}`);
    deleteCache('/api/fraud-detection/flagged');
    
    if (req.io) {
      req.io.emit('fraud-analysis-complete', {
        claimId,
        riskLevel: analysis.risk_level,
        riskScore: analysis.risk_score,
        message: `Fraud analysis completed with ${analysis.risk_level} risk level`
      });
    }
    
    res.json({
      message: 'Fraud analysis completed successfully',
      analysis: analysis
    });
  } catch (error) {
    console.error('Error in fraud analysis:', error);
    next(error);
  }
});

router.get('/analysis/:claimId', async (req, res, next) => {
  const { claimId } = req.params;
  
  try {
    const analysis = await fraudDetectionService.getFraudAnalysis(parseInt(claimId));
    
    if (!analysis) {
      return res.status(404).json({ error: 'Fraud analysis not found for this claim' });
    }
    
    if (analysis.flags) {
      try {
        analysis.flags = JSON.parse(analysis.flags);
      } catch (e) {
        analysis.flags = [];
      }
    }
    
    if (analysis.analysis_details) {
      try {
        analysis.analysis_details = JSON.parse(analysis.analysis_details);
      } catch (e) {
        analysis.analysis_details = {};
      }
    }
    
    if (analysis.pattern_data) {
      try {
        analysis.pattern_data = JSON.parse(analysis.pattern_data);
      } catch (e) {
        analysis.pattern_data = {};
      }
    }
    
    if (analysis.anomaly_data) {
      try {
        analysis.anomaly_data = JSON.parse(analysis.anomaly_data);
      } catch (e) {
        analysis.anomaly_data = {};
      }
    }
    
    setCache(req.originalUrl, analysis);
    res.json(analysis);
  } catch (error) {
    console.error('Error retrieving fraud analysis:', error);
    next(error);
  }
});

router.get('/flagged', async (req, res, next) => {
  const { status, severity, limit = 50, offset = 0 } = req.query;
  
  try {
    let flaggedClaims = await fraudDetectionService.getFlaggedClaims();
    
    if (status) {
      flaggedClaims = flaggedClaims.filter(claim => claim.flag_status === status);
    }
    
    if (severity) {
      flaggedClaims = flaggedClaims.filter(claim => claim.flag_severity === severity);
    }
    
    const totalCount = flaggedClaims.length;
    const paginatedClaims = flaggedClaims.slice(parseInt(offset), parseInt(offset) + parseInt(limit));
    
    const result = {
      flagged_claims: paginatedClaims,
      pagination: {
        total: totalCount,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + parseInt(limit) < totalCount
      }
    };
    
    setCache(req.originalUrl, result);
    res.json(result);
  } catch (error) {
    console.error('Error retrieving flagged claims:', error);
    next(error);
  }
});

router.get('/thresholds', async (req, res, next) => {
  try {
    const thresholds = await fraudDetectionService.getFraudThresholds();
    
    setCache(req.originalUrl, thresholds);
    res.json(thresholds);
  } catch (error) {
    console.error('Error retrieving fraud thresholds:', error);
    next(error);
  }
});

router.put('/thresholds', async (req, res, next) => {
  const {
    max_monthly_claims,
    max_single_claim_amount,
    risk_score_threshold,
    frequency_penalty,
    amount_penalty,
    pattern_penalty,
    timing_penalty,
    amount_anomaly_threshold,
    timing_anomaly_hours,
    provider_anomaly_threshold
  } = req.body;
  
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required to update thresholds' });
    }
    
    const thresholds = {
      max_monthly_claims: max_monthly_claims || 5,
      max_single_claim_amount: max_single_claim_amount || 10000,
      risk_score_threshold: risk_score_threshold || 50,
      frequency_penalty: frequency_penalty || 10,
      amount_penalty: amount_penalty || 20,
      pattern_penalty: pattern_penalty || 30,
      timing_penalty: timing_penalty || 15,
      amount_anomaly_threshold: amount_anomaly_threshold || 2.0,
      timing_anomaly_hours: timing_anomaly_hours || 24,
      provider_anomaly_threshold: provider_anomaly_threshold || 10
    };
    
    await fraudDetectionService.updateFraudThresholds(thresholds, req.user.id);
    
    deleteCache('/api/fraud-detection/thresholds');
    
    if (req.io) {
      req.io.emit('fraud-thresholds-updated', {
        message: 'Fraud detection thresholds have been updated',
        thresholds: thresholds
      });
    }
    
    res.json({
      message: 'Fraud thresholds updated successfully',
      thresholds: thresholds
    });
  } catch (error) {
    console.error('Error updating fraud thresholds:', error);
    next(error);
  }
});

router.put('/flagged/:claimId/resolve', async (req, res, next) => {
  const { claimId } = req.params;
  const { reviewNotes, status = 'resolved' } = req.body;
  
  try {
    if (!['admin', 'provider'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin or provider access required to resolve flagged claims' });
    }
    
    await fraudDetectionService.removeFlaggedClaim(
      parseInt(claimId),
      req.user.id,
      reviewNotes || 'Claim reviewed and resolved'
    );
    
    deleteCache('/api/fraud-detection/flagged');
    deleteCache(`/api/fraud-detection/analysis/${claimId}`);
    deleteCache(`/api/claims/${claimId}`);
    
    if (req.io) {
      req.io.emit('flagged-claim-resolved', {
        claimId,
        resolvedBy: req.user.first_name + ' ' + req.user.last_name,
        message: `Flagged claim ${claimId} has been resolved`
      });
    }
    
    res.json({
      message: 'Flagged claim resolved successfully',
      claimId: parseInt(claimId),
      status: status
    });
  } catch (error) {
    console.error('Error resolving flagged claim:', error);
    next(error);
  }
});

router.get('/dashboard/summary', async (req, res, next) => {
  try {
    const flaggedClaims = await fraudDetectionService.getFlaggedClaims();
    const thresholds = await fraudDetectionService.getFraudThresholds();
    
    const summary = {
      total_flagged_claims: flaggedClaims.length,
      pending_review: flaggedClaims.filter(c => c.flag_status === 'pending').length,
      under_review: flaggedClaims.filter(c => c.flag_status === 'under_review').length,
      high_risk_claims: flaggedClaims.filter(c => c.risk_level === 'high' || c.risk_level === 'critical').length,
      critical_claims: flaggedClaims.filter(c => c.risk_level === 'critical').length,
      risk_distribution: {
        low: flaggedClaims.filter(c => c.risk_level === 'low').length,
        medium: flaggedClaims.filter(c => c.risk_level === 'medium').length,
        high: flaggedClaims.filter(c => c.risk_level === 'high').length,
        critical: flaggedClaims.filter(c => c.risk_level === 'critical').length
      },
      severity_distribution: {
        low: flaggedClaims.filter(c => c.flag_severity === 'low').length,
        medium: flaggedClaims.filter(c => c.flag_severity === 'medium').length,
        high: flaggedClaims.filter(c => c.flag_severity === 'high').length,
        critical: flaggedClaims.filter(c => c.flag_severity === 'critical').length
      },
      current_thresholds: thresholds,
      recent_activity: flaggedClaims.slice(0, 10).map(claim => ({
        claim_id: claim.claim_id,
        claim_number: claim.claim_number,
        patient_name: claim.patient_name,
        risk_score: claim.risk_score,
        risk_level: claim.risk_level,
        flag_severity: claim.flag_severity,
        created_at: claim.created_at
      }))
    };
    
    setCache(req.originalUrl, summary);
    res.json(summary);
  } catch (error) {
    console.error('Error retrieving fraud dashboard summary:', error);
    next(error);
  }
});

router.get('/patient/:patientId/pattern', async (req, res, next) => {
  const { patientId } = req.params;
  
  try {
    const pattern = await fraudDetectionService.analyzeClaimPattern(parseInt(patientId));
    
    setCache(req.originalUrl, pattern);
    res.json(pattern);
  } catch (error) {
    console.error('Error retrieving patient claim pattern:', error);
    next(error);
  }
});

router.get('/stats', async (req, res, next) => {
  const { period = '30' } = req.query;
  
  try {
    const flaggedClaims = await fraudDetectionService.getFlaggedClaims();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(period));
    
    const recentClaims = flaggedClaims.filter(claim => 
      new Date(claim.created_at) >= cutoffDate
    );
    
    const stats = {
      period_days: parseInt(period),
      total_analyzed: recentClaims.length,
      average_risk_score: recentClaims.length > 0 
        ? recentClaims.reduce((sum, c) => sum + c.risk_score, 0) / recentClaims.length 
        : 0,
      high_risk_rate: recentClaims.length > 0 
        ? (recentClaims.filter(c => c.risk_level === 'high' || c.risk_level === 'critical').length / recentClaims.length) * 100 
        : 0,
      most_common_flags: this.getMostCommonFlags(recentClaims),
      risk_trend: this.calculateRiskTrend(recentClaims),
      provider_analysis: this.analyzeProviderPatterns(recentClaims)
    };
    
    setCache(req.originalUrl, stats);
    res.json(stats);
  } catch (error) {
    console.error('Error retrieving fraud stats:', error);
    next(error);
  }
});

function getMostCommonFlags(claims) {
  const flagCounts = {};
  
  claims.forEach(claim => {
    try {
      const flags = JSON.parse(claim.flags || '[]');
      flags.forEach(flag => {
        flagCounts[flag.type] = (flagCounts[flag.type] || 0) + 1;
      });
    } catch (e) {
      // Skip invalid flag data
    }
  });
  
  return Object.entries(flagCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([type, count]) => ({ type, count }));
}

function calculateRiskTrend(claims) {
  const sortedClaims = claims.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const midpoint = Math.floor(sortedClaims.length / 2);
  
  const firstHalf = sortedClaims.slice(0, midpoint);
  const secondHalf = sortedClaims.slice(midpoint);
  
  const firstHalfAvg = firstHalf.length > 0 
    ? firstHalf.reduce((sum, c) => sum + c.risk_score, 0) / firstHalf.length 
    : 0;
  const secondHalfAvg = secondHalf.length > 0 
    ? secondHalf.reduce((sum, c) => sum + c.risk_score, 0) / secondHalf.length 
    : 0;
  
  return {
    first_half_average: firstHalfAvg,
    second_half_average: secondHalfAvg,
    trend: secondHalfAvg > firstHalfAvg ? 'increasing' : secondHalfAvg < firstHalfAvg ? 'decreasing' : 'stable',
    change_percent: firstHalfAvg > 0 ? ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100 : 0
  };
}

function analyzeProviderPatterns(claims) {
  const providerStats = {};
  
  claims.forEach(claim => {
    if (!providerStats[claim.provider_name]) {
      providerStats[claim.provider_name] = {
        claim_count: 0,
        total_amount: 0,
        risk_scores: [],
        flagged_count: 0
      };
    }
    
    const stats = providerStats[claim.provider_name];
    stats.claim_count++;
    stats.total_amount += claim.total_amount;
    stats.risk_scores.push(claim.risk_score);
    stats.flagged_count++;
  });
  
  return Object.entries(providerStats)
    .map(([provider, stats]) => ({
      provider,
      claim_count: stats.claim_count,
      total_amount: stats.total_amount,
      average_risk_score: stats.risk_scores.reduce((sum, score) => sum + score, 0) / stats.risk_scores.length,
      flagged_rate: (stats.flagged_count / stats.claim_count) * 100
    }))
    .sort((a, b) => b.flagged_rate - a.flagged_rate)
    .slice(0, 10);
}

module.exports = router;
