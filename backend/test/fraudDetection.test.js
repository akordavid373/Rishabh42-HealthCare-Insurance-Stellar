const request = require('supertest');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { app } = require('../server');
const fraudDetectionService = require('../services/fraudDetectionService');

const DB_PATH = path.join(__dirname, '../database/healthcare_test.db');

describe('Fraud Detection System', () => {
  let db;
  let testUserId;
  let testPatientId;
  let testClaimId;
  let authToken;

  beforeAll(async () => {
    db = new sqlite3.Database(DB_PATH);
    
    await new Promise((resolve, reject) => {
      db.run('PRAGMA foreign_keys = ON', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    await setupTestData();
  });

  afterAll(async () => {
    if (db) {
      db.close();
    }
  });

  async function setupTestData() {
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM users WHERE email LIKE "test%"', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    await new Promise((resolve, reject) => {
      const stmt = db.prepare(`
        INSERT INTO users (email, password, role, first_name, last_name)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      stmt.run(['testuser@example.com', 'hashedpassword', 'patient', 'Test', 'User'], function(err) {
        if (err) {
          reject(err);
        } else {
          testUserId = this.lastID;
          resolve();
        }
      });
      
      stmt.finalize();
    });

    await new Promise((resolve, reject) => {
      const stmt = db.prepare(`
        INSERT INTO patients (user_id, medical_record_number, insurance_provider)
        VALUES (?, ?, ?)
      `);
      
      stmt.run([testUserId, 'TEST12345', 'Test Insurance'], function(err) {
        if (err) {
          reject(err);
        } else {
          testPatientId = this.lastID;
          resolve();
        }
      });
      
      stmt.finalize();
    });

    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'testuser@example.com',
        password: 'testpassword'
      });

    authToken = loginResponse.body.token;
  }

  describe('Fraud Detection Service', () => {
    test('should analyze claim fraud for low risk claim', async () => {
      await new Promise((resolve, reject) => {
        const stmt = db.prepare(`
          INSERT INTO insurance_claims (
            patient_id, claim_number, service_date, provider_name,
            diagnosis_codes, procedure_codes, total_amount, insurance_amount,
            patient_responsibility
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        stmt.run([
          testPatientId, 'LOW001', '2024-01-15', 'Dr. Smith',
          'Z00.00', '99213', 150.00, 120.00, 30.00
        ], function(err) {
          if (err) {
            reject(err);
          } else {
            testClaimId = this.lastID;
            resolve();
          }
        });
        
        stmt.finalize();
      });

      const analysis = await fraudDetectionService.analyzeClaimFraud(testClaimId);
      
      expect(analysis).toBeDefined();
      expect(analysis.risk_score).toBeGreaterThanOrEqual(0);
      expect(analysis.risk_score).toBeLessThanOrEqual(100);
      expect(['low', 'medium', 'high', 'critical']).toContain(analysis.risk_level);
      expect(analysis.claim_id).toBe(testClaimId);
      expect(analysis.patient_id).toBe(testPatientId);
    });

    test('should detect high amount anomaly', async () => {
      await new Promise((resolve, reject) => {
        const stmt = db.prepare(`
          INSERT INTO insurance_claims (
            patient_id, claim_number, service_date, provider_name,
            diagnosis_codes, procedure_codes, total_amount, insurance_amount,
            patient_responsibility
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        stmt.run([
          testPatientId, 'HIGH001', '2024-01-16', 'Dr. Johnson',
          'M54.5', '99215', 15000.00, 12000.00, 3000.00
        ], function(err) {
          if (err) {
            reject(err);
          } else {
            resolve(this.lastID);
          }
        });
        
        stmt.finalize();
      });

      const analysis = await fraudDetectionService.analyzeClaimFraud(testClaimId + 1);
      
      expect(analysis.risk_score).toBeGreaterThan(20);
      expect(analysis.risk_level).toMatch(/medium|high|critical/);
      
      const flags = JSON.parse(analysis.flags);
      const amountAnomaly = flags.find(f => f.type === 'amount_anomaly');
      expect(amountAnomaly).toBeDefined();
    });

    test('should analyze claim patterns for existing patient', async () => {
      for (let i = 0; i < 5; i++) {
        await new Promise((resolve) => {
          const stmt = db.prepare(`
            INSERT INTO insurance_claims (
              patient_id, claim_number, service_date, provider_name,
              diagnosis_codes, procedure_codes, total_amount, insurance_amount,
              patient_responsibility
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          
          stmt.run([
            testPatientId, `PATTERN00${i}`, '2024-01-20', 'Dr. Brown',
            'J45.909', '99214', 200.00 + (i * 50), 160.00 + (i * 40), 40.00 + (i * 10)
          ], function(err) {
            stmt.finalize();
            resolve();
          });
        });
      }

      const pattern = await fraudDetectionService.analyzeClaimPattern(testPatientId);
      
      expect(pattern).toBeDefined();
      expect(pattern.claim_frequency_monthly).toBeGreaterThan(0);
      expect(pattern.average_claim_amount).toBeGreaterThan(0);
      expect(pattern.total_claimed_amount).toBeGreaterThan(0);
      expect(pattern.unique_providers_count).toBeGreaterThanOrEqual(1);
    });

    test('should detect timing anomalies', async () => {
      const baseDate = new Date();
      baseDate.setHours(baseDate.getHours() - 2);

      await new Promise((resolve, reject) => {
        const stmt = db.prepare(`
          INSERT INTO insurance_claims (
            patient_id, claim_number, service_date, provider_name,
            diagnosis_codes, procedure_codes, total_amount, insurance_amount,
            patient_responsibility, submission_date
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        stmt.run([
          testPatientId, 'TIMING001', '2024-01-17', 'Dr. Wilson',
          'K21.9', '99213', 180.00, 144.00, 36.00, baseDate.toISOString()
        ], function(err) {
          if (err) {
            reject(err);
          } else {
            resolve(this.lastID);
          }
        });
        
        stmt.finalize();
      });

      await new Promise((resolve, reject) => {
        const stmt = db.prepare(`
          INSERT INTO insurance_claims (
            patient_id, claim_number, service_date, provider_name,
            diagnosis_codes, procedure_codes, total_amount, insurance_amount,
            patient_responsibility, submission_date
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        stmt.run([
          testPatientId, 'TIMING002', '2024-01-17', 'Dr. Davis',
          'I10', '99214', 220.00, 176.00, 44.00, new Date().toISOString()
        ], function(err) {
          if (err) {
            reject(err);
          } else {
            resolve(this.lastID);
          }
        });
        
        stmt.finalize();
      });

      const analysis = await fraudDetectionService.analyzeClaimFraud(testClaimId + 3);
      
      const anomalies = JSON.parse(analysis.anomaly_data);
      expect(anomalies.timing_anomaly).toBe(true);
      
      const flags = JSON.parse(analysis.flags);
      const timingAnomaly = flags.find(f => f.type === 'timing_anomaly');
      expect(timingAnomaly).toBeDefined();
    });

    test('should update fraud thresholds', async () => {
      const newThresholds = {
        max_monthly_claims: 8,
        max_single_claim_amount: 15000,
        risk_score_threshold: 60,
        frequency_penalty: 12,
        amount_penalty: 22,
        pattern_penalty: 32,
        timing_penalty: 15,
        amount_anomaly_threshold: 2.5,
        timing_anomaly_hours: 12,
        provider_anomaly_threshold: 12
      };

      await fraudDetectionService.updateFraudThresholds(newThresholds, testUserId);
      
      const thresholds = await fraudDetectionService.getFraudThresholds();
      
      expect(thresholds.max_monthly_claims).toBe(8);
      expect(thresholds.max_single_claim_amount).toBe(15000);
      expect(thresholds.risk_score_threshold).toBe(60);
    });
  });

  describe('Fraud Detection API Routes', () => {
    test('POST /api/fraud-detection/analyze/:claimId - should analyze claim fraud', async () => {
      const response = await request(app)
        .post(`/api/fraud-detection/analyze/${testClaimId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.message).toBe('Fraud analysis completed successfully');
      expect(response.body.analysis).toBeDefined();
      expect(response.body.analysis.risk_score).toBeGreaterThanOrEqual(0);
      expect(response.body.analysis.risk_level).toMatch(/low|medium|high|critical/);
    });

    test('GET /api/fraud-detection/analysis/:claimId - should get fraud analysis', async () => {
      const response = await request(app)
        .get(`/api/fraud-detection/analysis/${testClaimId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.claim_id).toBe(testClaimId);
      expect(response.body.risk_score).toBeGreaterThanOrEqual(0);
      expect(response.body.risk_level).toMatch(/low|medium|high|critical/);
    });

    test('GET /api/fraud-detection/flagged - should get flagged claims', async () => {
      const response = await request(app)
        .get('/api/fraud-detection/flagged')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.flagged_claims).toBeDefined();
      expect(Array.isArray(response.body.flagged_claims)).toBe(true);
      expect(response.body.pagination).toBeDefined();
    });

    test('GET /api/fraud-detection/thresholds - should get fraud thresholds', async () => {
      const response = await request(app)
        .get('/api/fraud-detection/thresholds')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.max_monthly_claims).toBeDefined();
      expect(response.body.max_single_claim_amount).toBeDefined();
      expect(response.body.risk_score_threshold).toBeDefined();
    });

    test('GET /api/fraud-detection/dashboard/summary - should get dashboard summary', async () => {
      const response = await request(app)
        .get('/api/fraud-detection/dashboard/summary')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.total_flagged_claims).toBeDefined();
      expect(response.body.pending_review).toBeDefined();
      expect(response.body.risk_distribution).toBeDefined();
      expect(response.body.current_thresholds).toBeDefined();
      expect(response.body.recent_activity).toBeDefined();
    });

    test('GET /api/fraud-detection/patient/:patientId/pattern - should get patient pattern', async () => {
      const response = await request(app)
        .get(`/api/fraud-detection/patient/${testPatientId}/pattern`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.patient_id).toBe(testPatientId);
      expect(response.body.claim_frequency_monthly).toBeDefined();
      expect(response.body.average_claim_amount).toBeDefined();
    });

    test('PUT /api/fraud-detection/thresholds - should update thresholds (admin only)', async () => {
      const newThresholds = {
        max_monthly_claims: 6,
        max_single_claim_amount: 12000,
        risk_score_threshold: 55
      };

      const response = await request(app)
        .put('/api/fraud-detection/thresholds')
        .set('Authorization', `Bearer ${authToken}`)
        .send(newThresholds)
        .expect(403);

      expect(response.body.error).toBe('Admin access required to update thresholds');
    });

    test('PUT /api/fraud-detection/flagged/:claimId/resolve - should resolve flagged claim', async () => {
      const response = await request(app)
        .put(`/api/fraud-detection/flagged/${testClaimId}/resolve`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          reviewNotes: 'Claim reviewed and found to be legitimate',
          status: 'resolved'
        })
        .expect(403);

      expect(response.body.error).toBe('Admin or provider access required to resolve flagged claims');
    });
  });

  describe('Integration Tests', () => {
    test('should automatically analyze fraud on claim submission', async () => {
      const claimData = {
        patientId: testPatientId,
        claimNumber: 'AUTO001',
        serviceDate: '2024-01-18',
        providerName: 'Dr. Miller',
        diagnosisCodes: 'M25.55',
        procedureCodes: '99213',
        totalAmount: 5000.00,
        insuranceAmount: 4000.00,
        patientResponsibility: 1000.00,
        notes: 'Test claim for automatic fraud detection'
      };

      const response = await request(app)
        .post('/api/claims')
        .set('Authorization', `Bearer ${authToken}`)
        .send(claimData)
        .expect(201);

      expect(response.body.message).toBe('Claim created successfully');
      expect(response.body.claimId).toBeDefined();
      expect(response.body.fraudAnalysis).toBeDefined();
      expect(response.body.fraudAnalysis.risk_level).toMatch(/low|medium|high|critical/);
    });

    test('should handle high-risk claim flagging', async () => {
      const highRiskClaimData = {
        patientId: testPatientId,
        claimNumber: 'HIGH002',
        serviceDate: '2024-01-19',
        providerName: 'Dr. Garcia',
        diagnosisCodes: 'R07.9,M54.5,I10,J45.909,K21.9,F41.1',
        procedureCodes: '99215,99213,99214',
        totalAmount: 25000.00,
        insuranceAmount: 20000.00,
        patientResponsibility: 5000.00,
        notes: 'High value claim with multiple diagnoses'
      };

      const response = await request(app)
        .post('/api/claims')
        .set('Authorization', `Bearer ${authToken}`)
        .send(highRiskClaimData)
        .expect(201);

      expect(response.body.fraudAnalysis.requires_review).toBe(true);
      expect(['high', 'critical']).toContain(response.body.fraudAnalysis.risk_level);
    });
  });

  describe('Error Handling', () => {
    test('should handle non-existent claim analysis', async () => {
      const response = await request(app)
        .get('/api/fraud-detection/analysis/99999')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.error).toBe('Fraud analysis not found for this claim');
    });

    test('should handle invalid claim ID in analysis', async () => {
      const response = await request(app)
        .post('/api/fraud-detection/analyze/invalid')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(500);
    });

    test('should handle unauthorized access', async () => {
      const response = await request(app)
        .get('/api/fraud-detection/flagged')
        .expect(401);

      expect(response.body.error).toBeDefined();
    });
  });
});
