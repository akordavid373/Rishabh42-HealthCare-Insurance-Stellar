const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../database/healthcare.db');

class IoTHealthMonitoringService {
  constructor() {
    this.alertThresholds = {
      heart_rate: { min: 40, max: 150, critical_min: 30, critical_max: 180 },
      blood_pressure_systolic: { min: 80, max: 140, critical_min: 60, critical_max: 180 },
      blood_pressure_diastolic: { min: 50, max: 90, critical_min: 40, critical_max: 120 },
      blood_oxygen: { min: 94, max: 100, critical_min: 88, critical_max: 100 },
      temperature: { min: 36.0, max: 37.8, critical_min: 35.0, critical_max: 40.0 },
      glucose: { min: 70, max: 140, critical_min: 50, critical_max: 300 },
      respiratory_rate: { min: 12, max: 20, critical_min: 8, critical_max: 30 }
    };
  }

  getDatabase() {
    return new sqlite3.Database(DB_PATH);
  }

  async registerDevice(patientId, deviceData) {
    const db = this.getDatabase();
    const deviceId = uuidv4();
    try {
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO iot_devices (device_id, patient_id, device_type, device_name, manufacturer, model, firmware_version, status, registered_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)`,
          [deviceId, patientId, deviceData.device_type, deviceData.device_name,
           deviceData.manufacturer, deviceData.model, deviceData.firmware_version || '1.0.0'],
          function(err) { if (err) reject(err); else resolve(this.lastID); }
        );
      });
      return { device_id: deviceId, patient_id: patientId, status: 'active', ...deviceData };
    } finally {
      db.close();
    }
  }

  async ingestReading(deviceId, readings) {
    const db = this.getDatabase();
    try {
      const device = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM iot_devices WHERE device_id = ? AND status = ?', [deviceId, 'active'],
          (err, row) => { if (err) reject(err); else resolve(row); });
      });
      if (!device) throw new Error('Device not found or inactive');

      const validated = this.validateReadings(readings);
      const alerts = this.checkAlertThresholds(validated, device.patient_id);
      const readingId = uuidv4();

      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO iot_health_readings (reading_id, device_id, patient_id, readings, alert_level, timestamp)
           VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [readingId, deviceId, device.patient_id, JSON.stringify(validated),
           alerts.length > 0 ? alerts[0].level : 'normal'],
          function(err) { if (err) reject(err); else resolve(); }
        );
      });

      await new Promise((resolve, reject) => {
        db.run('UPDATE iot_devices SET last_reading_at = CURRENT_TIMESTAMP WHERE device_id = ?',
          [deviceId], (err) => { if (err) reject(err); else resolve(); });
      });

      if (alerts.length > 0) {
        await this.createAlerts(db, device.patient_id, deviceId, alerts);
      }

      return { reading_id: readingId, validated_readings: validated, alerts };
    } finally {
      db.close();
    }
  }

  validateReadings(readings) {
    const validated = {};
    const allowedMetrics = Object.keys(this.alertThresholds);
    for (const [key, value] of Object.entries(readings)) {
      if (allowedMetrics.includes(key) && typeof value === 'number' && isFinite(value)) {
        validated[key] = value;
      }
    }
    if (Object.keys(validated).length === 0) throw new Error('No valid readings provided');
    return validated;
  }

  checkAlertThresholds(readings, patientId) {
    const alerts = [];
    for (const [metric, value] of Object.entries(readings)) {
      const threshold = this.alertThresholds[metric];
      if (!threshold) continue;
      if (value <= threshold.critical_min || value >= threshold.critical_max) {
        alerts.push({ metric, value, level: 'critical', message: `Critical ${metric}: ${value}` });
      } else if (value < threshold.min || value > threshold.max) {
        alerts.push({ metric, value, level: 'warning', message: `Abnormal ${metric}: ${value}` });
      }
    }
    return alerts;
  }

  async createAlerts(db, patientId, deviceId, alerts) {
    for (const alert of alerts) {
      const alertId = uuidv4();
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO iot_alerts (alert_id, patient_id, device_id, metric, value, level, message, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)`,
          [alertId, patientId, deviceId, alert.metric, alert.value, alert.level, alert.message],
          (err) => { if (err) reject(err); else resolve(); }
        );
      });
    }
  }

  async getPatientReadings(patientId, options = {}) {
    const db = this.getDatabase();
    const { limit = 100, offset = 0, metric, from, to } = options;
    try {
      let query = 'SELECT * FROM iot_health_readings WHERE patient_id = ?';
      const params = [patientId];
      if (from) { query += ' AND timestamp >= ?'; params.push(from); }
      if (to) { query += ' AND timestamp <= ?'; params.push(to); }
      query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
      params.push(parseInt(limit), parseInt(offset));

      const readings = await new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows.map(r => ({ ...r, readings: JSON.parse(r.readings || '{}') })));
        });
      });

      const total = await new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM iot_health_readings WHERE patient_id = ?',
          [patientId], (err, row) => { if (err) reject(err); else resolve(row.count); });
      });

      return { readings, total, limit: parseInt(limit), offset: parseInt(offset) };
    } finally {
      db.close();
    }
  }

  async getActiveAlerts(patientId) {
    const db = this.getDatabase();
    try {
      return await new Promise((resolve, reject) => {
        db.all(
          'SELECT * FROM iot_alerts WHERE patient_id = ? AND status = ? ORDER BY created_at DESC',
          [patientId, 'active'],
          (err, rows) => { if (err) reject(err); else resolve(rows); }
        );
      });
    } finally {
      db.close();
    }
  }

  async acknowledgeAlert(alertId, acknowledgedBy) {
    const db = this.getDatabase();
    try {
      await new Promise((resolve, reject) => {
        db.run(
          `UPDATE iot_alerts SET status = 'acknowledged', acknowledged_by = ?, acknowledged_at = CURRENT_TIMESTAMP WHERE alert_id = ?`,
          [acknowledgedBy, alertId],
          function(err) { if (err) reject(err); else resolve(this.changes); }
        );
      });
      return { alert_id: alertId, status: 'acknowledged' };
    } finally {
      db.close();
    }
  }

  async triggerEmergencyResponse(patientId, alertId, responderId) {
    const db = this.getDatabase();
    const responseId = uuidv4();
    try {
      const alert = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM iot_alerts WHERE alert_id = ?', [alertId],
          (err, row) => { if (err) reject(err); else resolve(row); });
      });
      if (!alert) throw new Error('Alert not found');

      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO emergency_responses (response_id, patient_id, alert_id, responder_id, status, initiated_at)
           VALUES (?, ?, ?, ?, 'initiated', CURRENT_TIMESTAMP)`,
          [responseId, patientId, alertId, responderId],
          (err) => { if (err) reject(err); else resolve(); }
        );
      });

      await new Promise((resolve, reject) => {
        db.run(`UPDATE iot_alerts SET status = 'emergency_response' WHERE alert_id = ?`,
          [alertId], (err) => { if (err) reject(err); else resolve(); });
      });

      return { response_id: responseId, patient_id: patientId, alert_id: alertId, status: 'initiated' };
    } finally {
      db.close();
    }
  }

  async getDevices(patientId) {
    const db = this.getDatabase();
    try {
      return await new Promise((resolve, reject) => {
        db.all('SELECT * FROM iot_devices WHERE patient_id = ? ORDER BY registered_at DESC',
          [patientId], (err, rows) => { if (err) reject(err); else resolve(rows); });
      });
    } finally {
      db.close();
    }
  }

  async updateDeviceStatus(deviceId, status) {
    const db = this.getDatabase();
    try {
      await new Promise((resolve, reject) => {
        db.run('UPDATE iot_devices SET status = ? WHERE device_id = ?', [status, deviceId],
          function(err) { if (err) reject(err); else resolve(this.changes); });
      });
      return { device_id: deviceId, status };
    } finally {
      db.close();
    }
  }
}

module.exports = new IoTHealthMonitoringService();
