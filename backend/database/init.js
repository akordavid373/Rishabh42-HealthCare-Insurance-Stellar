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
        type TEXT CHECK (type IN ('appointment', 'claim', 'payment', 'system', 'medical_record')),
        priority TEXT CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
        read BOOLEAN DEFAULT FALSE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )`,

      `CREATE TABLE IF NOT EXISTS fraud_analysis (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        claim_id INTEGER NOT NULL,
        patient_id INTEGER NOT NULL,
        risk_score INTEGER NOT NULL DEFAULT 0,
        risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
        flags TEXT,
        analysis_details TEXT,
        pattern_data TEXT,
        anomaly_data TEXT,
        reviewed BOOLEAN DEFAULT FALSE,
        reviewed_by INTEGER,
        review_date DATETIME,
        review_notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (claim_id) REFERENCES insurance_claims (id),
        FOREIGN KEY (patient_id) REFERENCES patients (id),
        FOREIGN KEY (reviewed_by) REFERENCES users (id)
      )`,

      `CREATE TABLE IF NOT EXISTS claim_patterns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id INTEGER NOT NULL,
        claim_frequency_monthly REAL DEFAULT 0,
        average_claim_amount REAL DEFAULT 0,
        total_claimed_amount REAL DEFAULT 0,
        unique_providers_count INTEGER DEFAULT 0,
        claim_types_count INTEGER DEFAULT 0,
        pattern_risk_score INTEGER DEFAULT 0,
        last_analysis_date DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (patient_id) REFERENCES patients (id)
      )`,

      `CREATE TABLE IF NOT EXISTS fraud_thresholds (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        max_monthly_claims INTEGER DEFAULT 5,
        max_single_claim_amount DECIMAL(10,2) DEFAULT 10000.00,
        risk_score_threshold INTEGER DEFAULT 50,
        frequency_penalty INTEGER DEFAULT 10,
        amount_penalty INTEGER DEFAULT 20,
        pattern_penalty INTEGER DEFAULT 30,
        timing_penalty INTEGER DEFAULT 15,
        amount_anomaly_threshold REAL DEFAULT 2.0,
        timing_anomaly_hours INTEGER DEFAULT 24,
        provider_anomaly_threshold INTEGER DEFAULT 10,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS flagged_claims (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        claim_id INTEGER NOT NULL UNIQUE,
        fraud_analysis_id INTEGER NOT NULL,
        flag_reason TEXT NOT NULL,
        flag_severity TEXT CHECK (flag_severity IN ('low', 'medium', 'high', 'critical')),
        status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'under_review', 'resolved', 'false_positive')),
        assigned_reviewer INTEGER,
        review_date DATETIME,
        resolution_notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (claim_id) REFERENCES insurance_claims (id),
        FOREIGN KEY (fraud_analysis_id) REFERENCES fraud_analysis (id),
        FOREIGN KEY (assigned_reviewer) REFERENCES users (id)
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
      'CREATE INDEX IF NOT EXISTS idx_fraud_analysis_claim_id ON fraud_analysis(claim_id)',
      'CREATE INDEX IF NOT EXISTS idx_fraud_analysis_patient_id ON fraud_analysis(patient_id)',
      'CREATE INDEX IF NOT EXISTS idx_fraud_analysis_risk_level ON fraud_analysis(risk_level)',
      'CREATE INDEX IF NOT EXISTS idx_claim_patterns_patient_id ON claim_patterns(patient_id)',
      'CREATE INDEX IF NOT EXISTS idx_flagged_claims_claim_id ON flagged_claims(claim_id)',
      'CREATE INDEX IF NOT EXISTS idx_flagged_claims_status ON flagged_claims(status)',
      'CREATE INDEX IF NOT EXISTS idx_flagged_claims_severity ON flagged_claims(flag_severity)'
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
