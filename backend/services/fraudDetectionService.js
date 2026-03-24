const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../database/healthcare.db');

class FraudDetectionService {
  constructor() {
    this.db = null;
  }

  getDatabase() {
    if (!this.db) {
      this.db = new sqlite3.Database(DB_PATH);
    }
    return this.db;
  }

  async analyzeClaimFraud(claimId) {
    const db = this.getDatabase();
    
    try {
      const claim = await this.getClaimDetails(claimId);
      if (!claim) {
        throw new Error('Claim not found');
      }

      const thresholds = await this.getFraudThresholds();
      const patientPattern = await this.analyzeClaimPattern(claim.patient_id);
      const anomalies = await this.detectAnomalies(claim, patientPattern, thresholds);
      const riskScore = this.calculateRiskScore(claim, patientPattern, anomalies, thresholds);
      const riskLevel = this.determineRiskLevel(riskScore);
      const flags = this.identifyFlags(claim, patientPattern, anomalies, thresholds);

      const fraudAnalysis = {
        claim_id: claimId,
        patient_id: claim.patient_id,
        risk_score: riskScore,
        risk_level: riskLevel,
        flags: JSON.stringify(flags),
        analysis_details: JSON.stringify({
          claim_amount: claim.total_amount,
          patient_average: patientPattern.average_claim_amount,
          frequency: patientPattern.claim_frequency_monthly,
          anomalies_detected: anomalies
        }),
        pattern_data: JSON.stringify(patientPattern),
        anomaly_data: JSON.stringify(anomalies),
        created_at: new Date().toISOString()
      };

      const analysisId = await this.saveFraudAnalysis(fraudAnalysis);

      if (riskScore >= thresholds.risk_score_threshold) {
        await this.flagHighRiskClaim(claimId, analysisId, riskLevel, flags);
      }

      return {
        ...fraudAnalysis,
        id: analysisId,
        flags: flags,
        analysis_details: fraudAnalysis.analysis_details,
        pattern_data: fraudAnalysis.pattern_data,
        anomaly_data: fraudAnalysis.anomaly_data
      };

    } catch (error) {
      console.error('Error analyzing claim fraud:', error);
      throw error;
    }
  }

  async getClaimDetails(claimId) {
    const db = this.getDatabase();
    
    return new Promise((resolve, reject) => {
      const query = `
        SELECT ic.*, p.id as patient_id
        FROM insurance_claims ic
        JOIN patients p ON ic.patient_id = p.id
        WHERE ic.id = ?
      `;
      
      db.get(query, [claimId], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  async analyzeClaimPattern(patientId) {
    const db = this.getDatabase();
    
    try {
      const existingPattern = await this.getExistingPattern(patientId);
      if (existingPattern && this.isPatternRecent(existingPattern.last_analysis_date)) {
        return existingPattern;
      }

      const pattern = await this.calculateNewPattern(patientId);
      await this.updateClaimPattern(patientId, pattern);
      
      return pattern;
    } catch (error) {
      console.error('Error analyzing claim pattern:', error);
      return this.getDefaultPattern();
    }
  }

  async getExistingPattern(patientId) {
    const db = this.getDatabase();
    
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM claim_patterns WHERE patient_id = ?';
      
      db.get(query, [patientId], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  isPatternRecent(lastAnalysisDate) {
    if (!lastAnalysisDate) return false;
    
    const analysisDate = new Date(lastAnalysisDate);
    const now = new Date();
    const daysDiff = (now - analysisDate) / (1000 * 60 * 60 * 24);
    
    return daysDiff <= 7;
  }

  async calculateNewPattern(patientId) {
    const db = this.getDatabase();
    
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          COUNT(*) as total_claims,
          AVG(total_amount) as average_claim_amount,
          SUM(total_amount) as total_claimed_amount,
          COUNT(DISTINCT provider_name) as unique_providers_count,
          COUNT(DISTINCT diagnosis_codes) as claim_types_count,
          MIN(submission_date) as first_claim_date,
          MAX(submission_date) as last_claim_date
        FROM insurance_claims 
        WHERE patient_id = ?
        AND submission_date >= date('now', '-1 year')
      `;
      
      db.get(query, [patientId], (err, row) => {
        if (err) {
          reject(err);
        } else {
          const pattern = {
            patient_id: patientId,
            claim_frequency_monthly: this.calculateMonthlyFrequency(row.first_claim_date, row.last_claim_date, row.total_claims),
            average_claim_amount: row.average_claim_amount || 0,
            total_claimed_amount: row.total_claimed_amount || 0,
            unique_providers_count: row.unique_providers_count || 0,
            claim_types_count: row.claim_types_count || 0,
            pattern_risk_score: this.calculatePatternRiskScore(row),
            last_analysis_date: new Date().toISOString()
          };
          
          resolve(pattern);
        }
      });
    });
  }

  calculateMonthlyFrequency(firstDate, lastDate, totalClaims) {
    if (!firstDate || !lastDate || totalClaims === 0) return 0;
    
    const first = new Date(firstDate);
    const last = new Date(lastDate);
    const monthsDiff = Math.max(1, (last - first) / (1000 * 60 * 60 * 24 * 30));
    
    return totalClaims / monthsDiff;
  }

  calculatePatternRiskScore(pattern) {
    let score = 0;
    
    if (pattern.total_claims > 20) score += 10;
    if (pattern.unique_providers_count > 5) score += 15;
    if (pattern.claim_types_count > 10) score += 10;
    if (pattern.average_claim_amount > 5000) score += 15;
    
    return score;
  }

  async updateClaimPattern(patientId, pattern) {
    const db = this.getDatabase();
    
    return new Promise((resolve, reject) => {
      const query = `
        INSERT OR REPLACE INTO claim_patterns (
          patient_id, claim_frequency_monthly, average_claim_amount,
          total_claimed_amount, unique_providers_count, claim_types_count,
          pattern_risk_score, last_analysis_date, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `;
      
      db.run(query, [
        patientId,
        pattern.claim_frequency_monthly,
        pattern.average_claim_amount,
        pattern.total_claimed_amount,
        pattern.unique_providers_count,
        pattern.claim_types_count,
        pattern.pattern_risk_score,
        pattern.last_analysis_date
      ], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      });
    });
  }

  getDefaultPattern() {
    return {
      claim_frequency_monthly: 0,
      average_claim_amount: 0,
      total_claimed_amount: 0,
      unique_providers_count: 0,
      claim_types_count: 0,
      pattern_risk_score: 0
    };
  }

  async detectAnomalies(claim, pattern, thresholds) {
    const anomalies = {
      amount_anomaly: this.detectAmountAnomaly(claim.total_amount, pattern.average_claim_amount, thresholds.amount_anomaly_threshold),
      timing_anomaly: await this.detectTimingAnomaly(claim.patient_id, claim.submission_date, thresholds.timing_anomaly_hours),
      frequency_anomaly: this.detectFrequencyAnomaly(pattern.claim_frequency_monthly, thresholds.max_monthly_claims),
      provider_anomaly: this.detectProviderAnomaly(pattern.unique_providers_count, thresholds.provider_anomaly_threshold),
      pattern_anomaly: this.detectPatternAnomaly(claim, pattern)
    };

    return anomalies;
  }

  detectAmountAnomaly(currentAmount, averageAmount, threshold) {
    if (averageAmount === 0) return false;
    
    const ratio = currentAmount / averageAmount;
    return ratio > threshold;
  }

  async detectTimingAnomaly(patientId, currentSubmissionDate, thresholdHours) {
    const db = this.getDatabase();
    
    return new Promise((resolve, reject) => {
      const query = `
        SELECT COUNT(*) as recent_claims
        FROM insurance_claims 
        WHERE patient_id = ? 
        AND submission_date >= datetime(?, '-${thresholdHours} hours')
        AND id != (SELECT MAX(id) FROM insurance_claims WHERE patient_id = ?)
      `;
      
      db.get(query, [patientId, currentSubmissionDate, patientId], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row.recent_claims > 0);
        }
      });
    });
  }

  detectFrequencyAnomaly(monthlyFrequency, maxMonthlyClaims) {
    return monthlyFrequency > maxMonthlyClaims;
  }

  detectProviderAnomaly(uniqueProviders, threshold) {
    return uniqueProviders > threshold;
  }

  detectPatternAnomaly(claim, pattern) {
    const anomalies = [];
    
    if (pattern.unique_providers_count > 8) {
      anomalies.push('excessive_providers');
    }
    
    if (pattern.claim_types_count > 15) {
      anomalies.push('unusual_claim_variety');
    }
    
    const diagnosisArray = claim.diagnosis_codes ? claim.diagnosis_codes.split(',').map(c => c.trim()) : [];
    if (diagnosisArray.length > 5) {
      anomalies.push('excessive_diagnoses');
    }
    
    return anomalies.length > 0 ? anomalies : false;
  }

  calculateRiskScore(claim, pattern, anomalies, thresholds) {
    let score = 0;
    
    if (anomalies.amount_anomaly) score += thresholds.amount_penalty;
    if (anomalies.timing_anomaly) score += thresholds.timing_penalty;
    if (anomalies.frequency_anomaly) score += thresholds.frequency_penalty;
    if (anomalies.provider_anomaly) score += thresholds.pattern_penalty;
    if (anomalies.pattern_anomaly) score += thresholds.pattern_penalty;
    
    score += pattern.pattern_risk_score;
    
    return Math.min(100, score);
  }

  determineRiskLevel(riskScore) {
    if (riskScore <= 20) return 'low';
    if (riskScore <= 40) return 'medium';
    if (riskScore <= 60) return 'high';
    return 'critical';
  }

  identifyFlags(claim, pattern, anomalies, thresholds) {
    const flags = [];
    
    if (anomalies.amount_anomaly) {
      flags.push({
        type: 'amount_anomaly',
        description: `Claim amount $${claim.total_amount} is significantly higher than patient average $${pattern.average_claim_amount.toFixed(2)}`,
        severity: 'high'
      });
    }
    
    if (anomalies.timing_anomaly) {
      flags.push({
        type: 'timing_anomaly',
        description: 'Multiple claims submitted within short time period',
        severity: 'medium'
      });
    }
    
    if (anomalies.frequency_anomaly) {
      flags.push({
        type: 'frequency_anomaly',
        description: `Claim frequency ${pattern.claim_frequency_monthly.toFixed(2)}/month exceeds threshold of ${thresholds.max_monthly_claims}`,
        severity: 'high'
      });
    }
    
    if (anomalies.provider_anomaly) {
      flags.push({
        type: 'provider_anomaly',
        description: `Unusual number of healthcare providers: ${pattern.unique_providers_count}`,
        severity: 'medium'
      });
    }
    
    if (anomalies.pattern_anomaly) {
      flags.push({
        type: 'pattern_anomaly',
        description: 'Unusual claim pattern detected',
        severity: 'medium'
      });
    }
    
    return flags;
  }

  async getFraudThresholds() {
    const db = this.getDatabase();
    
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM fraud_thresholds ORDER BY id DESC LIMIT 1';
      
      db.get(query, [], (err, row) => {
        if (err) {
          reject(err);
        } else if (row) {
          resolve(row);
        } else {
          resolve(this.getDefaultThresholds());
        }
      });
    });
  }

  getDefaultThresholds() {
    return {
      max_monthly_claims: 5,
      max_single_claim_amount: 10000,
      risk_score_threshold: 50,
      frequency_penalty: 10,
      amount_penalty: 20,
      pattern_penalty: 30,
      timing_penalty: 15,
      amount_anomaly_threshold: 2.0,
      timing_anomaly_hours: 24,
      provider_anomaly_threshold: 10
    };
  }

  async saveFraudAnalysis(analysis) {
    const db = this.getDatabase();
    
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO fraud_analysis (
          claim_id, patient_id, risk_score, risk_level, flags,
          analysis_details, pattern_data, anomaly_data, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      db.run(query, [
        analysis.claim_id,
        analysis.patient_id,
        analysis.risk_score,
        analysis.risk_level,
        analysis.flags,
        analysis.analysis_details,
        analysis.pattern_data,
        analysis.anomaly_data,
        analysis.created_at,
        analysis.created_at
      ], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      });
    });
  }

  async flagHighRiskClaim(claimId, analysisId, riskLevel, flags) {
    const db = this.getDatabase();
    
    try {
      const flagReason = flags.map(f => f.description).join('; ');
      const severity = riskLevel === 'critical' ? 'critical' : riskLevel;
      
      await new Promise((resolve, reject) => {
        const query = `
          INSERT INTO flagged_claims (
            claim_id, fraud_analysis_id, flag_reason, flag_severity, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 'pending', ?, ?)
        `;
        
        db.run(query, [claimId, analysisId, flagReason, severity, new Date().toISOString(), new Date().toISOString()], function(err) {
          if (err) {
            reject(err);
          } else {
            resolve(this.lastID);
          }
        });
      });

      await new Promise((resolve, reject) => {
        const query = 'UPDATE insurance_claims SET status = ? WHERE id = ?';
        db.run(query, ['under_review', claimId], (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });

    } catch (error) {
      console.error('Error flagging high risk claim:', error);
      throw error;
    }
  }

  async getFlaggedClaims() {
    const db = this.getDatabase();
    
    return new Promise((resolve, reject) => {
      const query = `
        SELECT fc.*, ic.claim_number, ic.total_amount, ic.submission_date,
               fa.risk_score, fa.risk_level,
               p.first_name || ' ' || p.last_name as patient_name
        FROM flagged_claims fc
        JOIN insurance_claims ic ON fc.claim_id = ic.id
        JOIN fraud_analysis fa ON fc.fraud_analysis_id = fa.id
        JOIN patients pat ON ic.patient_id = pat.id
        JOIN users p ON pat.user_id = p.id
        WHERE fc.status IN ('pending', 'under_review')
        ORDER BY fc.created_at DESC
      `;
      
      db.all(query, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async getFraudAnalysis(claimId) {
    const db = this.getDatabase();
    
    return new Promise((resolve, reject) => {
      const query = `
        SELECT fa.*, fc.flag_reason, fc.flag_severity, fc.status as flag_status
        FROM fraud_analysis fa
        LEFT JOIN flagged_claims fc ON fa.id = fc.fraud_analysis_id
        WHERE fa.claim_id = ?
      `;
      
      db.get(query, [claimId], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  async updateFraudThresholds(thresholds, updatedBy) {
    const db = this.getDatabase();
    
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO fraud_thresholds (
          max_monthly_claims, max_single_claim_amount, risk_score_threshold,
          frequency_penalty, amount_penalty, pattern_penalty, timing_penalty,
          amount_anomaly_threshold, timing_anomaly_hours, provider_anomaly_threshold,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      db.run(query, [
        thresholds.max_monthly_claims,
        thresholds.max_single_claim_amount,
        thresholds.risk_score_threshold,
        thresholds.frequency_penalty,
        thresholds.amount_penalty,
        thresholds.pattern_penalty,
        thresholds.timing_penalty,
        thresholds.amount_anomaly_threshold,
        thresholds.timing_anomaly_hours,
        thresholds.provider_anomaly_threshold,
        new Date().toISOString()
      ], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      });
    });
  }

  async removeFlaggedClaim(claimId, reviewerId, reviewNotes) {
    const db = this.getDatabase();
    
    try {
      await new Promise((resolve, reject) => {
        const query = `
          UPDATE flagged_claims 
          SET status = 'resolved', assigned_reviewer = ?, review_date = ?, resolution_notes = ?, updated_at = ?
          WHERE claim_id = ?
        `;
        
        db.run(query, [reviewerId, new Date().toISOString(), reviewNotes, new Date().toISOString(), claimId], (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });

      await new Promise((resolve, reject) => {
        const query = `
          UPDATE fraud_analysis 
          SET reviewed = TRUE, reviewed_by = ?, review_date = ?, review_notes = ?, updated_at = ?
          WHERE claim_id = ?
        `;
        
        db.run(query, [reviewerId, new Date().toISOString(), reviewNotes, new Date().toISOString(), claimId], (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });

    } catch (error) {
      console.error('Error removing flagged claim:', error);
      throw error;
    }
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

module.exports = new FraudDetectionService();
