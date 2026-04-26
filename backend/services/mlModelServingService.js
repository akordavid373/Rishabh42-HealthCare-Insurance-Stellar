const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../database/healthcare.db');

class MLModelServingService {
  getDatabase() {
    return new sqlite3.Database(DB_PATH);
  }

  // ── Model Registry ──────────────────────────────────────────────────────────

  async registerModel(data) {
    const db = this.getDatabase();
    const modelId = uuidv4();
    try {
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO ml_models
            (model_id, name, version, model_type, description, artifact_path,
             input_schema, output_schema, hyperparameters, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'staging', CURRENT_TIMESTAMP)`,
          [modelId, data.name, data.version, data.model_type, data.description || null,
           data.artifact_path || null,
           JSON.stringify(data.input_schema || {}),
           JSON.stringify(data.output_schema || {}),
           JSON.stringify(data.hyperparameters || {})],
          function(err) { if (err) reject(err); else resolve(); }
        );
      });
      return { model_id: modelId, status: 'staging', ...data };
    } finally { db.close(); }
  }

  async promoteModel(modelId, status) {
    const db = this.getDatabase();
    const allowed = ['staging', 'production', 'deprecated', 'archived'];
    if (!allowed.includes(status)) throw new Error(`Invalid status. Allowed: ${allowed.join(', ')}`);
    try {
      // Only one model per name can be production at a time
      if (status === 'production') {
        const model = await new Promise((resolve, reject) => {
          db.get('SELECT name FROM ml_models WHERE model_id = ?', [modelId],
            (err, row) => { if (err) reject(err); else resolve(row); });
        });
        if (model) {
          await new Promise((resolve, reject) => {
            db.run(`UPDATE ml_models SET status = 'deprecated' WHERE name = ? AND status = 'production' AND model_id != ?`,
              [model.name, modelId], (err) => { if (err) reject(err); else resolve(); });
          });
        }
      }
      await new Promise((resolve, reject) => {
        db.run('UPDATE ml_models SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE model_id = ?',
          [status, modelId], function(err) { if (err) reject(err); else resolve(this.changes); });
      });
      return { model_id: modelId, status };
    } finally { db.close(); }
  }

  async listModels(filters = {}) {
    const db = this.getDatabase();
    try {
      let query = 'SELECT * FROM ml_models WHERE 1=1';
      const params = [];
      if (filters.name) { query += ' AND name = ?'; params.push(filters.name); }
      if (filters.status) { query += ' AND status = ?'; params.push(filters.status); }
      if (filters.model_type) { query += ' AND model_type = ?'; params.push(filters.model_type); }
      query += ' ORDER BY created_at DESC';
      const rows = await new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => { if (err) reject(err); else resolve(rows); });
      });
      return rows.map(r => ({
        ...r,
        input_schema: JSON.parse(r.input_schema || '{}'),
        output_schema: JSON.parse(r.output_schema || '{}'),
        hyperparameters: JSON.parse(r.hyperparameters || '{}')
      }));
    } finally { db.close(); }
  }

  // ── Inference ────────────────────────────────────────────────────────────────

  async predict(modelId, inputData, requestMeta = {}) {
    const db = this.getDatabase();
    const predictionId = uuidv4();
    const start = Date.now();
    try {
      const model = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM ml_models WHERE model_id = ? AND status IN (?, ?)',
          [modelId, 'production', 'staging'],
          (err, row) => { if (err) reject(err); else resolve(row); });
      });
      if (!model) throw new Error('Model not found or not available for inference');

      // Simulated inference — in production this would call the actual model artifact
      const prediction = this.simulateInference(model, inputData);
      const latencyMs = Date.now() - start;

      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO ml_predictions
            (prediction_id, model_id, input_data, output_data, latency_ms, ab_variant, created_at)
           VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [predictionId, modelId, JSON.stringify(inputData),
           JSON.stringify(prediction), latencyMs, requestMeta.ab_variant || null],
          (err) => { if (err) reject(err); else resolve(); }
        );
      });

      await this.recordMetric(db, modelId, 'latency_ms', latencyMs);
      await this.recordMetric(db, modelId, 'request_count', 1);

      return { prediction_id: predictionId, model_id: modelId, prediction, latency_ms: latencyMs };
    } finally { db.close(); }
  }

  simulateInference(model, inputData) {
    // Deterministic mock based on model type
    switch (model.model_type) {
      case 'risk_scoring':
        return { risk_score: Math.min(1, Object.values(inputData).reduce((s, v) => s + (typeof v === 'number' ? v * 0.01 : 0), 0.1)), confidence: 0.87 };
      case 'diagnosis_assist':
        return { suggested_codes: ['Z00.00', 'J06.9'], confidence_scores: [0.82, 0.61] };
      case 'fraud_detection':
        return { is_fraud: false, fraud_probability: 0.12, flags: [] };
      case 'premium_prediction':
        return { predicted_premium: 450.00, adjustment_factor: 1.05, confidence: 0.91 };
      default:
        return { result: 'processed', input_features: Object.keys(inputData).length };
    }
  }

  // ── A/B Testing ──────────────────────────────────────────────────────────────

  async createExperiment(data) {
    const db = this.getDatabase();
    const experimentId = uuidv4();
    try {
      const totalWeight = data.variants.reduce((s, v) => s + (v.weight || 0), 0);
      if (Math.abs(totalWeight - 100) > 0.01) throw new Error('Variant weights must sum to 100');

      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO ml_experiments
            (experiment_id, name, description, variants, status, start_date, end_date, created_at)
           VALUES (?, ?, ?, ?, 'active', ?, ?, CURRENT_TIMESTAMP)`,
          [experimentId, data.name, data.description || null,
           JSON.stringify(data.variants), data.start_date || null, data.end_date || null],
          (err) => { if (err) reject(err); else resolve(); }
        );
      });
      return { experiment_id: experimentId, status: 'active', ...data };
    } finally { db.close(); }
  }

  assignVariant(experimentId, userId) {
    // Deterministic assignment based on hash
    const hash = [...`${experimentId}${userId}`].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0);
    return hash % 100; // returns 0-99, caller maps to variant by weight
  }

  async getExperimentResults(experimentId) {
    const db = this.getDatabase();
    try {
      const experiment = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM ml_experiments WHERE experiment_id = ?', [experimentId],
          (err, row) => { if (err) reject(err); else resolve(row); });
      });
      if (!experiment) throw new Error('Experiment not found');

      const variants = JSON.parse(experiment.variants || '[]');
      const results = await Promise.all(variants.map(async (v) => {
        const stats = await new Promise((resolve, reject) => {
          db.get(
            `SELECT COUNT(*) as requests, AVG(latency_ms) as avg_latency
             FROM ml_predictions WHERE model_id = ? AND ab_variant = ?`,
            [v.model_id, v.name],
            (err, row) => { if (err) reject(err); else resolve(row); }
          );
        });
        return { variant: v.name, model_id: v.model_id, weight: v.weight, ...stats };
      }));

      return { experiment_id: experimentId, name: experiment.name, status: experiment.status, results };
    } finally { db.close(); }
  }

  // ── Performance Metrics ──────────────────────────────────────────────────────

  async recordMetric(db, modelId, metricName, value) {
    return new Promise((resolve) => {
      db.run(
        `INSERT INTO ml_metrics (metric_id, model_id, metric_name, value, recorded_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [uuidv4(), modelId, metricName, value],
        () => resolve() // non-fatal
      );
    });
  }

  async getModelMetrics(modelId, metricName, hours = 24) {
    const db = this.getDatabase();
    try {
      let query = `SELECT metric_name, AVG(value) as avg_value, MIN(value) as min_value,
                   MAX(value) as max_value, COUNT(*) as sample_count
                   FROM ml_metrics WHERE model_id = ?
                   AND recorded_at >= datetime('now', '-${parseInt(hours)} hours')`;
      const params = [modelId];
      if (metricName) { query += ' AND metric_name = ?'; params.push(metricName); }
      query += ' GROUP BY metric_name';

      return await new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => { if (err) reject(err); else resolve(rows); });
      });
    } finally { db.close(); }
  }
}

module.exports = new MLModelServingService();
