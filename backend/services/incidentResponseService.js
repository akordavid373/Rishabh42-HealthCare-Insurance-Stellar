const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../database/healthcare.db');

class IncidentResponseService {
  constructor() {
    this.db = null;
    this.activeIncidents = new Map();
    this.responsePlaybooks = new Map();
    this.escalationRules = new Map();
    this.notificationChannels = new Map();
    
    // Initialize response playbooks
    this.initializePlaybooks();
    
    // Initialize escalation rules
    this.initializeEscalationRules();
  }

  getDatabase() {
    if (!this.db) {
      this.db = new sqlite3.Database(DB_PATH);
    }
    return this.db;
  }

  // Initialize incident response tables
  async initializeTables() {
    const db = this.getDatabase();
    
    const tables = [
      `CREATE TABLE IF NOT EXISTS security_incidents (
        id TEXT PRIMARY KEY,
        incident_type TEXT NOT NULL,
        severity TEXT NOT NULL,
        status TEXT DEFAULT 'open',
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        affected_assets TEXT NOT NULL,
        indicators TEXT NOT NULL,
        source_system TEXT NOT NULL,
        detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        assigned_to INTEGER,
        assigned_at DATETIME,
        resolved_at DATETIME,
        resolution_notes TEXT,
        containment_actions TEXT,
        eradication_actions TEXT,
        recovery_actions TEXT,
        lessons_learned TEXT,
        cost_impact REAL DEFAULT 0,
        data_breach BOOLEAN DEFAULT FALSE,
        compliance_impact TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (assigned_to) REFERENCES users (id)
      )`,
      
      `CREATE TABLE IF NOT EXISTS incident_timeline (
        id TEXT PRIMARY KEY,
        incident_id TEXT NOT NULL,
        action_type TEXT NOT NULL,
        action_description TEXT NOT NULL,
        performed_by INTEGER,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        evidence TEXT,
        status TEXT DEFAULT 'completed',
        FOREIGN KEY (incident_id) REFERENCES security_incidents (id),
        FOREIGN KEY (performed_by) REFERENCES users (id)
      )`,
      
      `CREATE TABLE IF NOT EXISTS incident_notifications (
        id TEXT PRIMARY KEY,
        incident_id TEXT NOT NULL,
        notification_type TEXT NOT NULL,
        recipient TEXT NOT NULL,
        channel TEXT NOT NULL,
        message TEXT NOT NULL,
        sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'sent',
        FOREIGN KEY (incident_id) REFERENCES security_incidents (id)
      )`,
      
      `CREATE TABLE IF NOT EXISTS response_playbooks (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        incident_type TEXT NOT NULL,
        severity_range TEXT NOT NULL,
        steps TEXT NOT NULL,
        escalation_rules TEXT NOT NULL,
        notification_rules TEXT NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      
      `CREATE TABLE IF NOT EXISTS incident_metrics (
        id TEXT PRIMARY KEY,
        incident_id TEXT NOT NULL,
        metric_name TEXT NOT NULL,
        metric_value REAL NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (incident_id) REFERENCES security_incidents (id)
      )`
    ];

    for (const table of tables) {
      await new Promise((resolve, reject) => {
        db.run(table, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  }

  // Initialize response playbooks
  initializePlaybooks() {
    // Data breach playbook
    this.responsePlaybooks.set('data_breach', {
      name: 'Data Breach Response',
      incidentType: 'data_breach',
      severityRange: ['high', 'critical'],
      steps: [
        {
          step: 1,
          action: 'immediate_containment',
          description: 'Isolate affected systems and prevent further data exfiltration',
          timeframe: '15 minutes',
          responsible: 'security_team'
        },
        {
          step: 2,
          action: 'assess_impact',
          description: 'Determine scope of data breach and affected records',
          timeframe: '1 hour',
          responsible: 'incident_commander'
        },
        {
          step: 3,
          action: 'notify_stakeholders',
          description: 'Notify legal, compliance, and management teams',
          timeframe: '30 minutes',
          responsible: 'incident_commander'
        },
        {
          step: 4,
          action: 'document_evidence',
          description: 'Preserve all relevant evidence and logs',
          timeframe: '2 hours',
          responsible: 'forensic_team'
        },
        {
          step: 5,
          action: 'regulatory_notification',
          description: 'Prepare regulatory notifications if required',
          timeframe: '72 hours',
          responsible: 'compliance_team'
        }
      ],
      escalationRules: [
        { condition: 'patient_data_involved', escalate_to: 'c_level', timeframe: '30 minutes' },
        { condition: 'more_than_1000_records', escalate_to: 'executive_team', timeframe: '1 hour' }
      ],
      notificationRules: [
        { event: 'incident_created', channels: ['email', 'sms'], recipients: ['security_team', 'incident_commander'] },
        { event: 'containment_completed', channels: ['email'], recipients: ['management'] }
      ]
    });

    // Ransomware playbook
    this.responsePlaybooks.set('ransomware', {
      name: 'Ransomware Response',
      incidentType: 'ransomware',
      severityRange: ['critical'],
      steps: [
        {
          step: 1,
          action: 'isolate_systems',
          description: 'Immediately isolate affected systems from network',
          timeframe: '5 minutes',
          responsible: 'security_team'
        },
        {
          step: 2,
          action: 'disable_accounts',
          description: 'Disable potentially compromised user accounts',
          timeframe: '10 minutes',
          responsible: 'security_team'
        },
        {
          step: 3,
          action: 'assess_backup',
          description: 'Check availability and integrity of backups',
          timeframe: '30 minutes',
          responsible: 'backup_team'
        },
        {
          step: 4,
          action: 'engage_experts',
          description: 'Engage external ransomware response experts',
          timeframe: '1 hour',
          responsible: 'incident_commander'
        },
        {
          step: 5,
          action: 'decision_making',
          description: 'Evaluate payment vs recovery options',
          timeframe: '4 hours',
          responsible: 'executive_team'
        }
      ],
      escalationRules: [
        { condition: 'critical_systems_affected', escalate_to: 'c_level', timeframe: '15 minutes' },
        { condition: 'backup_unavailable', escalate_to: 'c_level', timeframe: '30 minutes' }
      ],
      notificationRules: [
        { event: 'incident_created', channels: ['email', 'sms', 'phone'], recipients: ['security_team', 'incident_commander', 'c_level'] },
        { event: 'systems_isolated', channels: ['email'], recipients: ['all_staff'] }
      ]
    });

    // Unauthorized access playbook
    this.responsePlaybooks.set('unauthorized_access', {
      name: 'Unauthorized Access Response',
      incidentType: 'unauthorized_access',
      severityRange: ['medium', 'high', 'critical'],
      steps: [
        {
          step: 1,
          action: 'identify_scope',
          description: 'Determine extent of unauthorized access',
          timeframe: '30 minutes',
          responsible: 'security_team'
        },
        {
          step: 2,
          action: 'revoke_access',
          description: 'Revoke all unauthorized access credentials',
          timeframe: '15 minutes',
          responsible: 'security_team'
        },
        {
          step: 3,
          action: 'investigate_source',
          description: 'Investigate source and method of unauthorized access',
          timeframe: '2 hours',
          responsible: 'forensic_team'
        },
        {
          step: 4,
          action: 'patch_vulnerabilities',
          description: 'Patch any vulnerabilities that were exploited',
          timeframe: '4 hours',
          responsible: 'security_team'
        },
        {
          step: 5,
          action: 'monitor_activity',
          description: 'Enhanced monitoring for related suspicious activity',
          timeframe: '7 days',
          responsible: 'security_team'
        }
      ],
      escalationRules: [
        { condition: 'admin_access_compromised', escalate_to: 'c_level', timeframe: '30 minutes' },
        { condition: 'patient_data_accessed', escalate_to: 'compliance_team', timeframe: '1 hour' }
      ],
      notificationRules: [
        { event: 'incident_created', channels: ['email'], recipients: ['security_team', 'incident_commander'] },
        { event: 'access_revoked', channels: ['email'], recipients: ['affected_users'] }
      ]
    });
  }

  // Initialize escalation rules
  initializeEscalationRules() {
    this.escalationRules.set('severity_based', {
      critical: {
        escalation_time: 15, // minutes
        escalate_to: ['c_level', 'incident_commander'],
        auto_escalate: true
      },
      high: {
        escalation_time: 30, // minutes
        escalate_to: ['incident_commander', 'security_lead'],
        auto_escalate: true
      },
      medium: {
        escalation_time: 60, // minutes
        escalate_to: ['security_lead'],
        auto_escalate: false
      },
      low: {
        escalation_time: 240, // minutes
        escalate_to: ['security_team'],
        auto_escalate: false
      }
    });

    this.escalationRules.set('time_based', {
      unresolved_after_1h: {
        condition: 'status_open_and_age_gt_1h',
        escalate_to: ['security_lead'],
        severity_boost: 1
      },
      unresolved_after_4h: {
        condition: 'status_open_and_age_gt_4h',
        escalate_to: ['incident_commander'],
        severity_boost: 2
      },
      unresolved_after_24h: {
        condition: 'status_open_and_age_gt_24h',
        escalate_to: ['c_level'],
        severity_boost: 3
      }
    });
  }

  // Create new security incident
  async createIncident(incidentData, detectedBy = null) {
    const db = this.getDatabase();
    
    try {
      const incidentId = uuidv4();
      
      const incident = {
        id: incidentId,
        incident_type: incidentData.incidentType,
        severity: incidentData.severity,
        title: incidentData.title,
        description: incidentData.description,
        affected_assets: JSON.stringify(incidentData.affectedAssets || []),
        indicators: JSON.stringify(incidentData.indicators || []),
        source_system: incidentData.sourceSystem || 'manual',
        detected_at: new Date().toISOString(),
        data_breach: incidentData.dataBreach || false,
        compliance_impact: incidentData.complianceImpact || null
      };

      await new Promise((resolve, reject) => {
        const query = `
          INSERT INTO security_incidents (
            id, incident_type, severity, title, description, affected_assets,
            indicators, source_system, detected_at, data_breach, compliance_impact
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        db.run(query, [
          incident.id,
          incident.incident_type,
          incident.severity,
          incident.title,
          incident.description,
          incident.affected_assets,
          incident.indicators,
          incident.source_system,
          incident.detected_at,
          incident.data_breach,
          incident.compliance_impact
        ], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Add to active incidents
      this.activeIncidents.set(incidentId, {
        ...incident,
        status: 'open',
        created_at: new Date().toISOString()
      });

      // Start automated response if playbook exists
      await this.executePlaybook(incidentId, incident.incident_type, incident.severity);

      // Send initial notifications
      await this.sendNotifications(incidentId, 'incident_created', incident);

      return incidentId;
    } catch (error) {
      console.error('Error creating incident:', error);
      throw error;
    }
  }

  // Execute response playbook
  async executePlaybook(incidentId, incidentType, severity) {
    const playbook = this.responsePlaybooks.get(incidentType);
    
    if (!playbook) {
      console.log(`No playbook found for incident type: ${incidentType}`);
      return;
    }

    if (!playbook.severityRange.includes(severity)) {
      console.log(`Severity ${severity} not covered by playbook for ${incidentType}`);
      return;
    }

    console.log(`Executing playbook: ${playbook.name} for incident ${incidentId}`);

    // Execute playbook steps
    for (const step of playbook.steps) {
      try {
        await this.executePlaybookStep(incidentId, step);
      } catch (error) {
        console.error(`Error executing playbook step ${step.step}:`, error);
      }
    }

    // Set up escalation rules
    this.setupEscalation(incidentId, playbook.escalationRules);
  }

  // Execute individual playbook step
  async executePlaybookStep(incidentId, step) {
    const stepId = uuidv4();
    
    // Record step in timeline
    await this.addTimelineEntry(incidentId, {
      action_type: step.action,
      action_description: step.description,
      status: 'in_progress',
      timeframe: step.timeframe,
      responsible: step.responsible
    });

    // Execute automated actions based on step type
    switch (step.action) {
      case 'immediate_containment':
        await this.executeImmediateContainment(incidentId);
        break;
      case 'isolate_systems':
        await this.executeSystemIsolation(incidentId);
        break;
      case 'disable_accounts':
        await this.executeAccountDisabling(incidentId);
        break;
      case 'revoke_access':
        await this.executeAccessRevocation(incidentId);
        break;
      default:
        console.log(`Manual action required: ${step.action}`);
    }

    // Update timeline entry
    await this.updateTimelineEntry(stepId, 'completed');
  }

  // Execute immediate containment
  async executeImmediateContainment(incidentId) {
    const incident = this.activeIncidents.get(incidentId);
    const affectedAssets = JSON.parse(incident.affected_assets || '[]');
    
    console.log(`Executing immediate containment for incident ${incidentId}`);
    
    // In a real implementation, this would:
    // 1. Isolate affected systems from network
    // 2. Block suspicious IP addresses
    // 3. Disable compromised accounts
    // 4. Put systems into maintenance mode
    
    const containmentActions = [
      'isolated_affected_systems',
      'blocked_suspicious_ips',
      'disabled_compromised_accounts',
      'enabled_maintenance_mode'
    ];

    await this.updateIncident(incidentId, {
      containment_actions: JSON.stringify(containmentActions)
    });
  }

  // Execute system isolation
  async executeSystemIsolation(incidentId) {
    console.log(`Executing system isolation for incident ${incidentId}`);
    
    // In a real implementation, this would:
    // 1. Disconnect systems from network
    // 2. Stop critical services
    // 3. Enable network segmentation
    // 4. Activate disaster recovery procedures
    
    const isolationActions = [
      'network_isolation_completed',
      'services_stopped',
      'network_segmentation_activated'
    ];

    await this.updateIncident(incidentId, {
      containment_actions: JSON.stringify(isolationActions)
    });
  }

  // Execute account disabling
  async executeAccountDisabling(incidentId) {
    console.log(`Executing account disabling for incident ${incidentId}`);
    
    // In a real implementation, this would:
    // 1. Identify compromised accounts
    // 2. Disable user accounts
    // 3. Revoke active sessions
    // 4. Reset passwords
    
    const accountActions = [
      'compromised_accounts_disabled',
      'active_sessions_revoked',
      'passwords_reset'
    ];

    await this.updateIncident(incidentId, {
      containment_actions: JSON.stringify(accountActions)
    });
  }

  // Execute access revocation
  async executeAccessRevocation(incidentId) {
    console.log(`Executing access revocation for incident ${incidentId}`);
    
    // In a real implementation, this would:
    // 1. Revoke API keys
    // 2. Disable service accounts
    // 3. Revoke certificates
    // 4. Update firewall rules
    
    const accessActions = [
      'api_keys_revoked',
      'service_accounts_disabled',
      'certificates_revoked',
      'firewall_rules_updated'
    ];

    await this.updateIncident(incidentId, {
      eradication_actions: JSON.stringify(accessActions)
    });
  }

  // Set up escalation
  setupEscalation(incidentId, escalationRules) {
    escalationRules.forEach(rule => {
      const escalationTime = rule.timeframe * 60 * 1000; // Convert to milliseconds
      
      setTimeout(async () => {
        const incident = this.activeIncidents.get(incidentId);
        
        if (incident && incident.status === 'open') {
          await this.escalateIncident(incidentId, rule.escalate_to, rule.condition);
        }
      }, escalationTime);
    });
  }

  // Escalate incident
  async escalateIncident(incidentId, escalateTo, reason) {
    console.log(`Escalating incident ${incidentId} to ${escalateTo.join(', ')} - ${reason}`);
    
    // Add timeline entry
    await this.addTimelineEntry(incidentId, {
      action_type: 'escalation',
      action_description: `Incident escalated to ${escalateTo.join(', ')} - ${reason}`,
      status: 'completed'
    });

    // Send escalation notifications
    await this.sendNotifications(incidentId, 'incident_escalated', {
      escalateTo: escalateTo,
      reason: reason
    });

    // Update incident severity if needed
    const escalationRule = this.escalationRules.get('time_based')[reason];
    if (escalationRule && escalationRule.severity_boost) {
      await this.boostSeverity(incidentId, escalationRule.severity_boost);
    }
  }

  // Boost incident severity
  async boostSeverity(incidentId, boost) {
    const incident = this.activeIncidents.get(incidentId);
    const severityLevels = ['low', 'medium', 'high', 'critical'];
    const currentIndex = severityLevels.indexOf(incident.severity);
    const newIndex = Math.min(currentIndex + boost, severityLevels.length - 1);
    
    if (newIndex > currentIndex) {
      const newSeverity = severityLevels[newIndex];
      await this.updateIncident(incidentId, { severity: newSeverity });
      
      await this.addTimelineEntry(incidentId, {
        action_type: 'severity_boost',
        action_description: `Severity boosted from ${incident.severity} to ${newSeverity}`,
        status: 'completed'
      });
    }
  }

  // Add timeline entry
  async addTimelineEntry(incidentId, entryData) {
    const db = this.getDatabase();
    
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO incident_timeline (id, incident_id, action_type, action_description, status, evidence)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      
      db.run(query, [
        uuidv4(),
        incidentId,
        entryData.action_type,
        entryData.action_description,
        entryData.status || 'completed',
        JSON.stringify(entryData.evidence || {})
      ], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }

  // Update timeline entry
  async updateTimelineEntry(entryId, status) {
    const db = this.getDatabase();
    
    return new Promise((resolve, reject) => {
      const query = 'UPDATE incident_timeline SET status = ? WHERE id = ?';
      
      db.run(query, [status, entryId], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // Send notifications
  async sendNotifications(incidentId, eventType, data) {
    const incident = this.activeIncidents.get(incidentId);
    const playbook = this.responsePlaybooks.get(incident.incident_type);
    
    if (playbook) {
      const notificationRule = playbook.notificationRules.find(rule => rule.event === eventType);
      
      if (notificationRule) {
        for (const channel of notificationRule.channels) {
          for (const recipient of notificationRule.recipients) {
            await this.sendNotification(incidentId, {
              type: eventType,
              channel: channel,
              recipient: recipient,
              message: this.generateNotificationMessage(eventType, incident, data)
            });
          }
        }
      }
    }
  }

  // Generate notification message
  generateNotificationMessage(eventType, incident, data) {
    switch (eventType) {
      case 'incident_created':
        return `🚨 Security Incident Created: ${incident.title}\n\nType: ${incident.incident_type}\nSeverity: ${incident.severity}\nDescription: ${incident.description}\nDetected: ${incident.detected_at}`;
      
      case 'incident_escalated':
        return `📈 Incident Escalated: ${incident.title}\n\nEscalated to: ${data.escalateTo.join(', ')}\nReason: ${data.reason}\nIncident ID: ${incident.id}`;
      
      case 'containment_completed':
        return `✅ Containment Completed: ${incident.title}\n\nContainment actions have been successfully executed.\nIncident ID: ${incident.id}`;
      
      default:
        return `Security Incident Update: ${incident.title}\n\nEvent: ${eventType}\nIncident ID: ${incident.id}`;
    }
  }

  // Send notification
  async sendNotification(incidentId, notificationData) {
    const db = this.getDatabase();
    
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO incident_notifications (id, incident_id, notification_type, recipient, channel, message)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      
      db.run(query, [
        uuidv4(),
        incidentId,
        notificationData.type,
        notificationData.recipient,
        notificationData.channel,
        notificationData.message
      ], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }

  // Update incident
  async updateIncident(incidentId, updateData) {
    const db = this.getDatabase();
    
    // Update in memory
    const incident = this.activeIncidents.get(incidentId);
    if (incident) {
      Object.assign(incident, updateData);
      incident.updated_at = new Date().toISOString();
    }

    // Update in database
    const setClause = Object.keys(updateData).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updateData);
    values.push(incidentId);
    
    return new Promise((resolve, reject) => {
      const query = `UPDATE security_incidents SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
      
      db.run(query, values, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // Resolve incident
  async resolveIncident(incidentId, resolutionData, resolvedBy) {
    const updateData = {
      status: 'resolved',
      resolved_at: new Date().toISOString(),
      assigned_to: resolvedBy,
      resolution_notes: resolutionData.notes,
      lessons_learned: resolutionData.lessonsLearned,
      recovery_actions: JSON.stringify(resolutionData.recoveryActions || []),
      cost_impact: resolutionData.costImpact || 0
    };

    await this.updateIncident(incidentId, updateData);
    
    // Add timeline entry
    await this.addTimelineEntry(incidentId, {
      action_type: 'incident_resolved',
      action_description: `Incident resolved by user ${resolvedBy}`,
      status: 'completed',
      evidence: resolutionData
    });

    // Remove from active incidents
    this.activeIncidents.delete(incidentId);

    // Send resolution notifications
    await this.sendNotifications(incidentId, 'incident_resolved', updateData);
  }

  // Get incident details
  async getIncident(incidentId) {
    const db = this.getDatabase();
    
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM security_incidents WHERE id = ?';
      
      db.get(query, [incidentId], (err, row) => {
        if (err) {
          reject(err);
        } else if (row) {
          const incident = {
            ...row,
            affected_assets: JSON.parse(row.affected_assets || '[]'),
            indicators: JSON.parse(row.indicators || '[]'),
            containment_actions: JSON.parse(row.containment_actions || '[]'),
            eradication_actions: JSON.parse(row.eradication_actions || '[]'),
            recovery_actions: JSON.parse(row.recovery_actions || '[]')
          };
          resolve(incident);
        } else {
          resolve(null);
        }
      });
    });
  }

  // Get incident timeline
  async getIncidentTimeline(incidentId) {
    const db = this.getDatabase();
    
    return new Promise((resolve, reject) => {
      const query = `
        SELECT * FROM incident_timeline 
        WHERE incident_id = ? 
        ORDER BY timestamp ASC
      `;
      
      db.all(query, [incidentId], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          const timeline = rows.map(row => ({
            ...row,
            evidence: JSON.parse(row.evidence || '{}')
          }));
          resolve(timeline);
        }
      });
    });
  }

  // Get active incidents
  async getActiveIncidents(status = 'open', limit = 50) {
    const db = this.getDatabase();
    
    return new Promise((resolve, reject) => {
      let query = 'SELECT * FROM security_incidents WHERE status = ?';
      const params = [status];
      
      query += ' ORDER BY detected_at DESC LIMIT ?';
      params.push(limit);
      
      db.all(query, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          const incidents = rows.map(row => ({
            ...row,
            affected_assets: JSON.parse(row.affected_assets || '[]'),
            indicators: JSON.parse(row.indicators || '[]')
          }));
          resolve(incidents);
        }
      });
    });
  }

  // Get incident statistics
  async getIncidentStats(period = 30) {
    const db = this.getDatabase();
    
    return new Promise((resolve, reject) => {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - period);
      
      const query = `
        SELECT 
          COUNT(*) as total_incidents,
          COUNT(CASE WHEN severity = 'critical' THEN 1 END) as critical_incidents,
          COUNT(CASE WHEN severity = 'high' THEN 1 END) as high_incidents,
          COUNT(CASE WHEN severity = 'medium' THEN 1 END) as medium_incidents,
          COUNT(CASE WHEN severity = 'low' THEN 1 END) as low_incidents,
          COUNT(CASE WHEN status = 'open' THEN 1 END) as open_incidents,
          COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved_incidents,
          AVG(CASE WHEN resolved_at IS NOT NULL THEN 
            (julianday(resolved_at) - julianday(detected_at)) * 24 
          END) as avg_resolution_hours,
          SUM(cost_impact) as total_cost_impact,
          COUNT(CASE WHEN data_breach = TRUE THEN 1 END) as data_breaches
        FROM security_incidents
        WHERE detected_at >= ?
      `;
      
      db.get(query, [cutoffDate.toISOString()], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  // Close database connection
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

module.exports = new IncidentResponseService();
