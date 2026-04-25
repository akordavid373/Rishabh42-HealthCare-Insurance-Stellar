const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const axios = require('axios');
const { createHash } = require('crypto');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../database/healthcare.db');

class ThreatIntelligenceService {
  constructor() {
    this.db = null;
    this.threatFeeds = new Map();
    this.ipReputationCache = new Map();
    this.domainReputationCache = new Map();
    this.malwareSignatures = new Map();
    
    // Initialize threat feeds
    this.initializeThreatFeeds();
    
    // Cache expiration time (1 hour)
    this.cacheExpiration = 60 * 60 * 1000;
  }

  getDatabase() {
    if (!this.db) {
      this.db = new sqlite3.Database(DB_PATH);
    }
    return this.db;
  }

  // Initialize threat intelligence tables
  async initializeTables() {
    const db = this.getDatabase();
    
    const tables = [
      `CREATE TABLE IF NOT EXISTS threat_intelligence (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        threat_type TEXT NOT NULL,
        indicator TEXT NOT NULL,
        severity TEXT NOT NULL,
        confidence REAL NOT NULL,
        source TEXT NOT NULL,
        description TEXT,
        first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT TRUE,
        tags TEXT
      )`,
      
      `CREATE TABLE IF NOT EXISTS threat_indicators (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        indicator_type TEXT NOT NULL,
        indicator_value TEXT NOT NULL,
        reputation_score REAL NOT NULL,
        threat_categories TEXT,
        sources TEXT,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME
      )`,
      
      `CREATE TABLE IF NOT EXISTS security_incidents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        incident_type TEXT NOT NULL,
        severity TEXT NOT NULL,
        description TEXT NOT NULL,
        affected_assets TEXT,
        indicators TEXT,
        status TEXT DEFAULT 'open',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        resolved_at DATETIME,
        assigned_to INTEGER,
        FOREIGN KEY (assigned_to) REFERENCES users (id)
      )`,
      
      `CREATE TABLE IF NOT EXISTS threat_alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        alert_type TEXT NOT NULL,
        severity TEXT NOT NULL,
        message TEXT NOT NULL,
        indicators TEXT,
        user_id INTEGER,
        session_id TEXT,
        resolved BOOLEAN DEFAULT FALSE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
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

  // Initialize threat feeds
  initializeThreatFeeds() {
    // Example threat feeds - in production, use real threat intelligence APIs
    this.threatFeeds.set('malware_domains', {
      url: 'https://example.com/malware-domains.txt',
      format: 'text',
      updateInterval: 60 * 60 * 1000, // 1 hour
      lastUpdate: 0
    });
    
    this.threatFeeds.set('malicious_ips', {
      url: 'https://example.com/malicious-ips.txt',
      format: 'text',
      updateInterval: 60 * 60 * 1000, // 1 hour
      lastUpdate: 0
    });
    
    this.threatFeeds.set('phishing_domains', {
      url: 'https://example.com/phishing-domains.txt',
      format: 'text',
      updateInterval: 30 * 60 * 1000, // 30 minutes
      lastUpdate: 0
    });
  }

  // Check IP reputation
  async checkIPReputation(ip) {
    // Check cache first
    const cached = this.ipReputationCache.get(ip);
    if (cached && (Date.now() - cached.timestamp) < this.cacheExpiration) {
      return cached.data;
    }

    try {
      // Check against known malicious IPs
      const isMalicious = await this.checkMaliciousIP(ip);
      
      // Check against threat intelligence databases
      const threatData = await this.queryThreatIntelligence('ip', ip);
      
      // Calculate reputation score
      const reputationScore = this.calculateIPReputationScore(ip, isMalicious, threatData);
      
      const result = {
        ip: ip,
        reputation_score: reputationScore.score,
        risk_level: reputationScore.level,
        threats: threatData.threats,
        sources: threatData.sources,
        last_checked: new Date().toISOString()
      };

      // Cache the result
      this.ipReputationCache.set(ip, {
        data: result,
        timestamp: Date.now()
      });

      return result;
    } catch (error) {
      console.error('Error checking IP reputation:', error);
      return {
        ip: ip,
        reputation_score: 0.5, // Neutral score on error
        risk_level: 'unknown',
        threats: [],
        sources: [],
        last_checked: new Date().toISOString(),
        error: error.message
      };
    }
  }

  // Check domain reputation
  async checkDomainReputation(domain) {
    // Check cache first
    const cached = this.domainReputationCache.get(domain);
    if (cached && (Date.now() - cached.timestamp) < this.cacheExpiration) {
      return cached.data;
    }

    try {
      // Check against known malicious domains
      const isMalicious = await this.checkMaliciousDomain(domain);
      
      // Check against threat intelligence databases
      const threatData = await this.queryThreatIntelligence('domain', domain);
      
      // Calculate reputation score
      const reputationScore = this.calculateDomainReputationScore(domain, isMalicious, threatData);
      
      const result = {
        domain: domain,
        reputation_score: reputationScore.score,
        risk_level: reputationScore.level,
        threats: threatData.threats,
        sources: threatData.sources,
        last_checked: new Date().toISOString()
      };

      // Cache the result
      this.domainReputationCache.set(domain, {
        data: result,
        timestamp: Date.now()
      });

      return result;
    } catch (error) {
      console.error('Error checking domain reputation:', error);
      return {
        domain: domain,
        reputation_score: 0.5, // Neutral score on error
        risk_level: 'unknown',
        threats: [],
        sources: [],
        last_checked: new Date().toISOString(),
        error: error.message
      };
    }
  }

  // Check file reputation
  async checkFileReputation(fileHash, fileName) {
    try {
      // Check against malware signatures
      const malwareCheck = await this.checkMalwareSignature(fileHash);
      
      // Check against threat intelligence databases
      const threatData = await this.queryThreatIntelligence('file', fileHash);
      
      // Calculate reputation score
      const reputationScore = this.calculateFileReputationScore(fileHash, fileName, malwareCheck, threatData);
      
      return {
        file_hash: fileHash,
        file_name: fileName,
        reputation_score: reputationScore.score,
        risk_level: reputationScore.level,
        threats: threatData.threats,
        sources: threatData.sources,
        malware_detected: malwareCheck.detected,
        malware_families: malwareCheck.families,
        last_checked: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error checking file reputation:', error);
      return {
        file_hash: fileHash,
        file_name: fileName,
        reputation_score: 0.5, // Neutral score on error
        risk_level: 'unknown',
        threats: [],
        sources: [],
        malware_detected: false,
        malware_families: [],
        last_checked: new Date().toISOString(),
        error: error.message
      };
    }
  }

  // Check malicious IP
  async checkMaliciousIP(ip) {
    const db = this.getDatabase();
    
    return new Promise((resolve, reject) => {
      const query = `
        SELECT * FROM threat_indicators 
        WHERE indicator_type = 'ip' AND indicator_value = ? AND is_active = TRUE
      `;
      
      db.get(query, [ip], (err, row) => {
        if (err) {
          reject(err);
          return;
        }

        if (row) {
          resolve({
            detected: true,
            reputation_score: row.reputation_score,
            threat_categories: JSON.parse(row.threat_categories || '[]'),
            sources: JSON.parse(row.sources || '[]')
          });
        } else {
          resolve({ detected: false });
        }
      });
    });
  }

  // Check malicious domain
  async checkMaliciousDomain(domain) {
    const db = this.getDatabase();
    
    return new Promise((resolve, reject) => {
      const query = `
        SELECT * FROM threat_indicators 
        WHERE indicator_type = 'domain' AND indicator_value = ? AND is_active = TRUE
      `;
      
      db.get(query, [domain], (err, row) => {
        if (err) {
          reject(err);
          return;
        }

        if (row) {
          resolve({
            detected: true,
            reputation_score: row.reputation_score,
            threat_categories: JSON.parse(row.threat_categories || '[]'),
            sources: JSON.parse(row.sources || '[]')
          });
        } else {
          resolve({ detected: false });
        }
      });
    });
  }

  // Check malware signature
  async checkMalwareSignature(fileHash) {
    const signature = this.malwareSignatures.get(fileHash);
    
    if (signature) {
      return {
        detected: true,
        families: signature.families,
        severity: signature.severity
      };
    }

    // Check database for known signatures
    const db = this.getDatabase();
    
    return new Promise((resolve, reject) => {
      const query = `
        SELECT * FROM threat_intelligence 
        WHERE threat_type = 'malware_signature' AND indicator = ? AND is_active = TRUE
      `;
      
      db.get(query, [fileHash], (err, row) => {
        if (err) {
          reject(err);
          return;
        }

        if (row) {
          const families = JSON.parse(row.tags || '[]');
          this.malwareSignatures.set(fileHash, {
            families: families,
            severity: row.severity
          });
          
          resolve({
            detected: true,
            families: families,
            severity: row.severity
          });
        } else {
          resolve({ detected: false });
        }
      });
    });
  }

  // Query threat intelligence databases
  async queryThreatIntelligence(indicatorType, indicator) {
    const db = this.getDatabase();
    
    return new Promise((resolve, reject) => {
      const query = `
        SELECT * FROM threat_intelligence 
        WHERE threat_type = ? AND indicator = ? AND is_active = TRUE
      `;
      
      db.all(query, [indicatorType, indicator], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }

        const threats = rows.map(row => ({
          type: row.threat_type,
          severity: row.severity,
          confidence: row.confidence,
          description: row.description,
          source: row.source,
          tags: JSON.parse(row.tags || '[]')
        }));

        const sources = [...new Set(rows.map(row => row.source))];

        resolve({
          threats: threats,
          sources: sources
        });
      });
    });
  }

  // Calculate IP reputation score
  calculateIPReputationScore(ip, isMalicious, threatData) {
    let score = 0.5; // Neutral starting point

    // Adjust based on malicious detection
    if (isMalicious.detected) {
      score -= isMalicious.reputation_score * 0.6;
    }

    // Adjust based on threat intelligence
    threatData.threats.forEach(threat => {
      const weight = this.getThreatWeight(threat.severity, threat.confidence);
      score -= weight;
    });

    // Adjust based on IP characteristics
    if (this.isPrivateIP(ip)) {
      score += 0.1; // Slightly boost private IPs
    }

    if (this.isTorExitNode(ip)) {
      score -= 0.3; // Penalize Tor exit nodes
    }

    // Ensure score is within bounds
    score = Math.max(0, Math.min(1, score));

    return {
      score: score,
      level: this.getRiskLevel(score)
    };
  }

  // Calculate domain reputation score
  calculateDomainReputationScore(domain, isMalicious, threatData) {
    let score = 0.5; // Neutral starting point

    // Adjust based on malicious detection
    if (isMalicious.detected) {
      score -= isMalicious.reputation_score * 0.6;
    }

    // Adjust based on threat intelligence
    threatData.threats.forEach(threat => {
      const weight = this.getThreatWeight(threat.severity, threat.confidence);
      score -= weight;
    });

    // Adjust based on domain characteristics
    if (this.isNewlyRegistered(domain)) {
      score -= 0.2; // Penalize newly registered domains
    }

    if (this.hasSuspiciousTLD(domain)) {
      score -= 0.1; // Penalize suspicious TLDs
    }

    // Ensure score is within bounds
    score = Math.max(0, Math.min(1, score));

    return {
      score: score,
      level: this.getRiskLevel(score)
    };
  }

  // Calculate file reputation score
  calculateFileReputationScore(fileHash, fileName, malwareCheck, threatData) {
    let score = 0.5; // Neutral starting point

    // Adjust based on malware detection
    if (malwareCheck.detected) {
      const severityWeight = this.getMalwareSeverityWeight(malwareCheck.severity);
      score -= severityWeight;
    }

    // Adjust based on threat intelligence
    threatData.threats.forEach(threat => {
      const weight = this.getThreatWeight(threat.severity, threat.confidence);
      score -= weight;
    });

    // Adjust based on file characteristics
    if (this.isExecutableFile(fileName)) {
      score -= 0.1; // Slightly penalize executables
    }

    // Ensure score is within bounds
    score = Math.max(0, Math.min(1, score));

    return {
      score: score,
      level: this.getRiskLevel(score)
    };
  }

  // Get threat weight based on severity and confidence
  getThreatWeight(severity, confidence) {
    const severityWeights = {
      'critical': 0.4,
      'high': 0.3,
      'medium': 0.2,
      'low': 0.1
    };

    const baseWeight = severityWeights[severity] || 0.1;
    return baseWeight * confidence;
  }

  // Get malware severity weight
  getMalwareSeverityWeight(severity) {
    const severityWeights = {
      'critical': 0.8,
      'high': 0.6,
      'medium': 0.4,
      'low': 0.2
    };

    return severityWeights[severity] || 0.3;
  }

  // Get risk level from score
  getRiskLevel(score) {
    if (score >= 0.8) return 'low';
    if (score >= 0.6) return 'medium';
    if (score >= 0.4) return 'high';
    return 'critical';
  }

  // Check if IP is private
  isPrivateIP(ip) {
    const privateRanges = [
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
      /^127\./
    ];

    return privateRanges.some(range => range.test(ip));
  }

  // Check if IP is Tor exit node (simplified)
  isTorExitNode(ip) {
    // In production, use a real Tor exit node list
    const knownTorNodes = new Set([
      '192.0.2.1',
      '192.0.2.2'
      // Add more known Tor exit nodes
    ]);

    return knownTorNodes.has(ip);
  }

  // Check if domain is newly registered (simplified)
  isNewlyRegistered(domain) {
    // In production, use WHOIS data
    return false;
  }

  // Check if domain has suspicious TLD
  hasSuspiciousTLD(domain) {
    const suspiciousTLDs = [
      '.tk', '.ml', '.ga', '.cf', '.pw', '.top', '.click', '.download'
    ];

    return suspiciousTLDs.some(tld => domain.endsWith(tld));
  }

  // Check if file is executable
  isExecutableFile(fileName) {
    const executableExtensions = [
      '.exe', '.bat', '.cmd', '.com', '.scr', '.pif', '.msi', '.dll'
    ];

    return executableExtensions.some(ext => fileName.toLowerCase().endsWith(ext));
  }

  // Create security alert
  async createSecurityAlert(alertType, severity, message, indicators, userId = null, sessionId = null) {
    const db = this.getDatabase();
    
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO threat_alerts (alert_type, severity, message, indicators, user_id, session_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      
      db.run(query, [
        alertType,
        severity,
        message,
        JSON.stringify(indicators),
        userId,
        sessionId
      ], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }

  // Get security alerts
  async getSecurityAlerts(userId = null, status = null, limit = 50) {
    const db = this.getDatabase();
    
    return new Promise((resolve, reject) => {
      let query = 'SELECT * FROM threat_alerts WHERE 1=1';
      const params = [];

      if (userId) {
        query += ' AND user_id = ?';
        params.push(userId);
      }

      if (status !== null) {
        query += ' AND resolved = ?';
        params.push(status === 'resolved' ? 1 : 0);
      }

      query += ' ORDER BY created_at DESC LIMIT ?';
      params.push(limit);

      db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else {
          // Parse JSON fields
          const alerts = rows.map(row => ({
            ...row,
            indicators: JSON.parse(row.indicators || '[]'),
            resolved: Boolean(row.resolved)
          }));
          resolve(alerts);
        }
      });
    });
  }

  // Resolve security alert
  async resolveSecurityAlert(alertId) {
    const db = this.getDatabase();
    
    return new Promise((resolve, reject) => {
      const query = 'UPDATE threat_alerts SET resolved = TRUE WHERE id = ?';
      
      db.run(query, [alertId], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // Add threat indicator
  async addThreatIndicator(indicatorType, indicatorValue, reputationScore, threatCategories, sources) {
    const db = this.getDatabase();
    
    return new Promise((resolve, reject) => {
      const query = `
        INSERT OR REPLACE INTO threat_indicators 
        (indicator_type, indicator_value, reputation_score, threat_categories, sources, last_updated)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `;
      
      db.run(query, [
        indicatorType,
        indicatorValue,
        reputationScore,
        JSON.stringify(threatCategories),
        JSON.stringify(sources)
      ], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }

  // Get threat statistics
  async getThreatStats(period = 24) {
    const db = this.getDatabase();
    
    return new Promise((resolve, reject) => {
      const cutoffDate = new Date();
      cutoffDate.setHours(cutoffDate.getHours() - period);
      
      const query = `
        SELECT 
          COUNT(*) as total_alerts,
          COUNT(CASE WHEN severity = 'critical' THEN 1 END) as critical_alerts,
          COUNT(CASE WHEN severity = 'high' THEN 1 END) as high_alerts,
          COUNT(CASE WHEN severity = 'medium' THEN 1 END) as medium_alerts,
          COUNT(CASE WHEN severity = 'low' THEN 1 END) as low_alerts,
          COUNT(CASE WHEN resolved = FALSE THEN 1 END) as unresolved_alerts
        FROM threat_alerts
        WHERE created_at >= ?
      `;
      
      db.get(query, [cutoffDate.toISOString()], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  // Update threat feeds
  async updateThreatFeeds() {
    for (const [feedName, feedConfig] of this.threatFeeds) {
      if (Date.now() - feedConfig.lastUpdate < feedConfig.updateInterval) {
        continue; // Skip if not time to update yet
      }

      try {
        await this.fetchThreatFeed(feedName, feedConfig);
        feedConfig.lastUpdate = Date.now();
      } catch (error) {
        console.error(`Error updating threat feed ${feedName}:`, error);
      }
    }
  }

  // Fetch threat feed
  async fetchThreatFeed(feedName, feedConfig) {
    try {
      const response = await axios.get(feedConfig.url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Healthcare-Security-System/1.0'
        }
      });

      const indicators = response.data.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

      for (const indicator of indicators) {
        await this.addThreatIndicator(
          feedName.includes('domain') ? 'domain' : 'ip',
          indicator,
          0.8, // High reputation score for threat feed indicators
          [feedName],
          [feedConfig.url]
        );
      }

      console.log(`Updated ${feedName} with ${indicators.length} indicators`);
    } catch (error) {
      console.error(`Failed to fetch threat feed ${feedName}:`, error);
      throw error;
    }
  }

  // Close database connection
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

module.exports = new ThreatIntelligenceService();
