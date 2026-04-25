const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { createHash } = require('crypto');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../database/healthcare.db');

class BehavioralAnalysisService {
  constructor() {
    this.db = null;
    this.behavioralPatterns = new Map();
    this.anomalyThresholds = {
      loginFrequency: 0.8, // 80% deviation from normal
      accessPattern: 0.7,   // 70% deviation
      dataAccess: 0.9,      // 90% deviation
      timePattern: 0.6,      // 60% deviation
      locationPattern: 0.8  // 80% deviation
    };
  }

  getDatabase() {
    if (!this.db) {
      this.db = new sqlite3.Database(DB_PATH);
    }
    return this.db;
  }

  // Initialize behavioral analysis tables
  async initializeTables() {
    const db = this.getDatabase();
    
    const tables = [
      `CREATE TABLE IF NOT EXISTS user_behavior_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        profile_data TEXT NOT NULL,
        baseline_established BOOLEAN DEFAULT FALSE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )`,
      
      `CREATE TABLE IF NOT EXISTS behavior_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        event_data TEXT NOT NULL,
        risk_score REAL DEFAULT 0,
        anomaly_detected BOOLEAN DEFAULT FALSE,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )`,
      
      `CREATE TABLE IF NOT EXISTS behavioral_anomalies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        anomaly_type TEXT NOT NULL,
        severity TEXT NOT NULL,
        description TEXT NOT NULL,
        risk_score REAL NOT NULL,
        status TEXT DEFAULT 'open',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        resolved_at DATETIME,
        resolved_by INTEGER,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )`,
      
      `CREATE TABLE IF NOT EXISTS access_patterns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        resource_type TEXT NOT NULL,
        access_frequency REAL DEFAULT 0,
        typical_access_times TEXT,
        typical_locations TEXT,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
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

  // Record user behavior event
  async recordBehaviorEvent(userId, eventType, eventData, riskScore = 0) {
    const db = this.getDatabase();
    
    try {
      const eventDataStr = JSON.stringify(eventData);
      
      await new Promise((resolve, reject) => {
        const query = `
          INSERT INTO behavior_events (user_id, event_type, event_data, risk_score, anomaly_detected)
          VALUES (?, ?, ?, ?, ?)
        `;
        
        db.run(query, [userId, eventType, eventDataStr, riskScore, false], function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        });
      });

      // Analyze for anomalies in real-time
      await this.analyzeForAnomalies(userId, eventType, eventData);
      
    } catch (error) {
      console.error('Error recording behavior event:', error);
      throw error;
    }
  }

  // Analyze user behavior for anomalies
  async analyzeForAnomalies(userId, eventType, eventData) {
    const profile = await this.getUserBehaviorProfile(userId);
    
    if (!profile || !profile.baseline_established) {
      // No baseline established yet, create one
      await this.updateBehaviorProfile(userId, eventType, eventData);
      return [];
    }

    const anomalies = [];
    
    // Analyze different aspects of behavior
    switch (eventType) {
      case 'login':
        anomalies.push(...await this.analyzeLoginBehavior(userId, eventData, profile));
        break;
      case 'data_access':
        anomalies.push(...await this.analyzeDataAccessBehavior(userId, eventData, profile));
        break;
      case 'api_access':
        anomalies.push(...await this.analyzeAPIAccessBehavior(userId, eventData, profile));
        break;
      case 'file_access':
        anomalies.push(...await this.analyzeFileAccessBehavior(userId, eventData, profile));
        break;
    }

    // Record detected anomalies
    for (const anomaly of anomalies) {
      await this.recordAnomaly(userId, anomaly);
    }

    return anomalies;
  }

  // Analyze login behavior
  async analyzeLoginBehavior(userId, loginData, profile) {
    const anomalies = [];
    const profileData = JSON.parse(profile.profile_data || '{}');
    
    // Time-based anomaly detection
    const timeAnomaly = this.detectTimeAnomaly(loginData.timestamp, profileData.login_times);
    if (timeAnomaly.detected) {
      anomalies.push({
        type: 'unusual_login_time',
        severity: 'medium',
        description: timeAnomaly.description,
        risk_score: 0.6,
        data: timeAnomaly
      });
    }

    // Location-based anomaly detection
    if (loginData.location) {
      const locationAnomaly = this.detectLocationAnomaly(loginData.location, profileData.locations);
      if (locationAnomaly.detected) {
        anomalies.push({
          type: 'unusual_location',
          severity: 'high',
          description: locationAnomaly.description,
          risk_score: 0.8,
          data: locationAnomaly
        });
      }
    }

    // Device-based anomaly detection
    if (loginData.device) {
      const deviceAnomaly = this.detectDeviceAnomaly(loginData.device, profileData.devices);
      if (deviceAnomaly.detected) {
        anomalies.push({
          type: 'unusual_device',
          severity: 'medium',
          description: deviceAnomaly.description,
          risk_score: 0.5,
          data: deviceAnomaly
        });
      }
    }

    // Frequency anomaly detection
    const frequencyAnomaly = await this.detectLoginFrequencyAnomaly(userId, loginData.timestamp);
    if (frequencyAnomaly.detected) {
      anomalies.push({
        type: 'unusual_login_frequency',
        severity: 'high',
        description: frequencyAnomaly.description,
        risk_score: 0.7,
        data: frequencyAnomaly
      });
    }

    return anomalies;
  }

  // Analyze data access behavior
  async analyzeDataAccessBehavior(userId, accessData, profile) {
    const anomalies = [];
    const profileData = JSON.parse(profile.profile_data || '{}');
    
    // Volume anomaly detection
    const volumeAnomaly = this.detectAccessVolumeAnomaly(accessData, profileData.access_patterns);
    if (volumeAnomaly.detected) {
      anomalies.push({
        type: 'unusual_access_volume',
        severity: 'high',
        description: volumeAnomaly.description,
        risk_score: 0.8,
        data: volumeAnomaly
      });
    }

    // Pattern anomaly detection
    const patternAnomaly = this.detectAccessPatternAnomaly(accessData, profileData.access_patterns);
    if (patternAnomaly.detected) {
      anomalies.push({
        type: 'unusual_access_pattern',
        severity: 'medium',
        description: patternAnomaly.description,
        risk_score: 0.6,
        data: patternAnomaly
      });
    }

    // Data sensitivity anomaly
    const sensitivityAnomaly = this.detectSensitivityAnomaly(accessData, profileData.data_sensitivity);
    if (sensitivityAnomaly.detected) {
      anomalies.push({
        type: 'unusual_data_access',
        severity: 'high',
        description: sensitivityAnomaly.description,
        risk_score: 0.9,
        data: sensitivityAnomaly
      });
    }

    return anomalies;
  }

  // Analyze API access behavior
  async analyzeAPIAccessBehavior(userId, apiData, profile) {
    const anomalies = [];
    const profileData = JSON.parse(profile.profile_data || '{}');
    
    // Endpoint frequency anomaly
    const endpointAnomaly = this.detectEndpointAnomaly(apiData, profileData.api_endpoints);
    if (endpointAnomaly.detected) {
      anomalies.push({
        type: 'unusual_api_usage',
        severity: 'medium',
        description: endpointAnomaly.description,
        risk_score: 0.5,
        data: endpointAnomaly
      });
    }

    // Request pattern anomaly
    const requestPatternAnomaly = this.detectRequestPatternAnomaly(apiData, profileData.request_patterns);
    if (requestPatternAnomaly.detected) {
      anomalies.push({
        type: 'unusual_request_pattern',
        severity: 'low',
        description: requestPatternAnomaly.description,
        risk_score: 0.3,
        data: requestPatternAnomaly
      });
    }

    return anomalies;
  }

  // Detect time-based anomalies
  detectTimeAnomaly(timestamp, historicalTimes) {
    if (!historicalTimes || historicalTimes.length === 0) {
      return { detected: false };
    }

    const currentTime = new Date(timestamp);
    const currentHour = currentTime.getHours();
    const currentDayOfWeek = currentTime.getDay();

    // Calculate typical hours and days
    const hourFrequency = {};
    const dayFrequency = {};

    historicalTimes.forEach(time => {
      const hour = new Date(time).getHours();
      const day = new Date(time).getDay();
      
      hourFrequency[hour] = (hourFrequency[hour] || 0) + 1;
      dayFrequency[day] = (dayFrequency[day] || 0) + 1;
    });

    const typicalHours = Object.keys(hourFrequency)
      .filter(hour => hourFrequency[hour] / historicalTimes.length > 0.1)
      .map(Number);

    const typicalDays = Object.keys(dayFrequency)
      .filter(day => dayFrequency[day] / historicalTimes.length > 0.1)
      .map(Number);

    const unusualHour = !typicalHours.includes(currentHour);
    const unusualDay = !typicalDays.includes(currentDayOfWeek);

    if (unusualHour || unusualDay) {
      return {
        detected: true,
        description: `Access at unusual time: ${currentTime.toLocaleString()}`,
        current_time: currentTime,
        typical_hours: typicalHours,
        typical_days: typicalDays
      };
    }

    return { detected: false };
  }

  // Detect location-based anomalies
  detectLocationAnomaly(currentLocation, historicalLocations) {
    if (!historicalLocations || historicalLocations.length === 0) {
      return { detected: false };
    }

    const locationMatches = historicalLocations.filter(loc => 
      this.areLocationsSimilar(loc, currentLocation)
    );

    if (locationMatches.length === 0) {
      return {
        detected: true,
        description: `Access from new location: ${currentLocation}`,
        current_location: currentLocation,
        known_locations: historicalLocations
      };
    }

    return { detected: false };
  }

  // Detect device-based anomalies
  detectDeviceAnomaly(currentDevice, historicalDevices) {
    if (!historicalDevices || historicalDevices.length === 0) {
      return { detected: false };
    }

    const deviceMatches = historicalDevices.filter(device => 
      this.areDevicesSimilar(device, currentDevice)
    );

    if (deviceMatches.length === 0) {
      return {
        detected: true,
        description: `Access from new device: ${currentDevice.userAgent}`,
        current_device: currentDevice,
        known_devices: historicalDevices
      };
    }

    return { detected: false };
  }

  // Detect login frequency anomalies
  async detectLoginFrequencyAnomaly(userId, timestamp) {
    const db = this.getDatabase();
    
    return new Promise((resolve, reject) => {
      const query = `
        SELECT COUNT(*) as login_count
        FROM behavior_events
        WHERE user_id = ? AND event_type = 'login'
        AND timestamp >= datetime(?, '-24 hours')
      `;
      
      db.get(query, [userId, timestamp], (err, row) => {
        if (err) {
          reject(err);
          return;
        }

        const recentLogins = row.login_count;
        const typicalDailyLogins = 3; // This should be calculated from historical data
        
        if (recentLogins > typicalDailyLogins * 2) {
          resolve({
            detected: true,
            description: `Unusual login frequency: ${recentLogins} logins in 24 hours`,
            recent_logins: recentLogins,
            typical_daily_logins: typicalDailyLogins
          });
        } else {
          resolve({ detected: false });
        }
      });
    });
  }

  // Detect access volume anomalies
  detectAccessVolumeAnomaly(accessData, accessPatterns) {
    if (!accessPatterns || !accessPatterns.volume_stats) {
      return { detected: false };
    }

    const currentVolume = accessData.record_count || 1;
    const avgVolume = accessPatterns.volume_stats.average || 0;
    const stdDev = accessPatterns.volume_stats.std_dev || 1;

    const zScore = Math.abs((currentVolume - avgVolume) / stdDev);
    
    if (zScore > 2) { // More than 2 standard deviations
      return {
        detected: true,
        description: `Unusual access volume: ${currentVolume} records (avg: ${avgVolume.toFixed(2)})`,
        current_volume: currentVolume,
        average_volume: avgVolume,
        z_score: zScore
      };
    }

    return { detected: false };
  }

  // Detect access pattern anomalies
  detectAccessPatternAnomaly(accessData, accessPatterns) {
    if (!accessPatterns || !accessPatterns.resource_patterns) {
      return { detected: false };
    }

    const currentResource = accessData.resource_type;
    const pattern = accessPatterns.resource_patterns[currentResource];
    
    if (!pattern) {
      return {
        detected: true,
        description: `Access to new resource type: ${currentResource}`,
        current_resource: currentResource,
        known_resources: Object.keys(accessPatterns.resource_patterns)
      };
    }

    const typicalFrequency = pattern.frequency || 0;
    const currentFrequency = accessData.frequency || 1;

    if (currentFrequency > typicalFrequency * 3) {
      return {
        detected: true,
        description: `Unusual access frequency for ${currentResource}: ${currentFrequency} (typical: ${typicalFrequency})`,
        current_frequency: currentFrequency,
        typical_frequency: typicalFrequency
      };
    }

    return { detected: false };
  }

  // Detect data sensitivity anomalies
  detectSensitivityAnomaly(accessData, sensitivityPatterns) {
    if (!accessData.sensitivity_level || !sensitivityPatterns) {
      return { detected: false };
    }

    const currentSensitivity = accessData.sensitivity_level;
    const typicalMaxSensitivity = sensitivityPatterns.max_level || 'low';

    const sensitivityLevels = { 'low': 1, 'medium': 2, 'high': 3, 'critical': 4 };
    const currentLevel = sensitivityLevels[currentSensitivity] || 1;
    const typicalLevel = sensitivityLevels[typicalMaxSensitivity] || 1;

    if (currentLevel > typicalLevel) {
      return {
        detected: true,
        description: `Access to unusually sensitive data: ${currentSensitivity}`,
        current_sensitivity: currentSensitivity,
        typical_max_sensitivity: typicalMaxSensitivity
      };
    }

    return { detected: false };
  }

  // Detect endpoint usage anomalies
  detectEndpointAnomaly(apiData, endpointPatterns) {
    if (!endpointPatterns || !apiData.endpoint) {
      return { detected: false };
    }

    const endpoint = apiData.endpoint;
    const pattern = endpointPatterns[endpoint];
    
    if (!pattern) {
      return {
        detected: true,
        description: `Access to new API endpoint: ${endpoint}`,
        current_endpoint: endpoint,
        known_endpoints: Object.keys(endpointPatterns)
      };
    }

    return { detected: false };
  }

  // Detect request pattern anomalies
  detectRequestPatternAnomaly(apiData, requestPatterns) {
    if (!requestPatterns || !apiData.request_size) {
      return { detected: false };
    }

    const currentSize = apiData.request_size;
    const avgSize = requestPatterns.average_size || 0;
    const maxSize = requestPatterns.max_size || avgSize * 2;

    if (currentSize > maxSize) {
      return {
        detected: true,
        description: `Unusually large request: ${currentSize} bytes`,
        current_size: currentSize,
        typical_max_size: maxSize
      };
    }

    return { detected: false };
  }

  // Get user behavior profile
  async getUserBehaviorProfile(userId) {
    const db = this.getDatabase();
    
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM user_behavior_profiles WHERE user_id = ?';
      
      db.get(query, [userId], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  // Update user behavior profile
  async updateBehaviorProfile(userId, eventType, eventData) {
    const db = this.getDatabase();
    
    try {
      const existingProfile = await this.getUserBehaviorProfile(userId);
      let profileData = {};
      
      if (existingProfile) {
        profileData = JSON.parse(existingProfile.profile_data || '{}');
      }

      // Update profile data based on event type
      this.updateProfileData(profileData, eventType, eventData);

      const profileDataStr = JSON.stringify(profileData);
      
      if (existingProfile) {
        await new Promise((resolve, reject) => {
          const query = `
            UPDATE user_behavior_profiles 
            SET profile_data = ?, baseline_established = TRUE, updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ?
          `;
          
          db.run(query, [profileDataStr, userId], (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      } else {
        await new Promise((resolve, reject) => {
          const query = `
            INSERT INTO user_behavior_profiles (user_id, profile_data, baseline_established)
            VALUES (?, ?, TRUE)
          `;
          
          db.run(query, [userId, profileDataStr], function(err) {
            if (err) reject(err);
            else resolve(this.lastID);
          });
        });
      }
      
    } catch (error) {
      console.error('Error updating behavior profile:', error);
      throw error;
    }
  }

  // Update profile data based on event type
  updateProfileData(profileData, eventType, eventData) {
    switch (eventType) {
      case 'login':
        if (!profileData.login_times) profileData.login_times = [];
        profileData.login_times.push(eventData.timestamp);
        
        if (eventData.location) {
          if (!profileData.locations) profileData.locations = [];
          profileData.locations.push(eventData.location);
        }
        
        if (eventData.device) {
          if (!profileData.devices) profileData.devices = [];
          profileData.devices.push(eventData.device);
        }
        break;
        
      case 'data_access':
        if (!profileData.access_patterns) profileData.access_patterns = {};
        this.updateAccessPatterns(profileData.access_patterns, eventData);
        break;
        
      case 'api_access':
        if (!profileData.api_endpoints) profileData.api_endpoints = {};
        if (!profileData.request_patterns) profileData.request_patterns = {};
        this.updateAPIPatterns(profileData, eventData);
        break;
    }
  }

  // Update access patterns
  updateAccessPatterns(accessPatterns, accessData) {
    const resourceType = accessData.resource_type;
    
    if (!accessPatterns.resource_patterns) {
      accessPatterns.resource_patterns = {};
    }
    
    if (!accessPatterns.resource_patterns[resourceType]) {
      accessPatterns.resource_patterns[resourceType] = { frequency: 0, count: 0 };
    }
    
    accessPatterns.resource_patterns[resourceType].frequency++;
    accessPatterns.resource_patterns[resourceType].count++;
    
    // Update volume statistics
    if (!accessPatterns.volume_stats) {
      accessPatterns.volume_stats = { total: 0, count: 0 };
    }
    
    const recordCount = accessData.record_count || 1;
    accessPatterns.volume_stats.total += recordCount;
    accessPatterns.volume_stats.count++;
    
    accessPatterns.volume_stats.average = accessPatterns.volume_stats.total / accessPatterns.volume_stats.count;
  }

  // Update API patterns
  updateAPIPatterns(profileData, apiData) {
    const endpoint = apiData.endpoint;
    
    if (!profileData.api_endpoints[endpoint]) {
      profileData.api_endpoints[endpoint] = { count: 0 };
    }
    
    profileData.api_endpoints[endpoint].count++;
    
    if (apiData.request_size) {
      if (!profileData.request_patterns.average_size) {
        profileData.request_patterns.average_size = 0;
        profileData.request_patterns.count = 0;
      }
      
      const size = apiData.request_size;
      const currentAvg = profileData.request_patterns.average_size;
      const count = profileData.request_patterns.count;
      
      profileData.request_patterns.average_size = (currentAvg * count + size) / (count + 1);
      profileData.request_patterns.count++;
      
      if (!profileData.request_patterns.max_size || size > profileData.request_patterns.max_size) {
        profileData.request_patterns.max_size = size;
      }
    }
  }

  // Record anomaly
  async recordAnomaly(userId, anomaly) {
    const db = this.getDatabase();
    
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO behavioral_anomalies (user_id, anomaly_type, severity, description, risk_score)
        VALUES (?, ?, ?, ?, ?)
      `;
      
      db.run(query, [
        userId,
        anomaly.type,
        anomaly.severity,
        anomaly.description,
        anomaly.risk_score
      ], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }

  // Get user anomalies
  async getUserAnomalies(userId, status = 'open') {
    const db = this.getDatabase();
    
    return new Promise((resolve, reject) => {
      const query = `
        SELECT * FROM behavioral_anomalies 
        WHERE user_id = ? AND status = ?
        ORDER BY created_at DESC
      `;
      
      db.all(query, [userId, status], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  // Get behavioral statistics
  async getBehavioralStats(userId, period = 30) {
    const db = this.getDatabase();
    
    return new Promise((resolve, reject) => {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - period);
      
      const query = `
        SELECT 
          event_type,
          COUNT(*) as event_count,
          AVG(risk_score) as avg_risk_score,
          COUNT(CASE WHEN anomaly_detected = TRUE THEN 1 END) as anomaly_count
        FROM behavior_events
        WHERE user_id = ? AND timestamp >= ?
        GROUP BY event_type
      `;
      
      db.all(query, [userId, cutoffDate.toISOString()], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  // Helper methods for similarity checks
  areLocationsSimilar(loc1, loc2) {
    // Simplified location similarity check
    // In production, use proper geolocation comparison
    return loc1 === loc2 || 
           (loc1.country === loc2.country && loc1.city === loc2.city);
  }

  areDevicesSimilar(device1, device2) {
    // Simplified device similarity check
    return device1.userAgent === device2.userAgent ||
           (device1.os === device2.os && device1.browser === device2.browser);
  }

  // Close database connection
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

module.exports = new BehavioralAnalysisService();
