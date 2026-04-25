const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { createHash } = require('crypto');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../database/healthcare.db');

class AnomalyDetectionService {
  constructor() {
    this.db = null;
    this.anomalyModels = new Map();
    this.baselineData = new Map();
    this.detectionThresholds = {
      statistical: 2.5, // Standard deviations
      behavioral: 0.7,   // Similarity threshold
      temporal: 0.8,     // Time-based anomaly threshold
      volume: 3.0,       // Volume multiplier
      pattern: 0.6       // Pattern deviation threshold
    };
  }

  getDatabase() {
    if (!this.db) {
      this.db = new sqlite3.Database(DB_PATH);
    }
    return this.db;
  }

  // Initialize anomaly detection tables
  async initializeTables() {
    const db = this.getDatabase();
    
    const tables = [
      `CREATE TABLE IF NOT EXISTS anomaly_baselines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        baseline_type TEXT NOT NULL,
        baseline_data TEXT NOT NULL,
        sample_size INTEGER NOT NULL,
        confidence_level REAL DEFAULT 0.95,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(entity_type, entity_id, baseline_type)
      )`,
      
      `CREATE TABLE IF NOT EXISTS detected_anomalies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        anomaly_type TEXT NOT NULL,
        severity TEXT NOT NULL,
        anomaly_score REAL NOT NULL,
        description TEXT NOT NULL,
        raw_data TEXT NOT NULL,
        baseline_data TEXT NOT NULL,
        detection_method TEXT NOT NULL,
        status TEXT DEFAULT 'open',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        resolved_at DATETIME,
        resolved_by INTEGER,
        FOREIGN KEY (resolved_by) REFERENCES users (id)
      )`,
      
      `CREATE TABLE IF NOT EXISTS anomaly_patterns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pattern_type TEXT NOT NULL,
        pattern_data TEXT NOT NULL,
        frequency INTEGER DEFAULT 1,
        last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_malicious BOOLEAN DEFAULT FALSE,
        confidence REAL DEFAULT 0.5
      )`,
      
      `CREATE TABLE IF NOT EXISTS anomaly_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        metric_name TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        metric_value REAL NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        context TEXT
      )`
    ];

    for (const table of tables) {
      await new Promise((resolve, reject) => {
        db.run(table, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  }

  // Record metric for anomaly detection
  async recordMetric(entityType, entityId, metricName, value, context = {}) {
    const db = this.getDatabase();
    
    try {
      await new Promise((resolve, reject) => {
        const query = `
          INSERT INTO anomaly_metrics (metric_name, entity_type, entity_id, metric_value, context)
          VALUES (?, ?, ?, ?, ?)
        `;
        
        db.run(query, [metricName, entityType, entityId, value, JSON.stringify(context)], function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        });
      });

      // Check for anomalies in real-time
      const anomalies = await this.detectAnomalies(entityType, entityId, metricName, value, context);
      
      // Record detected anomalies
      for (const anomaly of anomalies) {
        await this.recordAnomaly(entityType, entityId, anomaly);
      }

      return anomalies;
    } catch (error) {
      console.error('Error recording metric:', error);
      throw error;
    }
  }

  // Detect anomalies using multiple methods
  async detectAnomalies(entityType, entityId, metricName, value, context) {
    const anomalies = [];
    
    // Get baseline data
    const baseline = await this.getBaseline(entityType, entityId, metricName);
    
    if (!baseline || !baseline.isEstablished) {
      // No baseline established, create one
      await this.updateBaseline(entityType, entityId, metricName, value);
      return [];
    }

    // Statistical anomaly detection
    const statisticalAnomaly = this.detectStatisticalAnomaly(value, baseline);
    if (statisticalAnomaly.detected) {
      anomalies.push({
        type: 'statistical',
        severity: this.calculateSeverity(statisticalAnomaly.zScore),
        score: statisticalAnomaly.zScore,
        description: statisticalAnomaly.description,
        method: 'statistical',
        data: statisticalAnomaly
      });
    }

    // Behavioral anomaly detection
    const behavioralAnomaly = await this.detectBehavioralAnomaly(entityType, entityId, metricName, value, context, baseline);
    if (behavioralAnomaly.detected) {
      anomalies.push({
        type: 'behavioral',
        severity: behavioralAnomaly.severity,
        score: behavioralAnomaly.score,
        description: behavioralAnomaly.description,
        method: 'behavioral',
        data: behavioralAnomaly
      });
    }

    // Temporal anomaly detection
    const temporalAnomaly = this.detectTemporalAnomaly(value, context.timestamp, baseline);
    if (temporalAnomaly.detected) {
      anomalies.push({
        type: 'temporal',
        severity: temporalAnomaly.severity,
        score: temporalAnomaly.score,
        description: temporalAnomaly.description,
        method: 'temporal',
        data: temporalAnomaly
      });
    }

    // Volume anomaly detection
    const volumeAnomaly = await this.detectVolumeAnomaly(entityType, entityId, metricName, value, baseline);
    if (volumeAnomaly.detected) {
      anomalies.push({
        type: 'volume',
        severity: volumeAnomaly.severity,
        score: volumeAnomaly.score,
        description: volumeAnomaly.description,
        method: 'volume',
        data: volumeAnomaly
      });
    }

    // Pattern anomaly detection
    const patternAnomaly = await this.detectPatternAnomaly(entityType, entityId, metricName, value, context, baseline);
    if (patternAnomaly.detected) {
      anomalies.push({
        type: 'pattern',
        severity: patternAnomaly.severity,
        score: patternAnomaly.score,
        description: patternAnomaly.description,
        method: 'pattern',
        data: patternAnomaly
      });
    }

    return anomalies;
  }

  // Statistical anomaly detection using Z-score
  detectStatisticalAnomaly(value, baseline) {
    const baselineData = JSON.parse(baseline.baseline_data);
    const mean = baselineData.mean || 0;
    const stdDev = baselineData.stdDev || 1;
    
    if (stdDev === 0) {
      return { detected: false };
    }

    const zScore = Math.abs((value - mean) / stdDev);
    
    if (zScore > this.detectionThresholds.statistical) {
      return {
        detected: true,
        zScore: zScore,
        mean: mean,
        stdDev: stdDev,
        description: `Statistical anomaly detected: value ${value} is ${zScore.toFixed(2)} standard deviations from mean ${mean.toFixed(2)}`
      };
    }

    return { detected: false };
  }

  // Behavioral anomaly detection
  async detectBehavioralAnomaly(entityType, entityId, metricName, value, context, baseline) {
    const recentBehavior = await this.getRecentBehavior(entityType, entityId, metricName, 24); // Last 24 hours
    
    if (recentBehavior.length < 5) {
      return { detected: false }; // Not enough data
    }

    // Calculate behavioral similarity
    const similarity = this.calculateBehavioralSimilarity(value, context, recentBehavior);
    
    if (similarity < this.detectionThresholds.behavioral) {
      return {
        detected: true,
        score: 1 - similarity,
        similarity: similarity,
        description: `Behavioral anomaly detected: similarity score ${similarity.toFixed(2)} below threshold ${this.detectionThresholds.behavioral}`,
        recent_behavior: recentBehavior.slice(0, 10)
      };
    }

    return { detected: false };
  }

  // Temporal anomaly detection
  detectTemporalAnomaly(value, timestamp, baseline) {
    const baselineData = JSON.parse(baseline.baseline_data);
    const temporalPatterns = baselineData.temporalPatterns || {};
    
    if (!timestamp || !temporalPatterns.hourly) {
      return { detected: false };
    }

    const hour = new Date(timestamp).getHours();
    const dayOfWeek = new Date(timestamp).getDay();
    
    const expectedRange = temporalPatterns.hourly[hour] || temporalPatterns.daily[dayOfWeek];
    
    if (!expectedRange) {
      return { detected: false };
    }

    const { min, max, mean } = expectedRange;
    
    if (value < min || value > max) {
      const deviation = Math.max(Math.abs(value - min), Math.abs(value - max));
      const score = deviation / (max - min);
      
      return {
        detected: true,
        score: score,
        expected_range: { min, max, mean },
        actual_value: value,
        description: `Temporal anomaly detected: value ${value} outside expected range [${min.toFixed(2)}, ${max.toFixed(2)}] for hour ${hour}`
      };
    }

    return { detected: false };
  }

  // Volume anomaly detection
  async detectVolumeAnomaly(entityType, entityId, metricName, value, baseline) {
    const recentVolume = await this.getRecentVolume(entityType, entityId, metricName, 1); // Last hour
    
    if (recentVolume.length === 0) {
      return { detected: false };
    }

    const currentHourlyVolume = recentVolume.length;
    const baselineData = JSON.parse(baseline.baseline_data);
    const typicalHourlyVolume = baselineData.avgHourlyVolume || 1;
    
    const volumeMultiplier = currentHourlyVolume / typicalHourlyVolume;
    
    if (volumeMultiplier > this.detectionThresholds.volume) {
      return {
        detected: true,
        score: volumeMultiplier,
        current_volume: currentHourlyVolume,
        typical_volume: typicalHourlyVolume,
        description: `Volume anomaly detected: ${currentHourlyVolume} events in last hour, ${volumeMultiplier.toFixed(2)}x typical volume`
      };
    }

    return { detected: false };
  }

  // Pattern anomaly detection
  async detectPatternAnomaly(entityType, entityId, metricName, value, context, baseline) {
    const recentPatterns = await this.getRecentPatterns(entityType, entityId, metricName, 7); // Last 7 days
    
    if (recentPatterns.length < 3) {
      return { detected: false };
    }

    const currentPattern = this.extractPattern(value, context);
    const patternSimilarity = this.calculatePatternSimilarity(currentPattern, recentPatterns);
    
    if (patternSimilarity < this.detectionThresholds.pattern) {
      return {
        detected: true,
        score: 1 - patternSimilarity,
        similarity: patternSimilarity,
        current_pattern: currentPattern,
        description: `Pattern anomaly detected: pattern similarity ${patternSimilarity.toFixed(2)} below threshold ${this.detectionThresholds.pattern}`
      };
    }

    return { detected: false };
  }

  // Get baseline data
  async getBaseline(entityType, entityId, metricName) {
    const db = this.getDatabase();
    
    return new Promise((resolve, reject) => {
      const query = `
        SELECT * FROM anomaly_baselines 
        WHERE entity_type = ? AND entity_id = ? AND baseline_type = ?
      `;
      
      db.get(query, [entityType, entityId, metricName], (err, row) => {
        if (err) {
          reject(err);
        } else {
          if (row) {
            const baselineData = JSON.parse(row.baseline_data || '{}');
            resolve({
              ...row,
              baselineData: baselineData,
              isEstablished: row.sample_size >= 30 // Minimum 30 samples for reliable baseline
            });
          } else {
            resolve(null);
          }
        }
      });
    });
  }

  // Update baseline data
  async updateBaseline(entityType, entityId, metricName, newValue) {
    const db = this.getDatabase();
    
    try {
      const existingBaseline = await this.getBaseline(entityType, entityId, metricName);
      
      if (existingBaseline) {
        // Update existing baseline
        const baselineData = existingBaseline.baselineData;
        const newSampleSize = existingBaseline.sample_size + 1;
        
        // Update statistical measures
        this.updateStatisticalMeasures(baselineData, newValue, newSampleSize);
        
        // Update temporal patterns
        await this.updateTemporalPatterns(baselineData, entityType, entityId, metricName);
        
        // Update volume patterns
        await this.updateVolumePatterns(baselineData, entityType, entityId, metricName);
        
        await new Promise((resolve, reject) => {
          const query = `
            UPDATE anomaly_baselines 
            SET baseline_data = ?, sample_size = ?, updated_at = CURRENT_TIMESTAMP
            WHERE entity_type = ? AND entity_id = ? AND baseline_type = ?
          `;
          
          db.run(query, [
            JSON.stringify(baselineData),
            newSampleSize,
            entityType,
            entityId,
            metricName
          ], (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      } else {
        // Create new baseline
        const baselineData = {
          values: [newValue],
          mean: newValue,
          stdDev: 0,
          min: newValue,
          max: newValue,
          temporalPatterns: {},
          volumePatterns: {}
        };
        
        await new Promise((resolve, reject) => {
          const query = `
            INSERT INTO anomaly_baselines (entity_type, entity_id, baseline_type, baseline_data, sample_size)
            VALUES (?, ?, ?, ?, ?)
          `;
          
          db.run(query, [entityType, entityId, metricName, JSON.stringify(baselineData), 1], function(err) {
            if (err) reject(err);
            else resolve(this.lastID);
          });
        });
      }
    } catch (error) {
      console.error('Error updating baseline:', error);
      throw error;
    }
  }

  // Update statistical measures
  updateStatisticalMeasures(baselineData, newValue, sampleSize) {
    const values = baselineData.values || [];
    values.push(newValue);
    
    // Keep only last 1000 values to prevent memory issues
    if (values.length > 1000) {
      values.shift();
    }
    
    baselineData.values = values;
    
    // Calculate new mean
    const sum = values.reduce((acc, val) => acc + val, 0);
    baselineData.mean = sum / values.length;
    
    // Calculate standard deviation
    const variance = values.reduce((acc, val) => acc + Math.pow(val - baselineData.mean, 2), 0) / values.length;
    baselineData.stdDev = Math.sqrt(variance);
    
    // Update min and max
    baselineData.min = Math.min(...values);
    baselineData.max = Math.max(...values);
  }

  // Update temporal patterns
  async updateTemporalPatterns(baselineData, entityType, entityId, metricName) {
    const db = this.getDatabase();
    
    return new Promise((resolve, reject) => {
      const query = `
        SELECT metric_value, timestamp FROM anomaly_metrics 
        WHERE entity_type = ? AND entity_id = ? AND metric_name = ?
        AND timestamp >= datetime('now', '-30 days')
      `;
      
      db.all(query, [entityType, entityId, metricName], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }

        const hourlyPatterns = {};
        const dailyPatterns = {};
        
        rows.forEach(row => {
          const timestamp = new Date(row.timestamp);
          const hour = timestamp.getHours();
          const dayOfWeek = timestamp.getDay();
          const value = row.metric_value;
          
          // Hourly patterns
          if (!hourlyPatterns[hour]) {
            hourlyPatterns[hour] = [];
          }
          hourlyPatterns[hour].push(value);
          
          // Daily patterns
          if (!dailyPatterns[dayOfWeek]) {
            dailyPatterns[dayOfWeek] = [];
          }
          dailyPatterns[dayOfWeek].push(value);
        });
        
        // Calculate statistics for each pattern
        const calculateStats = (values) => {
          if (values.length === 0) return { min: 0, max: 0, mean: 0, count: 0 };
          
          const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
          const min = Math.min(...values);
          const max = Math.max(...values);
          
          return { min, max, mean, count: values.length };
        };
        
        baselineData.temporalPatterns = {
          hourly: Object.keys(hourlyPatterns).reduce((acc, hour) => {
            acc[hour] = calculateStats(hourlyPatterns[hour]);
            return acc;
          }, {}),
          daily: Object.keys(dailyPatterns).reduce((acc, day) => {
            acc[day] = calculateStats(dailyPatterns[day]);
            return acc;
          }, {})
        };
        
        resolve();
      });
    });
  }

  // Update volume patterns
  async updateVolumePatterns(baselineData, entityType, entityId, metricName) {
    const db = this.getDatabase();
    
    return new Promise((resolve, reject) => {
      const query = `
        SELECT COUNT(*) as hourly_count, 
               strftime('%H', timestamp) as hour
        FROM anomaly_metrics 
        WHERE entity_type = ? AND entity_id = ? AND metric_name = ?
        AND timestamp >= datetime('now', '-7 days')
        GROUP BY hour
      `;
      
      db.all(query, [entityType, entityId, metricName], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }

        const hourlyVolumes = rows.map(row => row.hourly_count);
        
        if (hourlyVolumes.length > 0) {
          baselineData.avgHourlyVolume = hourlyVolumes.reduce((sum, val) => sum + val, 0) / hourlyVolumes.length;
          baselineData.maxHourlyVolume = Math.max(...hourlyVolumes);
          baselineData.minHourlyVolume = Math.min(...hourlyVolumes);
        }
        
        resolve();
      });
    });
  }

  // Get recent behavior for comparison
  async getRecentBehavior(entityType, entityId, metricName, hours) {
    const db = this.getDatabase();
    
    return new Promise((resolve, reject) => {
      const query = `
        SELECT metric_value, context, timestamp FROM anomaly_metrics 
        WHERE entity_type = ? AND entity_id = ? AND metric_name = ?
        AND timestamp >= datetime('now', '-${hours} hours')
        ORDER BY timestamp DESC
        LIMIT 50
      `;
      
      db.all(query, [entityType, entityId, metricName], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          const behavior = rows.map(row => ({
            value: row.metric_value,
            context: JSON.parse(row.context || '{}'),
            timestamp: row.timestamp
          }));
          resolve(behavior);
        }
      });
    });
  }

  // Get recent volume
  async getRecentVolume(entityType, entityId, metricName, hours) {
    const db = this.getDatabase();
    
    return new Promise((resolve, reject) => {
      const query = `
        SELECT metric_value, timestamp FROM anomaly_metrics 
        WHERE entity_type = ? AND entity_id = ? AND metric_name = ?
        AND timestamp >= datetime('now', '-${hours} hours')
      `;
      
      db.all(query, [entityType, entityId, metricName], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // Get recent patterns
  async getRecentPatterns(entityType, entityId, metricName, days) {
    const db = this.getDatabase();
    
    return new Promise((resolve, reject) => {
      const query = `
        SELECT metric_value, context, timestamp FROM anomaly_metrics 
        WHERE entity_type = ? AND entity_id = ? AND metric_name = ?
        AND timestamp >= datetime('now', '-${days} days')
        ORDER BY timestamp DESC
        LIMIT 100
      `;
      
      db.all(query, [entityType, entityId, metricName], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          const patterns = rows.map(row => this.extractPattern(row.metric_value, JSON.parse(row.context || '{}')));
          resolve(patterns);
        }
      });
    });
  }

  // Calculate behavioral similarity
  calculateBehavioralSimilarity(currentValue, currentContext, recentBehavior) {
    if (recentBehavior.length === 0) return 0;
    
    let totalSimilarity = 0;
    
    recentBehavior.forEach(behavior => {
      const valueSimilarity = this.calculateValueSimilarity(currentValue, behavior.value);
      const contextSimilarity = this.calculateContextSimilarity(currentContext, behavior.context);
      
      totalSimilarity += (valueSimilarity + contextSimilarity) / 2;
    });
    
    return totalSimilarity / recentBehavior.length;
  }

  // Calculate value similarity
  calculateValueSimilarity(value1, value2) {
    if (typeof value1 !== typeof value2) return 0;
    
    if (typeof value1 === 'number') {
      const max = Math.max(Math.abs(value1), Math.abs(value2));
      if (max === 0) return 1;
      return 1 - Math.abs(value1 - value2) / max;
    }
    
    if (typeof value1 === 'string') {
      return value1 === value2 ? 1 : 0;
    }
    
    return value1 === value2 ? 1 : 0;
  }

  // Calculate context similarity
  calculateContextSimilarity(context1, context2) {
    const keys1 = Object.keys(context1);
    const keys2 = Object.keys(context2);
    const allKeys = new Set([...keys1, ...keys2]);
    
    let similarity = 0;
    
    allKeys.forEach(key => {
      const val1 = context1[key];
      const val2 = context2[key];
      
      if (val1 === val2) {
        similarity += 1;
      } else if (typeof val1 === 'number' && typeof val2 === 'number') {
        const max = Math.max(Math.abs(val1), Math.abs(val2));
        if (max > 0) {
          similarity += 1 - Math.abs(val1 - val2) / max;
        }
      }
    });
    
    return similarity / allKeys.size;
  }

  // Extract pattern from value and context
  extractPattern(value, context) {
    return {
      value_range: this.getValueRange(value),
      time_of_day: context.timestamp ? new Date(context.timestamp).getHours() : null,
      day_of_week: context.timestamp ? new Date(context.timestamp).getDay() : null,
      user_agent: context.userAgent || null,
      ip_address: context.ipAddress || null,
      resource_type: context.resourceType || null
    };
  }

  // Get value range category
  getValueRange(value) {
    if (typeof value !== 'number') return 'non_numeric';
    
    if (value < 10) return 'very_low';
    if (value < 100) return 'low';
    if (value < 1000) return 'medium';
    if (value < 10000) return 'high';
    return 'very_high';
  }

  // Calculate pattern similarity
  calculatePatternSimilarity(currentPattern, historicalPatterns) {
    if (historicalPatterns.length === 0) return 0;
    
    let totalSimilarity = 0;
    
    historicalPatterns.forEach(pattern => {
      let similarity = 0;
      let factors = 0;
      
      // Compare value ranges
      if (currentPattern.value_range === pattern.value_range) {
        similarity += 1;
      }
      factors++;
      
      // Compare time of day
      if (currentPattern.time_of_day !== null && pattern.time_of_day !== null) {
        const hourDiff = Math.abs(currentPattern.time_of_day - pattern.time_of_day);
        similarity += Math.max(0, 1 - hourDiff / 12); // Normalize by 12 hours
      }
      factors++;
      
      // Compare day of week
      if (currentPattern.day_of_week !== null && pattern.day_of_week !== null) {
        similarity += currentPattern.day_of_week === pattern.day_of_week ? 1 : 0;
      }
      factors++;
      
      // Compare user agent
      if (currentPattern.user_agent && pattern.user_agent) {
        similarity += currentPattern.user_agent === pattern.user_agent ? 1 : 0;
      }
      factors++;
      
      // Compare IP address
      if (currentPattern.ip_address && pattern.ip_address) {
        similarity += currentPattern.ip_address === pattern.ip_address ? 1 : 0;
      }
      factors++;
      
      totalSimilarity += similarity / factors;
    });
    
    return totalSimilarity / historicalPatterns.length;
  }

  // Calculate severity based on score
  calculateSeverity(score) {
    if (score >= 4) return 'critical';
    if (score >= 3) return 'high';
    if (score >= 2) return 'medium';
    return 'low';
  }

  // Record anomaly
  async recordAnomaly(entityType, entityId, anomaly) {
    const db = this.getDatabase();
    
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO detected_anomalies 
        (entity_type, entity_id, anomaly_type, severity, anomaly_score, description, raw_data, baseline_data, detection_method)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      db.run(query, [
        entityType,
        entityId,
        anomaly.type,
        anomaly.severity,
        anomaly.score,
        anomaly.description,
        JSON.stringify(anomaly.data || {}),
        JSON.stringify({}),
        anomaly.method
      ], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }

  // Get anomalies for entity
  async getAnomalies(entityType, entityId, status = 'open', limit = 50) {
    const db = this.getDatabase();
    
    return new Promise((resolve, reject) => {
      let query = `
        SELECT * FROM detected_anomalies 
        WHERE entity_type = ? AND entity_id = ?
      `;
      const params = [entityType, entityId];
      
      if (status !== 'all') {
        query += ' AND status = ?';
        params.push(status);
      }
      
      query += ' ORDER BY created_at DESC LIMIT ?';
      params.push(limit);
      
      db.all(query, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          const anomalies = rows.map(row => ({
            ...row,
            raw_data: JSON.parse(row.raw_data || '{}'),
            baseline_data: JSON.parse(row.baseline_data || '{}')
          }));
          resolve(anomalies);
        }
      });
    });
  }

  // Get anomaly statistics
  async getAnomalyStats(period = 24) {
    const db = this.getDatabase();
    
    return new Promise((resolve, reject) => {
      const cutoffDate = new Date();
      cutoffDate.setHours(cutoffDate.getHours() - period);
      
      const query = `
        SELECT 
          COUNT(*) as total_anomalies,
          COUNT(CASE WHEN severity = 'critical' THEN 1 END) as critical_anomalies,
          COUNT(CASE WHEN severity = 'high' THEN 1 END) as high_anomalies,
          COUNT(CASE WHEN severity = 'medium' THEN 1 END) as medium_anomalies,
          COUNT(CASE WHEN severity = 'low' THEN 1 END) as low_anomalies,
          COUNT(CASE WHEN status = 'open' THEN 1 END) as open_anomalies,
          anomaly_type,
          COUNT(*) as type_count
        FROM detected_anomalies
        WHERE created_at >= ?
        GROUP BY anomaly_type
      `;
      
      db.all(query, [cutoffDate.toISOString()], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  // Close database connection
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

module.exports = new AnomalyDetectionService();
