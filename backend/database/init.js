const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'healthcare.db');

function initializeDatabase() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('Error opening database:', err);
        reject(err);
        return;
      }
      console.log('Connected to SQLite database');
    });

    const tables = [
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('patient', 'provider', 'admin')),
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        date_of_birth DATE,
        phone TEXT,
        address TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS patients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        medical_record_number TEXT UNIQUE NOT NULL,
        insurance_provider TEXT,
        insurance_policy_number TEXT,
        emergency_contact_name TEXT,
        emergency_contact_phone TEXT,
        blood_type TEXT,
        allergies TEXT,
        medications TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )`,

      `CREATE TABLE IF NOT EXISTS medical_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id INTEGER NOT NULL,
        provider_id INTEGER NOT NULL,
        record_type TEXT NOT NULL CHECK (record_type IN ('diagnosis', 'treatment', 'lab_result', 'prescription', 'imaging', 'vaccination')),
        title TEXT NOT NULL,
        description TEXT,
        diagnosis_code TEXT,
        treatment_code TEXT,
        date_of_service DATE NOT NULL,
        facility_name TEXT,
        provider_name TEXT,
        notes TEXT,
        attachments TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (patient_id) REFERENCES patients (id),
        FOREIGN KEY (provider_id) REFERENCES users (id)
      )`,

      `CREATE TABLE IF NOT EXISTS insurance_claims (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id INTEGER NOT NULL,
        claim_number TEXT UNIQUE NOT NULL,
        service_date DATE NOT NULL,
        provider_name TEXT NOT NULL,
        diagnosis_codes TEXT,
        procedure_codes TEXT,
        total_amount DECIMAL(10,2) NOT NULL,
        insurance_amount DECIMAL(10,2),
        patient_responsibility DECIMAL(10,2),
        status TEXT NOT NULL CHECK (status IN ('submitted', 'pending', 'approved', 'denied', 'partially_approved', 'paid')),
        submission_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        processing_date DATETIME,
        payment_date DATETIME,
        denial_reason TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (patient_id) REFERENCES patients (id)
      )`,

      `CREATE TABLE IF NOT EXISTS premium_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id INTEGER NOT NULL,
        payment_amount DECIMAL(10,2) NOT NULL,
        payment_date DATE NOT NULL,
        payment_method TEXT CHECK (payment_method IN ('credit_card', 'bank_transfer', 'check', 'cash')),
        payment_status TEXT CHECK (payment_status IN ('pending', 'completed', 'failed', 'refunded')),
        transaction_id TEXT,
        insurance_provider TEXT,
        policy_number TEXT,
        coverage_period_start DATE,
        coverage_period_end DATE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (patient_id) REFERENCES patients (id)
      )`,

      `CREATE TABLE IF NOT EXISTS appointments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id INTEGER NOT NULL,
        provider_id INTEGER NOT NULL,
        appointment_date DATETIME NOT NULL,
        duration_minutes INTEGER NOT NULL,
        appointment_type TEXT CHECK (appointment_type IN ('consultation', 'follow_up', 'procedure', 'lab_test', 'imaging', 'vaccination')),
        status TEXT CHECK (status IN ('scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show')),
        notes TEXT,
        virtual BOOLEAN DEFAULT FALSE,
        meeting_link TEXT,
        reminder_sent BOOLEAN DEFAULT FALSE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (patient_id) REFERENCES patients (id),
        FOREIGN KEY (provider_id) REFERENCES users (id)
      )`,

      `CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        type TEXT CHECK (type IN ('appointment', 'claim', 'payment', 'system', 'medical_record', 'premium_adjustment')),
        priority TEXT CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
        read BOOLEAN DEFAULT FALSE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )`,

      `CREATE TABLE IF NOT EXISTS iot_devices (
        device_id TEXT PRIMARY KEY,
        patient_id INTEGER NOT NULL,
        device_type TEXT NOT NULL,
        device_name TEXT NOT NULL,
        manufacturer TEXT,
        model TEXT,
        firmware_version TEXT DEFAULT '1.0.0',
        status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance')),
        last_reading_at DATETIME,
        registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (patient_id) REFERENCES patients (id)
      )`,

      `CREATE TABLE IF NOT EXISTS iot_health_readings (
        reading_id TEXT PRIMARY KEY,
        device_id TEXT NOT NULL,
        patient_id INTEGER NOT NULL,
        readings TEXT NOT NULL,
        alert_level TEXT DEFAULT 'normal' CHECK (alert_level IN ('normal', 'warning', 'critical')),
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (device_id) REFERENCES iot_devices (device_id),
        FOREIGN KEY (patient_id) REFERENCES patients (id)
      )`,

      `CREATE TABLE IF NOT EXISTS iot_alerts (
        alert_id TEXT PRIMARY KEY,
        patient_id INTEGER NOT NULL,
        device_id TEXT NOT NULL,
        metric TEXT NOT NULL,
        value REAL NOT NULL,
        level TEXT NOT NULL CHECK (level IN ('warning', 'critical')),
        message TEXT NOT NULL,
        status TEXT DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'emergency_response')),
        acknowledged_by INTEGER,
        acknowledged_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (patient_id) REFERENCES patients (id)
      )`,

      `CREATE TABLE IF NOT EXISTS emergency_responses (
        response_id TEXT PRIMARY KEY,
        patient_id INTEGER NOT NULL,
        alert_id TEXT NOT NULL,
        responder_id INTEGER,
        status TEXT DEFAULT 'initiated' CHECK (status IN ('initiated', 'dispatched', 'on_scene', 'resolved')),
        initiated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        resolved_at DATETIME,
        FOREIGN KEY (patient_id) REFERENCES patients (id)
      )`,

      `CREATE TABLE IF NOT EXISTS platform_integrations (
        integration_id TEXT PRIMARY KEY,
        platform_name TEXT NOT NULL,
        platform_type TEXT NOT NULL,
        data_standard TEXT NOT NULL,
        endpoint_url TEXT NOT NULL,
        auth_type TEXT DEFAULT 'api_key',
        auth_config TEXT DEFAULT '{}',
        sync_interval INTEGER DEFAULT 300,
        status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error')),
        last_sync_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS integration_sync_logs (
        sync_id TEXT PRIMARY KEY,
        integration_id TEXT NOT NULL,
        direction TEXT DEFAULT 'outbound' CHECK (direction IN ('inbound', 'outbound', 'bidirectional')),
        records_count INTEGER DEFAULT 0,
        status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'partial')),
        error_details TEXT,
        synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (integration_id) REFERENCES platform_integrations (integration_id)
      )`,

      `CREATE TABLE IF NOT EXISTS advanced_payment_transactions (
        transaction_id TEXT PRIMARY KEY,
        payer_id TEXT NOT NULL,
        payee_id TEXT NOT NULL,
        amount REAL NOT NULL,
        currency TEXT NOT NULL,
        payment_method TEXT DEFAULT 'standard',
        status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed', 'blocked')),
        fraud_score REAL DEFAULT 0,
        fraud_flags TEXT DEFAULT '[]',
        settlement_data TEXT DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS marketplace_policies (
        policy_id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL,
        policy_name TEXT NOT NULL,
        policy_type TEXT NOT NULL,
        coverage_amount REAL NOT NULL,
        monthly_premium REAL NOT NULL,
        deductible REAL DEFAULT 0,
        coverage_details TEXT DEFAULT '{}',
        eligibility_criteria TEXT DEFAULT '{}',
        smart_contract_address TEXT,
        status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
        listed_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS policy_ratings (
        id TEXT PRIMARY KEY,
        policy_id TEXT NOT NULL,
        user_id INTEGER,
        rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
        review TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (policy_id) REFERENCES marketplace_policies (policy_id)
      )`,

      `CREATE TABLE IF NOT EXISTS policy_disputes (
        dispute_id TEXT PRIMARY KEY,
        policy_id TEXT NOT NULL,
        user_id INTEGER,
        reason TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'resolved', 'closed')),
        resolution TEXT,
        filed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        resolved_at DATETIME,
        FOREIGN KEY (policy_id) REFERENCES marketplace_policies (policy_id)
      )`
    ];

    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_patients_user_id ON patients(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_medical_records_patient_id ON medical_records(patient_id)',
      'CREATE INDEX IF NOT EXISTS idx_medical_records_date ON medical_records(date_of_service)',
      'CREATE INDEX IF NOT EXISTS idx_claims_patient_id ON insurance_claims(patient_id)',
      'CREATE INDEX IF NOT EXISTS idx_claims_status ON insurance_claims(status)',
      'CREATE INDEX IF NOT EXISTS idx_payments_patient_id ON premium_payments(patient_id)',
      'CREATE INDEX IF NOT EXISTS idx_appointments_patient_id ON appointments(patient_id)',
      'CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date)',
      'CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_iot_readings_patient ON iot_health_readings(patient_id)',
      'CREATE INDEX IF NOT EXISTS idx_iot_readings_device ON iot_health_readings(device_id)',
      'CREATE INDEX IF NOT EXISTS idx_iot_alerts_patient ON iot_alerts(patient_id)',
      'CREATE INDEX IF NOT EXISTS idx_iot_alerts_status ON iot_alerts(status)',
      'CREATE INDEX IF NOT EXISTS idx_adv_payments_payer ON advanced_payment_transactions(payer_id)',
      'CREATE INDEX IF NOT EXISTS idx_marketplace_type ON marketplace_policies(policy_type)',
      'CREATE INDEX IF NOT EXISTS idx_sync_logs_integration ON integration_sync_logs(integration_id)'

    ];

    let completedTables = 0;
    let completedIndexes = 0;

    tables.forEach((sql) => {
      db.run(sql, (err) => {
        if (err) {
          console.error('Error creating table:', err);
          reject(err);
          return;
        }
        completedTables++;
        if (completedTables === tables.length) {
          indexes.forEach((indexSql) => {
            db.run(indexSql, (err) => {
              if (err) {
                console.error('Error creating index:', err);
              } else {
                completedIndexes++;
              }
              if (completedIndexes === indexes.length) {
                db.close((err) => {
                  if (err) {
                    console.error('Error closing database:', err);
                    reject(err);
                  } else {
                    console.log('Database initialized successfully');
                    resolve();
                  }
                });
              }
            });
          });
        }
      });
    });
  });
}

module.exports = { initializeDatabase };
