const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const collabService = require('../services/collaborationService');

const router = express.Router();
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
};

// Create workspace
router.post('/workspaces',
  body('name').isString().notEmpty(),
  body('owner_id').notEmpty(),
  body('resource_type').optional().isIn(['patient_record', 'claim', 'appointment', 'general']),
  body('resource_id').optional().isString(),
  validate,
  async (req, res, next) => {
    try {
      const workspace = await collabService.createWorkspace(req.body);
      req.io?.emit('workspace-created', { workspace_id: workspace.workspace_id });
      res.status(201).json(workspace);
    } catch (err) { next(err); }
  }
);

// Get workspace
router.get('/workspaces/:workspaceId',
  param('workspaceId').isUUID(),
  validate,
  async (req, res, next) => {
    try {
      const workspace = await collabService.getWorkspace(req.params.workspaceId);
      res.json(workspace);
    } catch (err) {
      if (err.message.includes('not found')) return res.status(404).json({ error: err.message });
      next(err);
    }
  }
);

// Add member to workspace
router.post('/workspaces/:workspaceId/members',
  param('workspaceId').isUUID(),
  body('user_id').notEmpty(),
  body('role').optional().isIn(['owner', 'editor', 'viewer']),
  validate,
  async (req, res, next) => {
    try {
      const result = await collabService.addMember(req.params.workspaceId, req.body.user_id, req.body.role);
      req.io?.to(`workspace-${req.params.workspaceId}`).emit('member-joined', result);
      res.status(201).json(result);
    } catch (err) { next(err); }
  }
);

// Create document in workspace
router.post('/workspaces/:workspaceId/documents',
  param('workspaceId').isUUID(),
  body('title').isString().notEmpty(),
  body('content').optional().isString(),
  body('created_by').notEmpty(),
  validate,
  async (req, res, next) => {
    try {
      const doc = await collabService.createDocument(req.params.workspaceId, req.body);
      req.io?.to(`workspace-${req.params.workspaceId}`).emit('document-created', { doc_id: doc.doc_id });
      res.status(201).json(doc);
    } catch (err) { next(err); }
  }
);

// Get document
router.get('/documents/:docId',
  param('docId').isUUID(),
  validate,
  async (req, res, next) => {
    try {
      const doc = await collabService.getDocument(req.params.docId);
      if (!doc) return res.status(404).json({ error: 'Document not found' });
      res.json(doc);
    } catch (err) { next(err); }
  }
);

// Apply edit to document (with conflict resolution)
router.patch('/documents/:docId',
  param('docId').isUUID(),
  body('patch').isObject(),
  body('user_id').notEmpty(),
  validate,
  async (req, res, next) => {
    try {
      const result = await collabService.applyEdit(req.params.docId, req.body.user_id, req.body.patch);
      if (!result.conflict) {
        req.io?.to(`doc-${req.params.docId}`).emit('document-updated', result);
      }
      res.json(result);
    } catch (err) {
      if (err.message.includes('not found')) return res.status(404).json({ error: err.message });
      next(err);
    }
  }
);

// Post message to workspace discussion
router.post('/workspaces/:workspaceId/messages',
  param('workspaceId').isUUID(),
  body('user_id').notEmpty(),
  body('message').isString().notEmpty().isLength({ max: 5000 }),
  body('parent_id').optional().isUUID(),
  validate,
  async (req, res, next) => {
    try {
      const msg = await collabService.postMessage(
        req.params.workspaceId, req.body.user_id, req.body.message, req.body.parent_id
      );
      req.io?.to(`workspace-${req.params.workspaceId}`).emit('new-message', msg);
      res.status(201).json(msg);
    } catch (err) { next(err); }
  }
);

// Get workspace messages
router.get('/workspaces/:workspaceId/messages',
  param('workspaceId').isUUID(),
  query('limit').optional().isInt({ min: 1, max: 200 }),
  query('offset').optional().isInt({ min: 0 }),
  validate,
  async (req, res, next) => {
    try {
      const messages = await collabService.getMessages(
        req.params.workspaceId, req.query.limit, req.query.offset
      );
      res.json(messages);
    } catch (err) { next(err); }
  }
);

// Update presence
router.post('/workspaces/:workspaceId/presence',
  param('workspaceId').isUUID(),
  body('user_id').notEmpty(),
  body('status').isIn(['online', 'away', 'offline']),
  validate,
  async (req, res, next) => {
    try {
      const result = await collabService.updatePresence(
        req.params.workspaceId, req.body.user_id, req.body.status, req.io
      );
      res.json(result);
    } catch (err) { next(err); }
  }
);

// Get active presence in workspace
router.get('/workspaces/:workspaceId/presence',
  param('workspaceId').isUUID(),
  validate,
  async (req, res, next) => {
    try {
      const presence = await collabService.getPresence(req.params.workspaceId);
      res.json(presence);
    } catch (err) { next(err); }
  }
);

module.exports = router;
