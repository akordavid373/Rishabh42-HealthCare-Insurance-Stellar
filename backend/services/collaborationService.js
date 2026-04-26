const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../database/healthcare.db');

class CollaborationService {
  getDatabase() {
    return new sqlite3.Database(DB_PATH);
  }

  // ── Workspaces ───────────────────────────────────────────────────────────────

  async createWorkspace(data) {
    const db = this.getDatabase();
    const workspaceId = uuidv4();
    try {
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO collab_workspaces (workspace_id, name, description, owner_id, resource_type, resource_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [workspaceId, data.name, data.description || null, data.owner_id,
           data.resource_type || 'general', data.resource_id || null],
          (err) => { if (err) reject(err); else resolve(); }
        );
      });
      // Add owner as member
      await this.addMember(workspaceId, data.owner_id, 'owner');
      return { workspace_id: workspaceId, ...data };
    } finally { db.close(); }
  }

  async addMember(workspaceId, userId, role = 'editor') {
    const db = this.getDatabase();
    try {
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT OR REPLACE INTO collab_members (workspace_id, user_id, role, joined_at)
           VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
          [workspaceId, userId, role],
          (err) => { if (err) reject(err); else resolve(); }
        );
      });
      return { workspace_id: workspaceId, user_id: userId, role };
    } finally { db.close(); }
  }

  async getWorkspace(workspaceId) {
    const db = this.getDatabase();
    try {
      const workspace = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM collab_workspaces WHERE workspace_id = ?', [workspaceId],
          (err, row) => { if (err) reject(err); else resolve(row); });
      });
      if (!workspace) throw new Error('Workspace not found');

      const members = await new Promise((resolve, reject) => {
        db.all(
          `SELECT cm.user_id, cm.role, u.first_name, u.last_name
           FROM collab_members cm JOIN users u ON cm.user_id = u.id
           WHERE cm.workspace_id = ?`,
          [workspaceId], (err, rows) => { if (err) reject(err); else resolve(rows); }
        );
      });

      return { ...workspace, members };
    } finally { db.close(); }
  }

  // ── Documents / Shared Editing ───────────────────────────────────────────────

  async createDocument(workspaceId, data) {
    const db = this.getDatabase();
    const docId = uuidv4();
    try {
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO collab_documents (doc_id, workspace_id, title, content, version, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [docId, workspaceId, data.title, data.content || '', data.created_by],
          (err) => { if (err) reject(err); else resolve(); }
        );
      });
      return { doc_id: docId, workspace_id: workspaceId, version: 1, ...data };
    } finally { db.close(); }
  }

  async applyEdit(docId, userId, patch) {
    const db = this.getDatabase();
    const editId = uuidv4();
    try {
      const doc = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM collab_documents WHERE doc_id = ?', [docId],
          (err, row) => { if (err) reject(err); else resolve(row); });
      });
      if (!doc) throw new Error('Document not found');

      // Conflict resolution: last-write-wins with version check
      if (patch.base_version && patch.base_version < doc.version) {
        return { conflict: true, current_version: doc.version, doc_id: docId };
      }

      const newContent = patch.full_content !== undefined ? patch.full_content : doc.content;
      const newVersion = doc.version + 1;

      await new Promise((resolve, reject) => {
        db.run(
          `UPDATE collab_documents SET content = ?, version = ?, updated_at = CURRENT_TIMESTAMP WHERE doc_id = ?`,
          [newContent, newVersion, docId],
          (err) => { if (err) reject(err); else resolve(); }
        );
      });

      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO collab_edit_history (edit_id, doc_id, user_id, patch, version, applied_at)
           VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [editId, docId, userId, JSON.stringify(patch), newVersion],
          (err) => { if (err) reject(err); else resolve(); }
        );
      });

      return { edit_id: editId, doc_id: docId, version: newVersion, conflict: false };
    } finally { db.close(); }
  }

  async getDocument(docId) {
    const db = this.getDatabase();
    try {
      return await new Promise((resolve, reject) => {
        db.get('SELECT * FROM collab_documents WHERE doc_id = ?', [docId],
          (err, row) => { if (err) reject(err); else resolve(row); });
      });
    } finally { db.close(); }
  }

  // ── Discussions ──────────────────────────────────────────────────────────────

  async postMessage(workspaceId, userId, message, parentId = null) {
    const db = this.getDatabase();
    const messageId = uuidv4();
    try {
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO collab_messages (message_id, workspace_id, user_id, message, parent_id, created_at)
           VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [messageId, workspaceId, userId, message, parentId],
          (err) => { if (err) reject(err); else resolve(); }
        );
      });
      return { message_id: messageId, workspace_id: workspaceId, user_id: userId, message, parent_id: parentId };
    } finally { db.close(); }
  }

  async getMessages(workspaceId, limit = 50, offset = 0) {
    const db = this.getDatabase();
    try {
      return await new Promise((resolve, reject) => {
        db.all(
          `SELECT cm.*, u.first_name, u.last_name FROM collab_messages cm
           JOIN users u ON cm.user_id = u.id
           WHERE cm.workspace_id = ? ORDER BY cm.created_at DESC LIMIT ? OFFSET ?`,
          [workspaceId, parseInt(limit), parseInt(offset)],
          (err, rows) => { if (err) reject(err); else resolve(rows); }
        );
      });
    } finally { db.close(); }
  }

  // ── Presence ─────────────────────────────────────────────────────────────────

  async updatePresence(workspaceId, userId, status, io = null) {
    const db = this.getDatabase();
    try {
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT OR REPLACE INTO collab_presence (workspace_id, user_id, status, last_seen)
           VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
          [workspaceId, userId, status],
          (err) => { if (err) reject(err); else resolve(); }
        );
      });
      if (io) io.to(`workspace-${workspaceId}`).emit('presence-update', { user_id: userId, status });
      return { workspace_id: workspaceId, user_id: userId, status };
    } finally { db.close(); }
  }

  async getPresence(workspaceId) {
    const db = this.getDatabase();
    try {
      return await new Promise((resolve, reject) => {
        db.all(
          `SELECT cp.user_id, cp.status, cp.last_seen, u.first_name, u.last_name
           FROM collab_presence cp JOIN users u ON cp.user_id = u.id
           WHERE cp.workspace_id = ? AND cp.last_seen >= datetime('now', '-5 minutes')`,
          [workspaceId], (err, rows) => { if (err) reject(err); else resolve(rows); }
        );
      });
    } finally { db.close(); }
  }
}

module.exports = new CollaborationService();
