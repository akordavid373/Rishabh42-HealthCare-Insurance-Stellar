const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const notificationService = require('../services/advancedNotificationService');

const router = express.Router();
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
};

// Send a notification
router.post('/send',
  body('user_id').notEmpty(),
  body('title').isString().notEmpty(),
  body('message').isString().notEmpty(),
  body('channels').optional().isArray(),
  body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
  body('category').optional().isString(),
  validate,
  async (req, res, next) => {
    try {
      const result = await notificationService.send(req.body, req.io);
      res.status(201).json(result);
    } catch (err) { next(err); }
  }
);

// Broadcast to all users (or filtered by role)
router.post('/broadcast',
  body('title').isString().notEmpty(),
  body('message').isString().notEmpty(),
  body('channels').optional().isArray(),
  body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
  body('role_filter').optional().isIn(['patient', 'provider', 'admin']),
  validate,
  async (req, res, next) => {
    try {
      const result = await notificationService.broadcast(req.body, req.io);
      res.json(result);
    } catch (err) { next(err); }
  }
);

// Get notifications for a user
router.get('/user/:userId',
  param('userId').notEmpty(),
  query('limit').optional().isInt({ min: 1, max: 200 }),
  query('offset').optional().isInt({ min: 0 }),
  query('unread_only').optional().isBoolean(),
  validate,
  async (req, res, next) => {
    try {
      const notifications = await notificationService.getUserNotifications(req.params.userId, req.query);
      res.json(notifications);
    } catch (err) { next(err); }
  }
);

// Mark notification as read
router.patch('/:notificationId/read',
  param('notificationId').isUUID(),
  validate,
  async (req, res, next) => {
    try {
      const result = await notificationService.markRead(req.params.notificationId, req.user?.id);
      res.json(result);
    } catch (err) { next(err); }
  }
);

// Get/set user notification preferences
router.get('/preferences/:userId',
  param('userId').notEmpty(),
  validate,
  async (req, res, next) => {
    try {
      const prefs = await notificationService.getPreferences(req.params.userId);
      res.json(prefs);
    } catch (err) { next(err); }
  }
);

router.put('/preferences/:userId',
  param('userId').notEmpty(),
  body('preferences').isObject(),
  validate,
  async (req, res, next) => {
    try {
      const result = await notificationService.setPreferences(req.params.userId, req.body.preferences);
      res.json(result);
    } catch (err) { next(err); }
  }
);

// Delivery analytics
router.get('/analytics',
  async (req, res, next) => {
    try {
      const analytics = await notificationService.getAnalytics(req.query);
      res.json(analytics);
    } catch (err) { next(err); }
  }
);

module.exports = router;
