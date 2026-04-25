const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { createHash, randomBytes } = require('crypto');

class ZeroTrustMiddleware {
  constructor() {
    this.sessionStore = new Map();
    this.deviceStore = new Map();
    this.riskStore = new Map();
    this.blockedIPs = new Set();
    
    // Zero-trust configuration
    this.config = {
      maxFailedAttempts: 5,
      lockoutDuration: 15 * 60 * 1000, // 15 minutes
      sessionTimeout: 30 * 60 * 1000, // 30 minutes
      deviceVerificationRequired: true,
      riskThreshold: 70,
      maxConcurrentSessions: 3,
      ipReputationCheck: true,
      behavioralAnalysis: true
    };
  }

  // Generate device fingerprint
  generateDeviceFingerprint(req) {
    const userAgent = req.headers['user-agent'] || '';
    const acceptLanguage = req.headers['accept-language'] || '';
    const acceptEncoding = req.headers['accept-encoding'] || '';
    const ip = req.ip || req.connection.remoteAddress;
    
    const fingerprint = createHash('sha256')
      .update(userAgent + acceptLanguage + acceptEncoding + ip)
      .digest('hex');
    
    return fingerprint;
  }

  // Verify device trust
  async verifyDevice(userId, deviceFingerprint) {
    const devices = this.deviceStore.get(userId) || [];
    const trustedDevice = devices.find(device => 
      device.fingerprint === deviceFingerprint && 
      device.trusted === true
    );
    
    if (!trustedDevice) {
      // New device - require additional verification
      return {
        trusted: false,
        requiresVerification: true,
        deviceInfo: {
          fingerprint: deviceFingerprint,
          firstSeen: new Date().toISOString(),
          userAgent: req.headers['user-agent'],
          ip: req.ip
        }
      };
    }
    
    // Update last seen
    trustedDevice.lastSeen = new Date().toISOString();
    this.deviceStore.set(userId, devices);
    
    return {
      trusted: true,
      requiresVerification: false,
      deviceInfo: trustedDevice
    };
  }

  // Trust device after verification
  trustDevice(userId, deviceFingerprint, deviceName) {
    const devices = this.deviceStore.get(userId) || [];
    
    // Remove existing untrusted device with same fingerprint
    const filteredDevices = devices.filter(d => d.fingerprint !== deviceFingerprint);
    
    // Add trusted device
    filteredDevices.push({
      fingerprint: deviceFingerprint,
      trusted: true,
      deviceName: deviceName || 'Unknown Device',
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString()
    });
    
    this.deviceStore.set(userId, filteredDevices);
  }

  // Calculate risk score for request
  calculateRiskScore(req, user) {
    let riskScore = 0;
    const factors = [];

    // IP-based risk
    const ipRisk = this.calculateIPRisk(req.ip);
    riskScore += ipRisk.score;
    factors.push(ipRisk);

    // Time-based risk
    const timeRisk = this.calculateTimeRisk(user.lastLoginTime);
    riskScore += timeRisk.score;
    factors.push(timeRisk);

    // Device-based risk
    const deviceRisk = this.calculateDeviceRisk(req, user);
    riskScore += deviceRisk.score;
    factors.push(deviceRisk);

    // Behavioral risk
    const behavioralRisk = this.calculateBehavioralRisk(req, user);
    riskScore += behavioralRisk.score;
    factors.push(behavioralRisk);

    return {
      totalScore: Math.min(100, riskScore),
      factors: factors,
      level: this.determineRiskLevel(riskScore)
    };
  }

  calculateIPRisk(ip) {
    // Check if IP is blocked
    if (this.blockedIPs.has(ip)) {
      return { score: 100, reason: 'IP is blocked', type: 'ip' };
    }

    // Check for known malicious IPs (simplified)
    const suspiciousIPRanges = [
      '10.0.0.', // Example private network
      // Add more ranges as needed
    ];

    const isSuspicious = suspiciousIPRanges.some(range => ip.startsWith(range));
    
    return {
      score: isSuspicious ? 40 : 0,
      reason: isSuspicious ? 'Suspicious IP range' : 'Clean IP',
      type: 'ip'
    };
  }

  calculateTimeRisk(lastLoginTime) {
    if (!lastLoginTime) {
      return { score: 20, reason: 'First login', type: 'time' };
    }

    const lastLogin = new Date(lastLoginTime);
    const now = new Date();
    const hoursDiff = (now - lastLogin) / (1000 * 60 * 60);

    // Unusual login times
    const hour = now.getHours();
    if (hour < 6 || hour > 22) {
      return { score: 15, reason: 'Unusual login time', type: 'time' };
    }

    // Long time since last login
    if (hoursDiff > 24 * 7) { // More than a week
      return { score: 25, reason: 'Long time since last login', type: 'time' };
    }

    return { score: 0, reason: 'Normal login time', type: 'time' };
  }

  calculateLocationRisk(ip, lastKnownLocation) {
    // Simplified location-based risk assessment
    // In production, use a proper IP geolocation service
    const country = this.getCountryFromIP(ip);
    
    if (lastKnownLocation && country !== lastKnownLocation) {
      return {
        score: 30,
        reason: `Login from new country: ${country}`,
        type: 'location'
      };
    }

    return { score: 0, reason: 'Known location', type: 'location' };
  }

  calculateDeviceRisk(req, user) {
    const deviceFingerprint = this.generateDeviceFingerprint(req);
    const devices = this.deviceStore.get(user.id) || [];
    
    const knownDevice = devices.find(d => d.fingerprint === deviceFingerprint);
    
    if (!knownDevice) {
      return {
        score: 35,
        reason: 'Unknown device',
        type: 'device'
      };
    }

    if (!knownDevice.trusted) {
      return {
        score: 20,
        reason: 'Untrusted device',
        type: 'device'
      };
    }

    return { score: 0, reason: 'Known trusted device', type: 'device' };
  }

  calculateBehavioralRisk(req, user) {
    // Simplified behavioral analysis
    // In production, implement machine learning-based behavior analysis
    const userAgent = req.headers['user-agent'] || '';
    const typicalUserAgents = [
      'Mozilla/5.0',
      'Chrome/',
      'Firefox/',
      'Safari/'
    ];

    const isTypicalBrowser = typicalUserAgents.some(ua => userAgent.includes(ua));
    
    if (!isTypicalBrowser) {
      return {
        score: 25,
        reason: 'Unusual user agent',
        type: 'behavioral'
      };
    }

    return { score: 0, reason: 'Normal behavior', type: 'behavioral' };
  }

  determineRiskLevel(score) {
    if (score >= 80) return 'critical';
    if (score >= 60) return 'high';
    if (score >= 40) return 'medium';
    if (score >= 20) return 'low';
    return 'minimal';
  }

  // Session management
  createSession(userId, deviceFingerprint, riskScore) {
    const sessionId = randomBytes(32).toString('hex');
    const session = {
      id: sessionId,
      userId: userId,
      deviceFingerprint: deviceFingerprint,
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      riskScore: riskScore,
      isActive: true
    };

    this.sessionStore.set(sessionId, session);
    
    // Clean up old sessions
    this.cleanupOldSessions(userId);
    
    return sessionId;
  }

  validateSession(sessionId, req) {
    const session = this.sessionStore.get(sessionId);
    
    if (!session || !session.isActive) {
      return { valid: false, reason: 'Session not found or inactive' };
    }

    // Check session timeout
    const now = new Date();
    const lastActivity = new Date(session.lastActivity);
    const timeDiff = now - lastActivity;

    if (timeDiff > this.config.sessionTimeout) {
      this.sessionStore.delete(sessionId);
      return { valid: false, reason: 'Session expired' };
    }

    // Check device fingerprint
    const currentFingerprint = this.generateDeviceFingerprint(req);
    if (session.deviceFingerprint !== currentFingerprint) {
      return { valid: false, reason: 'Device fingerprint mismatch' };
    }

    // Update last activity
    session.lastActivity = new Date().toISOString();
    this.sessionStore.set(sessionId, session);

    return { valid: true, session: session };
  }

  cleanupOldSessions(userId) {
    const userSessions = Array.from(this.sessionStore.values())
      .filter(session => session.userId === userId && session.isActive);

    if (userSessions.length > this.config.maxConcurrentSessions) {
      // Sort by last activity and remove oldest
      userSessions.sort((a, b) => new Date(a.lastActivity) - new Date(b.lastActivity));
      
      const sessionsToRemove = userSessions.slice(0, userSessions.length - this.config.maxConcurrentSessions);
      sessionsToRemove.forEach(session => {
        session.isActive = false;
        this.sessionStore.set(session.id, session);
      });
    }
  }

  // Rate limiting with zero-trust principles
  createZeroTrustRateLimit() {
    return rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: (req) => {
        // Dynamic limits based on risk
        const riskScore = req.riskAssessment?.totalScore || 0;
        if (riskScore >= 60) return 10; // High risk
        if (riskScore >= 40) return 20; // Medium risk
        return 50; // Normal risk
      },
      message: {
        error: 'Rate limit exceeded',
        message: 'Too many requests, please try again later.',
        retryAfter: '15 minutes'
      },
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => {
        // Use device fingerprint for rate limiting
        return this.generateDeviceFingerprint(req);
      }
    });
  }

  // Main zero-trust middleware
  zeroTrustAuth() {
    return async (req, res, next) => {
      try {
        // Extract token
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
          return res.status(401).json({
            error: 'Authentication required',
            message: 'Please provide a valid JWT token',
            code: 'AUTH_REQUIRED'
          });
        }

        // Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-key');
        
        // Get user information (simplified - in production, fetch from database)
        const user = {
          id: decoded.id,
          email: decoded.email,
          role: decoded.role,
          lastLoginTime: decoded.lastLoginTime,
          lastKnownLocation: decoded.lastKnownLocation
        };

        // Calculate risk score
        const riskAssessment = this.calculateRiskScore(req, user);
        req.riskAssessment = riskAssessment;

        // Check if risk is too high
        if (riskAssessment.totalScore >= this.config.riskThreshold) {
          return res.status(403).json({
            error: 'High risk detected',
            message: 'Additional verification required',
            riskAssessment: riskAssessment,
            code: 'HIGH_RISK'
          });
        }

        // Verify device
        const deviceFingerprint = this.generateDeviceFingerprint(req);
        const deviceVerification = await this.verifyDevice(user.id, deviceFingerprint);
        
        if (deviceVerification.requiresVerification) {
          return res.status(403).json({
            error: 'Device verification required',
            message: 'Please verify this device',
            deviceInfo: deviceVerification.deviceInfo,
            code: 'DEVICE_VERIFICATION_REQUIRED'
          });
        }

        // Check session if provided
        const sessionId = req.headers['x-session-id'];
        if (sessionId) {
          const sessionValidation = this.validateSession(sessionId, req);
          
          if (!sessionValidation.valid) {
            return res.status(401).json({
              error: 'Invalid session',
              message: sessionValidation.reason,
              code: 'INVALID_SESSION'
            });
          }
          
          req.session = sessionValidation.session;
        }

        // Attach user and security context to request
        req.user = user;
        req.deviceFingerprint = deviceFingerprint;
        req.securityContext = {
          riskScore: riskAssessment.totalScore,
          riskLevel: riskAssessment.level,
          deviceTrusted: deviceVerification.trusted,
          sessionId: sessionId
        };

        next();
      } catch (error) {
        if (error.name === 'JsonWebTokenError') {
          return res.status(403).json({
            error: 'Invalid token',
            message: 'Your token has expired or is invalid',
            code: 'INVALID_TOKEN'
          });
        }
        
        console.error('Zero-trust authentication error:', error);
        return res.status(500).json({
          error: 'Authentication error',
          message: 'An error occurred during authentication',
          code: 'AUTH_ERROR'
        });
      }
    };
  }

  // Helper method to get country from IP (simplified)
  getCountryFromIP(ip) {
    // In production, use a proper geolocation service
    // This is just a placeholder
    return 'US';
  }

  // Block IP address
  blockIP(ip, duration = 24 * 60 * 60 * 1000) {
    this.blockedIPs.add(ip);
    
    setTimeout(() => {
      this.blockedIPs.delete(ip);
    }, duration);
  }

  // Get security statistics
  getSecurityStats() {
    return {
      activeSessions: this.sessionStore.size,
      trustedDevices: Array.from(this.deviceStore.values())
        .reduce((total, devices) => total + devices.filter(d => d.trusted).length, 0),
      blockedIPs: this.blockedIPs.size,
      averageRiskScore: this.calculateAverageRiskScore()
    };
  }

  calculateAverageRiskScore() {
    const sessions = Array.from(this.sessionStore.values());
    if (sessions.length === 0) return 0;
    
    const totalRisk = sessions.reduce((sum, session) => sum + (session.riskScore || 0), 0);
    return totalRisk / sessions.length;
  }
}

module.exports = new ZeroTrustMiddleware();
