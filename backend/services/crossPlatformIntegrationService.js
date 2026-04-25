const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../database/healthcare.db');

const SUPPORTED_STANDARDS = ['HL7_FHIR', 'HL7_V2', 'DICOM', 'ICD10', 'CPT', 'SNOMED'];
const SUPPORTED_PLATFORMS = ['EHR', 'LIS', 'RIS', 'PACS', 'PMS', 'PHARMACY', 'INSURANCE'];

class CrossPlatformIntegrationService {
  getDatabase() {
    return new sqlite3.Database(DB_PATH);
  }

  async registerIntegration(data) {
    const db = this.getDatabase();
    const integrationId = uuidv4();
    try {
      if (!SUPPORTED_PLATFORMS.includes(data.platform_type)) {
        throw new Error(`Unsupported platform type. Supported: ${SUPPORTED_PLATFORMS.join(', ')}`);
      }
      if (!SUPPORTED_STANDARDS.includes(data.data_standard)) {
        throw new Error(`Unsupported data standard. Supported: ${SUPPORTED_STANDARDS.join(', ')}`);
      }

      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO platform_integrations
            (integration_id, platform_name, platform_type, data_standard, endpoint_url, auth_type, auth_config, sync_interval, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)`,
          [integrationId, data.platform_name, data.platform_type, data.data_standard,
           data.endpoint_url, data.auth_type || 'api_key',
           JSON.stringify(data.auth_config || {}), data.sync_interval || 300],
          function(err) { if (err) reject(err); else resolve(); }
        );
      });

      return { integration_id: integrationId, status: 'active', ...data };
    } finally {
      db.close();
    }
  }

  async syncData(integrationId, payload) {
    const db = this.getDatabase();
    const syncId = uuidv4();
    try {
      const integration = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM platform_integrations WHERE integration_id = ? AND status = ?',
          [integrationId, 'active'],
          (err, row) => { if (err) reject(err); else resolve(row); });
      });
      if (!integration) throw new Error('Integration not found or inactive');

      const standardized = this.standardizeData(payload, integration.data_standard);
      const validated = this.validateDataSchema(standardized, integration.data_standard);

      let syncResult = { success: true, records_synced: 0, errors: [] };
      try {
        const authConfig = JSON.parse(integration.auth_config || '{}');
        const headers = this.buildAuthHeaders(integration.auth_type, authConfig);
        const response = await axios.post(integration.endpoint_url, standardized, {
          headers, timeout: 10000
        });
        syncResult.records_synced = Array.isArray(payload.records) ? payload.records.length : 1;
        syncResult.response_status = response.status;
      } catch (httpErr) {
        syncResult.success = false;
        syncResult.errors.push(httpErr.message);
      }

      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO integration_sync_logs
            (sync_id, integration_id, direction, records_count, status, error_details, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [syncId, integrationId, payload.direction || 'outbound',
           syncResult.records_synced,
           syncResult.success ? 'success' : 'failed',
           syncResult.errors.length > 0 ? JSON.stringify(syncResult.errors) : null],
          (err) => { if (err) reject(err); else resolve(); }
        );
      });

      await new Promise((resolve, reject) => {
        db.run('UPDATE platform_integrations SET last_sync_at = CURRENT_TIMESTAMP WHERE integration_id = ?',
          [integrationId], (err) => { if (err) reject(err); else resolve(); });
      });

      return { sync_id: syncId, integration_id: integrationId, ...syncResult };
    } finally {
      db.close();
    }
  }

  standardizeData(payload, standard) {
    switch (standard) {
      case 'HL7_FHIR':
        return this.toFHIR(payload);
      case 'HL7_V2':
        return this.toHL7V2(payload);
      default:
        return payload;
    }
  }

  toFHIR(payload) {
    return {
      resourceType: payload.resource_type || 'Bundle',
      id: uuidv4(),
      type: 'transaction',
      timestamp: new Date().toISOString(),
      entry: Array.isArray(payload.records) ? payload.records.map(r => ({
        resource: { resourceType: r.type || 'Observation', ...r },
        request: { method: 'POST', url: r.type || 'Observation' }
      })) : [{ resource: payload }]
    };
  }

  toHL7V2(payload) {
    const now = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
    return {
      MSH: `MSH|^~\\&|HEALTHCARE|SYSTEM|${payload.destination || 'DEST'}|SYSTEM|${now}||${payload.message_type || 'ADT^A01'}|${uuidv4()}|P|2.5`,
      payload
    };
  }

  validateDataSchema(data, standard) {
    if (standard === 'HL7_FHIR' && !data.resourceType) {
      throw new Error('Invalid FHIR: missing resourceType');
    }
    return data;
  }

  buildAuthHeaders(authType, authConfig) {
    switch (authType) {
      case 'api_key':
        return { 'X-API-Key': authConfig.api_key, 'Content-Type': 'application/json' };
      case 'bearer':
        return { 'Authorization': `Bearer ${authConfig.token}`, 'Content-Type': 'application/json' };
      case 'basic':
        const encoded = Buffer.from(`${authConfig.username}:${authConfig.password}`).toString('base64');
        return { 'Authorization': `Basic ${encoded}`, 'Content-Type': 'application/json' };
      default:
        return { 'Content-Type': 'application/json' };
    }
  }

  async getIntegrations(filters = {}) {
    const db = this.getDatabase();
    try {
      let query = 'SELECT * FROM platform_integrations WHERE 1=1';
      const params = [];
      if (filters.platform_type) { query += ' AND platform_type = ?'; params.push(filters.platform_type); }
      if (filters.status) { query += ' AND status = ?'; params.push(filters.status); }
      query += ' ORDER BY created_at DESC';

      return await new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows.map(r => ({ ...r, auth_config: undefined }))); // strip secrets
        });
      });
    } finally {
      db.close();
    }
  }

  async getSyncLogs(integrationId, limit = 50) {
    const db = this.getDatabase();
    try {
      return await new Promise((resolve, reject) => {
        db.all(
          'SELECT * FROM integration_sync_logs WHERE integration_id = ? ORDER BY synced_at DESC LIMIT ?',
          [integrationId, limit],
          (err, rows) => { if (err) reject(err); else resolve(rows); }
        );
      });
    } finally {
      db.close();
    }
  }

  async updateIntegrationStatus(integrationId, status) {
    const db = this.getDatabase();
    try {
      await new Promise((resolve, reject) => {
        db.run('UPDATE platform_integrations SET status = ? WHERE integration_id = ?',
          [status, integrationId],
          function(err) { if (err) reject(err); else resolve(this.changes); });
      });
      return { integration_id: integrationId, status };
    } finally {
      db.close();
    }
  }
}

module.exports = new CrossPlatformIntegrationService();
