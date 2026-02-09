const express = require('express');
const router = express.Router();
const incidentController = require('../controllers/Incident.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

// All routes require authentication
router.use(authenticate);

// Get all incidents (with filters)
router.get('/', incidentController.getAll);

// Get statistics
router.get('/stats', incidentController.getStats);

// Create new incident
router.post('/', incidentController.create);

// Update status (Admin/Guard)
router.patch('/:id/status', authorize(['ADMIN', 'SUPER_ADMIN', 'GUARD']), incidentController.updateStatus);

module.exports = router;
