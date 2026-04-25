const request = require('supertest');
const { app } = require('../server');
const jwt = require('jsonwebtoken');

describe('Advanced Security API Tests', () => {
  let authToken;
  let adminToken;
  let testUserId;

  beforeAll(async () => {
    // Create test user tokens
    authToken = jwt.sign(
      { id: 1, email: 'test@example.com', role: 'patient' },
      process.env.JWT_SECRET || 'fallback-secret-key',
      { expiresIn: '1h' }
    );

    adminToken = jwt.sign(
      { id: 2, email: 'admin@example.com', role: 'admin' },
      process.env.JWT_SECRET || 'fallback-secret-key',
      { expiresIn: '1h' }
    );

    testUserId = 1;
  });

  describe('Zero-Trust Authentication', () => {
    test('should verify device trust', async () => {
      const response = await request(app)
        .post('/api/security/auth/verify-device')
        .send({
          userId: testUserId,
          deviceName: 'Test Device',
          deviceFingerprint: 'test-fingerprint-123'
        })
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Device trusted successfully');
    });

    test('should get security stats', async () => {
      const response = await request(app)
        .get('/api/security/auth/security-stats')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('activeSessions');
      expect(response.body).toHaveProperty('trustedDevices');
      expect(response.body).toHaveProperty('blockedIPs');
    });
  });

  describe('Behavioral Analysis', () => {
    test('should record behavior event', async () => {
      const response = await request(app)
        .post('/api/security/behavior/record')
        .send({
          eventType: 'login',
          eventData: {
            timestamp: new Date().toISOString(),
            location: 'US',
            device: { userAgent: 'test-browser' }
          },
          riskScore: 0.2
        })
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Behavior event recorded successfully');
    });

    test('should get behavioral anomalies', async () => {
      const response = await request(app)
        .get(`/api/security/behavior/anomalies/${testUserId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    test('should get behavioral stats', async () => {
      const response = await request(app)
        .get(`/api/security/behavior/stats/${testUserId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('Threat Intelligence', () => {
    test('should check IP reputation', async () => {
      const response = await request(app)
        .post('/api/security/threat/check-ip')
        .send({
          ip: '192.168.1.1'
        })
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('ip');
      expect(response.body).toHaveProperty('reputation_score');
      expect(response.body).toHaveProperty('risk_level');
    });

    test('should check domain reputation', async () => {
      const response = await request(app)
        .post('/api/security/threat/check-domain')
        .send({
          domain: 'example.com'
        })
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('domain');
      expect(response.body).toHaveProperty('reputation_score');
      expect(response.body).toHaveProperty('risk_level');
    });

    test('should check file reputation', async () => {
      const response = await request(app)
        .post('/api/security/threat/check-file')
        .send({
          fileHash: 'd41d8cd98f00b204e9800998ecf8427e',
          fileName: 'test.txt'
        })
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('file_hash');
      expect(response.body).toHaveProperty('reputation_score');
      expect(response.body).toHaveProperty('malware_detected');
    });

    test('should get threat alerts', async () => {
      const response = await request(app)
        .get('/api/security/threat/alerts')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    test('should get threat stats (admin only)', async () => {
      const response = await request(app)
        .get('/api/security/threat/stats')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('total_alerts');
      expect(response.body).toHaveProperty('critical_alerts');
    });

    test('should deny threat stats access to non-admin', async () => {
      const response = await request(app)
        .get('/api/security/threat/stats')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Access denied');
    });
  });

  describe('Anomaly Detection', () => {
    test('should record metric', async () => {
      const response = await request(app)
        .post('/api/security/anomaly/metric')
        .send({
          entityType: 'user',
          entityId: testUserId,
          metricName: 'login_frequency',
          value: 5,
          context: { hour: 14, day: 'Monday' }
        })
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Metric recorded successfully');
      expect(response.body).toHaveProperty('anomaliesDetected');
    });

    test('should get detected anomalies', async () => {
      const response = await request(app)
        .get('/api/security/anomaly/detected')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    test('should get anomaly stats (admin only)', async () => {
      const response = await request(app)
        .get('/api/security/anomaly/stats')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('Incident Response', () => {
    test('should create security incident', async () => {
      const response = await request(app)
        .post('/api/security/incident/create')
        .send({
          incidentType: 'data_breach',
          title: 'Test Data Breach',
          description: 'Test incident for unit testing',
          severity: 'high',
          affectedAssets: ['database', 'server1'],
          indicators: ['suspicious_login', 'data_exfiltration'],
          dataBreach: true,
          complianceImpact: 'HIPAA'
        })
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('incidentId');
    });

    test('should get active incidents', async () => {
      const response = await request(app)
        .get('/api/security/incidents')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    test('should get incident stats (admin only)', async () => {
      const response = await request(app)
        .get('/api/security/incident/stats')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('total_incidents');
      expect(response.body).toHaveProperty('critical_incidents');
    });
  });

  describe('Compliance Validation', () => {
    test('should validate compliance', async () => {
      const response = await request(app)
        .post('/api/security/compliance/validate')
        .send({
          entityType: 'user',
          entityId: testUserId,
          frameworkId: 'hipaa'
        })
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('validation_id');
      expect(response.body).toHaveProperty('overall_score');
      expect(response.body).toHaveProperty('findings');
    });

    test('should get validation results', async () => {
      const response = await request(app)
        .get(`/api/security/compliance/validation/user/${testUserId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    test('should get compliance findings (admin only)', async () => {
      const response = await request(app)
        .get('/api/security/compliance/findings')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    test('should generate compliance report (admin only)', async () => {
      const periodStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const periodEnd = new Date().toISOString();

      const response = await request(app)
        .post('/api/security/compliance/report')
        .send({
          frameworkId: 'hipaa',
          periodStart: periodStart,
          periodEnd: periodEnd
        })
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('report_id');
      expect(response.body).toHaveProperty('summary');
    });
  });

  describe('Performance Monitoring', () => {
    test('should record performance metric', async () => {
      const response = await request(app)
        .post('/api/security/performance/metric')
        .send({
          metricType: 'response_time',
          metricName: 'api_response',
          value: 150,
          unit: 'ms',
          tags: { endpoint: '/api/patients' },
          source: 'api'
        })
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Performance metric recorded successfully');
    });

    test('should get performance metrics', async () => {
      const response = await request(app)
        .get('/api/security/performance/metrics')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    test('should get API performance metrics', async () => {
      const response = await request(app)
        .get('/api/security/performance/api')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    test('should get performance alerts (admin only)', async () => {
      const response = await request(app)
        .get('/api/security/performance/alerts')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    test('should get performance stats (admin only)', async () => {
      const response = await request(app)
        .get('/api/security/performance/stats')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('api_performance');
      expect(response.body).toHaveProperty('system_resources');
    });

    test('should generate performance report (admin only)', async () => {
      const response = await request(app)
        .post('/api/security/performance/report')
        .send({
          period: 24
        })
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('report_id');
      expect(response.body).toHaveProperty('summary');
    });
  });

  describe('Security Dashboard', () => {
    test('should get security dashboard', async () => {
      const response = await request(app)
        .get('/api/security/dashboard')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('zero_trust');
      expect(response.body).toHaveProperty('threat_intelligence');
      expect(response.body).toHaveProperty('anomaly_detection');
      expect(response.body).toHaveProperty('incident_response');
      expect(response.body).toHaveProperty('performance_monitoring');
      expect(response.body).toHaveProperty('overall_health');
    });
  });

  describe('Error Handling', () => {
    test('should handle missing required fields', async () => {
      const response = await request(app)
        .post('/api/security/behavior/record')
        .send({
          eventData: { timestamp: new Date().toISOString() }
        })
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Missing required fields');
    });

    test('should handle invalid authentication', async () => {
      const response = await request(app)
        .get('/api/security/dashboard')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Invalid token');
    });

    test('should handle missing authentication', async () => {
      const response = await request(app)
        .get('/api/security/dashboard');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Access token required');
    });

    test('should handle unauthorized access', async () => {
      const response = await request(app)
        .get('/api/security/threat/stats')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Access denied');
    });
  });

  describe('Integration Tests', () => {
    test('should handle complete security workflow', async () => {
      // 1. Record behavior event
      const behaviorResponse = await request(app)
        .post('/api/security/behavior/record')
        .send({
          eventType: 'login',
          eventData: {
            timestamp: new Date().toISOString(),
            location: 'US',
            device: { userAgent: 'test-browser' }
          }
        })
        .set('Authorization', `Bearer ${authToken}`);

      expect(behaviorResponse.status).toBe(200);

      // 2. Check IP reputation
      const ipResponse = await request(app)
        .post('/api/security/threat/check-ip')
        .send({
          ip: '192.168.1.1'
        })
        .set('Authorization', `Bearer ${authToken}`);

      expect(ipResponse.status).toBe(200);

      // 3. Record metric
      const metricResponse = await request(app)
        .post('/api/security/anomaly/metric')
        .send({
          entityType: 'user',
          entityId: testUserId,
          metricName: 'login_frequency',
          value: 3
        })
        .set('Authorization', `Bearer ${authToken}`);

      expect(metricResponse.status).toBe(200);

      // 4. Get dashboard
      const dashboardResponse = await request(app)
        .get('/api/security/dashboard')
        .set('Authorization', `Bearer ${authToken}`);

      expect(dashboardResponse.status).toBe(200);
      expect(dashboardResponse.body).toHaveProperty('overall_health');
    });
  });
});

describe('Security API Performance Tests', () => {
  let authToken;

  beforeAll(async () => {
    authToken = jwt.sign(
      { id: 1, email: 'test@example.com', role: 'patient' },
      process.env.JWT_SECRET || 'fallback-secret-key',
      { expiresIn: '1h' }
    );
  });

  test('should handle concurrent requests', async () => {
    const promises = [];
    const concurrentRequests = 10;

    for (let i = 0; i < concurrentRequests; i++) {
      promises.push(
        request(app)
          .get('/api/security/dashboard')
          .set('Authorization', `Bearer ${authToken}`)
      );
    }

    const responses = await Promise.all(promises);
    
    responses.forEach(response => {
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('overall_health');
    });
  });

  test('should respond within acceptable time limits', async () => {
    const startTime = Date.now();
    
    const response = await request(app)
      .get('/api/security/dashboard')
      .set('Authorization', `Bearer ${authToken}`);

    const endTime = Date.now();
    const responseTime = endTime - startTime;

    expect(response.status).toBe(200);
    expect(responseTime).toBeLessThan(1000); // Should respond within 1 second
  });
});
