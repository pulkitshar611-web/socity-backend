const express = require('express');
const NotificationController = require('../controllers/Notification.controller');
const { authenticate } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/', authenticate, NotificationController.list);
router.patch('/read-all', authenticate, NotificationController.markAllRead);
router.patch('/:id/read', authenticate, NotificationController.markRead);

module.exports = router;
