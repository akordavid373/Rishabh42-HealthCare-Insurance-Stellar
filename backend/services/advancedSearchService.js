const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../database/healthcare.db');

// Searchable entity types and their DB mappings
const ENTITY_CONFIG = {
  patients: {
    table: 'patients p JOIN users u ON p.user_id = u.id',
    fields: ['u.first_name', 'u.last_name', 'p.medical_record_number', 'p.insurance_provider'],
    select: 'p.id, u.first_name, u.last_name, p.medical_record_number, p.insurance_provider, p.blood_type',
    facets: ['blood_type', 'insurance_provider']
  },
  medical_records: {
    table: 'medical_records',
    fields: ['title', 'description', 'diagnosis_code', 'provider_name', 'facility_name'],
    select: 'id, title, record_type, diagnosis_code, provider_name, date_of_service',
    facets: ['record_type', 'provider_name']
  },
  claims: {
    table: 'insurance_claims',
    fields: ['claim_number', 'provider_name', 'diagnosis_codes', 'procedure_codes'],
    select: 'id, claim_number, provider_name, total_amount, status, service_date',
    facets: ['status']
  },
  appointments: {
    table: 'appointments a JOIN users u ON a.provider_id = u.id',
    fields: ['u.first_name', 'u.last_name', 'a.notes', 'a.appointment_type'],
    select: 'a.id, a.appointment_type, a.status, a.appointment_date, u.first_name as provider_first, u.last_name as provider_last',
    facets: ['appointment_type', 'status']
  }
};

class AdvancedSearchService {
  getDatabase() {
    return new sqlite3.Database(DB_PATH);
  }

  // ── Semantic / Full-text Search ──────────────────────────────────────────────

  async search(query, options = {}) {
    const { entity_types, filters = {}, facets: requestedFacets, limit = 20, offset = 0, patient_id } = options;
    const searchId = uuidv4();
    const start = Date.now();

    const types = entity_types || Object.keys(ENTITY_CONFIG);
    const results = {};
    const facetData = {};

    await Promise.all(types.map(async (type) => {
      const config = ENTITY_CONFIG[type];
      if (!config) return;
      const { hits, facets } = await this.searchEntity(type, config, query, filters, limit, offset, patient_id);
      results[type] = hits;
      facetData[type] = facets;
    }));

    const latencyMs = Date.now() - start;
    await this.logSearch(searchId, query, options, latencyMs);

    return {
      search_id: searchId,
      query,
      results,
      facets: facetData,
      latency_ms: latencyMs,
      total_types_searched: types.length
    };
  }

  async searchEntity(type, config, query, filters, limit, offset, patientId) {
    const db = this.getDatabase();
    try {
      const terms = this.tokenize(query);
      const whereConditions = [];
      const params = [];

      // Patient scope filter
      if (patientId && ['medical_records', 'claims', 'appointments'].includes(type)) {
        whereConditions.push(`${type === 'appointments' ? 'a' : ''}.patient_id = ?`);
        params.push(patientId);
      }

      // Full-text match across fields
      if (terms.length > 0) {
        const fieldConditions = config.fields.map(f =>
          terms.map(() => `${f} LIKE ?`).join(' OR ')
        ).join(' OR ');
        whereConditions.push(`(${fieldConditions})`);
        config.fields.forEach(() => terms.forEach(t => params.push(`%${t}%`)));
      }

      // Apply extra filters
      for (const [key, val] of Object.entries(filters)) {
        whereConditions.push(`${key} = ?`);
        params.push(val);
      }

      const where = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
      const sql = `SELECT ${config.select} FROM ${config.table} ${where} LIMIT ? OFFSET ?`;
      params.push(parseInt(limit), parseInt(offset));

      const hits = await new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => { if (err) reject(err); else resolve(rows); });
      });

      // Compute facets
      const facets = {};
      for (const facetField of config.facets) {
        const facetSql = `SELECT ${facetField} as value, COUNT(*) as count FROM ${config.table} ${where.replace(/LIMIT.*/, '')} GROUP BY ${facetField} LIMIT 20`;
        const facetParams = params.slice(0, -2); // remove limit/offset
        const facetRows = await new Promise((resolve, reject) => {
          db.all(facetSql, facetParams, (err, rows) => { if (err) resolve([]); else resolve(rows); });
        });
        facets[facetField] = facetRows;
      }

      return { hits: hits.map(h => ({ ...h, _entity_type: type, _relevance: this.scoreRelevance(h, terms) })), facets };
    } finally { db.close(); }
  }

  tokenize(query) {
    return query.toLowerCase().split(/\s+/).filter(t => t.length > 1);
  }

  scoreRelevance(hit, terms) {
    const text = Object.values(hit).join(' ').toLowerCase();
    return terms.reduce((score, term) => score + (text.includes(term) ? 1 : 0), 0) / Math.max(terms.length, 1);
  }

  // ── Recommendations ──────────────────────────────────────────────────────────

  async getRecommendations(patientId, context = {}) {
    const db = this.getDatabase();
    try {
      const [recentRecords, recentClaims, upcomingAppts] = await Promise.all([
        new Promise((resolve, reject) => {
          db.all(`SELECT record_type, diagnosis_code FROM medical_records WHERE patient_id = ? ORDER BY date_of_service DESC LIMIT 5`,
            [patientId], (err, rows) => { if (err) reject(err); else resolve(rows); });
        }),
        new Promise((resolve, reject) => {
          db.all(`SELECT status, total_amount FROM insurance_claims WHERE patient_id = ? ORDER BY submission_date DESC LIMIT 5`,
            [patientId], (err, rows) => { if (err) reject(err); else resolve(rows); });
        }),
        new Promise((resolve, reject) => {
          db.all(`SELECT appointment_type FROM appointments WHERE patient_id = ? AND appointment_date > datetime('now') LIMIT 3`,
            [patientId], (err, rows) => { if (err) reject(err); else resolve(rows); });
        })
      ]);

      const recommendations = [];

      if (recentRecords.some(r => r.record_type === 'diagnosis')) {
        recommendations.push({ type: 'follow_up', message: 'Schedule a follow-up based on recent diagnosis', priority: 'high' });
      }
      if (recentClaims.some(r => r.status === 'denied')) {
        recommendations.push({ type: 'claim_review', message: 'Review denied claims for appeal opportunities', priority: 'medium' });
      }
      if (upcomingAppts.length === 0) {
        recommendations.push({ type: 'appointment', message: 'No upcoming appointments — consider scheduling a check-up', priority: 'low' });
      }

      return { patient_id: patientId, recommendations, generated_at: new Date().toISOString() };
    } finally { db.close(); }
  }

  // ── Analytics ────────────────────────────────────────────────────────────────

  async logSearch(searchId, query, options, latencyMs) {
    const db = this.getDatabase();
    try {
      await new Promise((resolve) => {
        db.run(
          `INSERT INTO search_analytics (search_id, query, options, latency_ms, searched_at)
           VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [searchId, query, JSON.stringify(options), latencyMs],
          () => resolve()
        );
      });
    } finally { db.close(); }
  }

  async getSearchAnalytics(hours = 24) {
    const db = this.getDatabase();
    try {
      return await new Promise((resolve, reject) => {
        db.all(
          `SELECT query, COUNT(*) as count, AVG(latency_ms) as avg_latency
           FROM search_analytics
           WHERE searched_at >= datetime('now', '-${parseInt(hours)} hours')
           GROUP BY query ORDER BY count DESC LIMIT 50`,
          [], (err, rows) => { if (err) reject(err); else resolve(rows); }
        );
      });
    } finally { db.close(); }
  }
}

module.exports = new AdvancedSearchService();
