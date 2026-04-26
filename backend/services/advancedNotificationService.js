const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../database/healthcare.db');

const CHANNELS = ['in_app', 'email', 'sms', 'push', 'webhook'];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

class AdvancedNotificationService {
  getDatabase() {
    return new sqlite3.Database(DB_PATH);
  }

  // ── Send Notification ────────────────────────────────────────────────────────

  async send(data, io = null) {
    const db = this.getDatabase();
    const notificationId = uuidv4();
    try {
      const channels = data.channels || ['in_app'];
      const invalidChannels = channels.filter(c => !CHANNELS.includes(c));
      if (invalidChannels.length > 0) throw new Error(`Invalid channels: ${invalidChannels.join(', ')}`);
      if (!PRIORITIES.includes(data.priority || 'medium')) throw new Error('Invalid priority');

      const personalized = await this.personalizeContent(db, data);

      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO advanced_notifications
            (notification_id, user_id, title, message, channels, priority, category,
             metadata, status, scheduled_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, CURRENT_TIMESTAMP)`,
          [notificationId, data.user_id, personalized.title, personalized.message,
           JSON.stringify(channels), data.priority || 'medium',
           data.category || 'general', JSON.stringify(data.metadata || {}),
           data.scheduled_at || null],
          (err) => { if (err) reject(err); else resolve(); }
        );
      });

      const deliveryResults = await this.deliverToChannels(db, notificationId, data.user_id, personalized, channels, io);

      await new Promise((resolve, reject) => {
        db.run(`UPDATE advanced_notifications SET status = 'sent', sent_at = CURRENT_TIMESTAMP WHERE notification_id = ?`,
          [notificationId], (err) => { if (err) reject(err); else resolve(); });
      });

      return { notification_id: notificationId, delivery_results: deliveryResults };
    } finally { db.close(); }
  }

  async personalizeContent(db, data) {
    if (!data.user_id) return { title: data.title, message: data.message };
    const user = await new Promise((resolve) => {
      db.get('SELECT first_name, last_name FROM users WHERE id = ?', [data.user_id],
        (err, row) => resolve(row || {}));
    });
    return {
      title: data.title,
      message: data.message.replace('{{name}}', user.first_name || 'Patient')
    };
  }

  async deliverToChannels(db, notificationId, userId, content, channels, io) {
    const results = {};
    for (const channel of channels) {
      const deliveryId = uuidv4();
      let status = 'delivered';
      let error = null;

      try {
        switch (channel) {
          case 'in_app':
            if (io) io.to(`user-${userId}`).emit('notification', { notification_id: notificationId, ...content });
            break;
          case 'email':
            // In production: integrate with SendGrid/SES
            console.log(`[EMAIL] To user ${userId}: ${content.title}`);
            break;
          case 'sms':
            // In production: integrate with Twilio
            console.log(`[SMS] To user ${userId}: ${content.message}`);
            break;
          case 'push':
            // In production: integrate with FCM/APNs
            console.log(`[PUSH] To user ${userId}: ${content.title}`);
            break;
          case 'webhook':
            // In production: POST to user's registered webhook URL
            console.log(`[WEBHOOK] To user ${userId}: ${content.title}`);
            break;
        }
      } catch (err) {
        status = 'failed';
        error = err.message;
      }

      await new Promise((resolve) => {
        db.run(
          `INSERT INTO notification_deliveries (delivery_id, notification_id, channel, status, error, delivered_at)
           VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [deliveryId, notificationId, channel, status, error],
          () => resolve()
        );
      });

      results[channel] = { status, delivery_id: deliveryId };
    }
    return results;
  }

  // ── Bulk / Broadcast ─────────────────────────────────────────────────────────

  async broadcast(data, io = null) {
    const db = this.getDatabase();
    try {
      let query = 'SELECT id FROM users WHERE 1=1';
      const params = [];
      if (data.role_filter) { query += ' AND role = ?'; params.push(data.role_filter); }

      const users = await new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => { if (err) reject(err); else resolve(rows); });
      });

      const results = await Promise.all(
        users.map(u => this.send({ ...data, user_id: u.id }, io).catch(e => ({ error: e.message })))
      );

      return { broadcast: true, recipients: users.length, results_summary: { sent: results.filter(r => !r.error).length, failed: results.filter(r => r.error).length } };
    } finally { db.close(); }
  }

  // ── Preferences ──────────────────────────────────────────────────────────────

  async setPreferences(userId, preferences) {
    const db = this.getDatabase();
    try {
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO notification_preferences (user_id, preferences, updated_at)
           VALUES (?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(user_id) DO UPDATE SET preferences = excluded.preferences, updated_at = CURRENT_TIMESTAMP`,
          [userId, JSON.stringify(preferences)],
          (err) => { if (err) reject(err); else resolve(); }
        );
      });
      return { user_id: userId, preferences };
    } finally { db.close(); }
  }

  async getPreferences(userId) {
    const db = this.getDatabase();
    try {
      const row = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM notification_preferences WHERE user_id = ?', [userId],
          (err, row) => { if (err) reject(err); else resolve(row); });
      });
      return row ? { ...row, preferences: JSON.parse(row.preferences || '{}') } : { user_id: userId, preferences: {} };
    } finally { db.close(); }
  }

  // ── Analytics ────────────────────────────────────────────────────────────────

  async getAnalytics(filters = {}) {
    const db = this.getDatabase();
    try {
      const rows = await new Promise((resolve, reject) => {
        db.all(
          `SELECT channel, status, COUNT(*) as count
           FROM notification_deliveries nd
           JOIN advanced_notifications an ON nd.notification_id = an.notification_id
           WHERE an.created_at >= datetime('now', '-7 days')
           GROUP BY channel, status`,
          [], (err, rows) => { if (err) reject(err); else resolve(rows); }
        );
      });

      const summary = {};
      for (const row of rows) {
        if (!summary[row.channel]) summary[row.channel] = { delivered: 0, failed: 0 };
        summary[row.channel][row.status] = (summary[row.channel][row.status] || 0) + row.count;
      }

      return { period: '7d', channel_stats: summary };
    } finally { db.close(); }
  }

  async getUserNotifications(userId, options = {}) {
    const db = this.getDatabase();
    const { limit = 50, offset = 0, unread_only } = options;
    try {
      let query = `SELECT * FROM advanced_notifications WHERE user_id = ?`;
      const params = [userId];
      if (unread_only) { query += ' AND read_at IS NULL'; }
      query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(parseInt(limit), parseInt(offset));

      return await new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows.map(r => ({ ...r, channels: JSON.parse(r.channels || '[]'), metadata: JSON.parse(r.metadata || '{}') })));
        });
      });
    } finally { db.close(); }
  }

  async markRead(notificationId, userId) {
    const db = this.getDatabase();
    try {
      await new Promise((resolve, reject) => {
        db.run(`UPDATE advanced_notifications SET read_at = CURRENT_TIMESTAMP WHERE notification_id = ? AND user_id = ?`,
          [notificationId, userId], (err) => { if (err) reject(err); else resolve(); });
      });
      return { notification_id: notificationId, read: true };
    } finally { db.close(); }
  }
}

module.exports = new AdvancedNotificationService();
