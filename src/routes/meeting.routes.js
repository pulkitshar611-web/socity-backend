const express = require('express');
const router = express.Router();
const MeetingController = require('../controllers/Meeting.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

// All routes require authentication
router.use(authenticate);

// List all meetings
router.get('/', MeetingController.getAll);

// Get single meeting
router.get('/:id', MeetingController.getById);

// Create meeting (Admin only)
router.post('/', authorize(['ADMIN', 'SUPER_ADMIN']), MeetingController.create);

// Update meeting
router.patch('/:id', authorize(['ADMIN', 'SUPER_ADMIN']), MeetingController.update);

// Delete meeting
router.delete('/:id', authorize(['ADMIN', 'SUPER_ADMIN']), MeetingController.remove);

module.exports = router;
