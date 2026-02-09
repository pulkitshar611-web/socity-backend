const express = require('express');
const router = express.Router();
const EventController = require('../controllers/Event.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

router.use(authenticate);

// List all events
router.get('/', EventController.getAll);

// Get single event
router.get('/:id', EventController.getById);

// Create event (Admin only)
router.post('/', authorize(['ADMIN', 'SUPER_ADMIN']), EventController.create);

// Update event
router.patch('/:id', authorize(['ADMIN', 'SUPER_ADMIN']), EventController.update);

// RSVP for event
router.post('/:id/rsvp', EventController.rsvp);

// Get attendees for an event
router.get('/:id/attendees', EventController.getAttendees);

// Delete event
router.delete('/:id', authorize(['ADMIN', 'SUPER_ADMIN']), EventController.remove);

module.exports = router;
