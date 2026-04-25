const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../database/healthcare.db');

class InsuranceMarketplaceService {
  getDatabase() {
    return new sqlite3.Database(DB_PATH);
  }

  async listPolicy(policyData) {
    const db = this.getDatabase();
    const policyId = uuidv4();
    try {
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO marketplace_policies
            (policy_id, provider_id, policy_name, policy_type, coverage_amount, monthly_premium,
             deductible, coverage_details, eligibility_criteria, smart_contract_address, status, listed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)`,
          [policyId, policyData.provider_id, policyData.policy_name, policyData.policy_type,
           policyData.coverage_amount, policyData.monthly_premium, policyData.deductible || 0,
           JSON.stringify(policyData.coverage_details || {}),
           JSON.stringify(policyData.eligibility_criteria || {}),
           policyData.smart_contract_address || null],
          function(err) { if (err) reject(err); else resolve(); }
        );
      });
      return { policy_id: policyId, status: 'active', ...policyData };
    } finally {
      db.close();
    }
  }

  async searchPolicies(filters = {}) {
    const db = this.getDatabase();
    try {
      let query = `SELECT mp.*, AVG(pr.rating) as avg_rating, COUNT(pr.id) as review_count
                   FROM marketplace_policies mp
                   LEFT JOIN policy_ratings pr ON mp.policy_id = pr.policy_id
                   WHERE mp.status = 'active'`;
      const params = [];

      if (filters.policy_type) { query += ' AND mp.policy_type = ?'; params.push(filters.policy_type); }
      if (filters.max_premium) { query += ' AND mp.monthly_premium <= ?'; params.push(filters.max_premium); }
      if (filters.min_coverage) { query += ' AND mp.coverage_amount >= ?'; params.push(filters.min_coverage); }
      if (filters.max_deductible) { query += ' AND mp.deductible <= ?'; params.push(filters.max_deductible); }

      query += ' GROUP BY mp.policy_id ORDER BY avg_rating DESC, mp.monthly_premium ASC';
      if (filters.limit) { query += ' LIMIT ?'; params.push(parseInt(filters.limit)); }

      const rows = await new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => { if (err) reject(err); else resolve(rows); });
      });

      return rows.map(r => ({
        ...r,
        coverage_details: JSON.parse(r.coverage_details || '{}'),
        eligibility_criteria: JSON.parse(r.eligibility_criteria || '{}'),
        avg_rating: r.avg_rating ? Math.round(r.avg_rating * 10) / 10 : null
      }));
    } finally {
      db.close();
    }
  }

  async comparePolicies(policyIds) {
    const db = this.getDatabase();
    try {
      const placeholders = policyIds.map(() => '?').join(',');
      const rows = await new Promise((resolve, reject) => {
        db.all(
          `SELECT mp.*, AVG(pr.rating) as avg_rating FROM marketplace_policies mp
           LEFT JOIN policy_ratings pr ON mp.policy_id = pr.policy_id
           WHERE mp.policy_id IN (${placeholders}) GROUP BY mp.policy_id`,
          policyIds,
          (err, rows) => { if (err) reject(err); else resolve(rows); }
        );
      });

      const policies = rows.map(r => ({
        ...r,
        coverage_details: JSON.parse(r.coverage_details || '{}'),
        eligibility_criteria: JSON.parse(r.eligibility_criteria || '{}'),
        avg_rating: r.avg_rating ? Math.round(r.avg_rating * 10) / 10 : null
      }));

      return {
        policies,
        comparison: this.generateComparison(policies)
      };
    } finally {
      db.close();
    }
  }

  generateComparison(policies) {
    if (policies.length === 0) return {};
    return {
      lowest_premium: policies.reduce((a, b) => a.monthly_premium < b.monthly_premium ? a : b).policy_id,
      highest_coverage: policies.reduce((a, b) => a.coverage_amount > b.coverage_amount ? a : b).policy_id,
      lowest_deductible: policies.reduce((a, b) => a.deductible < b.deductible ? a : b).policy_id,
      highest_rated: policies.filter(p => p.avg_rating).reduce((a, b) => (a.avg_rating || 0) > (b.avg_rating || 0) ? a : b, policies[0])?.policy_id
    };
  }

  async submitRating(policyId, userId, rating, review) {
    const db = this.getDatabase();
    try {
      if (rating < 1 || rating > 5) throw new Error('Rating must be between 1 and 5');
      const ratingId = uuidv4();
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO policy_ratings (id, policy_id, user_id, rating, review, created_at)
           VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [ratingId, policyId, userId, rating, review || null],
          (err) => { if (err) reject(err); else resolve(); }
        );
      });
      return { rating_id: ratingId, policy_id: policyId, rating };
    } finally {
      db.close();
    }
  }

  async runUnderwriting(patientId, policyId) {
    const db = this.getDatabase();
    try {
      const [patient, policy, claimHistory] = await Promise.all([
        new Promise((resolve, reject) => {
          db.get(`SELECT p.*, u.date_of_birth FROM patients p JOIN users u ON p.user_id = u.id WHERE p.id = ?`,
            [patientId], (err, row) => { if (err) reject(err); else resolve(row); });
        }),
        new Promise((resolve, reject) => {
          db.get('SELECT * FROM marketplace_policies WHERE policy_id = ?', [policyId],
            (err, row) => { if (err) reject(err); else resolve(row); });
        }),
        new Promise((resolve, reject) => {
          db.get(`SELECT COUNT(*) as count, SUM(total_amount) as total FROM insurance_claims WHERE patient_id = ?`,
            [patientId], (err, row) => { if (err) reject(err); else resolve(row); });
        })
      ]);

      if (!patient || !policy) throw new Error('Patient or policy not found');

      const age = patient.date_of_birth
        ? Math.floor((Date.now() - new Date(patient.date_of_birth)) / (365.25 * 24 * 60 * 60 * 1000))
        : 35;

      let riskScore = 0;
      if (age > 60) riskScore += 20;
      else if (age > 45) riskScore += 10;
      if (claimHistory.count > 5) riskScore += 15;
      if (claimHistory.total > 50000) riskScore += 20;
      if (patient.allergies) riskScore += 5;

      const approved = riskScore < 50;
      const adjustedPremium = policy.monthly_premium * (1 + riskScore / 200);

      return {
        patient_id: patientId,
        policy_id: policyId,
        risk_score: riskScore,
        decision: approved ? 'approved' : 'declined',
        adjusted_monthly_premium: approved ? Math.round(adjustedPremium * 100) / 100 : null,
        risk_factors: { age, claim_count: claimHistory.count, total_claims: claimHistory.total }
      };
    } finally {
      db.close();
    }
  }

  async fileDispute(policyId, userId, disputeData) {
    const db = this.getDatabase();
    const disputeId = uuidv4();
    try {
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO policy_disputes (dispute_id, policy_id, user_id, reason, description, status, filed_at)
           VALUES (?, ?, ?, ?, ?, 'open', CURRENT_TIMESTAMP)`,
          [disputeId, policyId, userId, disputeData.reason, disputeData.description],
          (err) => { if (err) reject(err); else resolve(); }
        );
      });
      return { dispute_id: disputeId, policy_id: policyId, status: 'open' };
    } finally {
      db.close();
    }
  }

  async getDisputes(filters = {}) {
    const db = this.getDatabase();
    try {
      let query = 'SELECT * FROM policy_disputes WHERE 1=1';
      const params = [];
      if (filters.policy_id) { query += ' AND policy_id = ?'; params.push(filters.policy_id); }
      if (filters.user_id) { query += ' AND user_id = ?'; params.push(filters.user_id); }
      if (filters.status) { query += ' AND status = ?'; params.push(filters.status); }
      query += ' ORDER BY filed_at DESC';

      return await new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => { if (err) reject(err); else resolve(rows); });
      });
    } finally {
      db.close();
    }
  }
}

module.exports = new InsuranceMarketplaceService();
