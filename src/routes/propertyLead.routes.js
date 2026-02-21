const express = require('express');
const router = express.Router();
const PropertyLeadController = require('../controllers/PropertyLead.controller');
const { authenticate } = require('../middlewares/auth.middleware');

// All routes require authentication
router.use(authenticate);

// Resident routes
router.post('/', PropertyLeadController.create);
router.get('/', PropertyLeadController.list);
router.get('/:id', PropertyLeadController.get);
router.put('/:id', PropertyLeadController.update);
router.delete('/:id', PropertyLeadController.remove);

// Media deletion
router.delete('/:leadId/media/:mediaId', PropertyLeadController.deleteMedia);

// Admin / Super-Admin routes
router.patch('/:id/status', PropertyLeadController.updateStatus);
router.patch('/:id/assign', PropertyLeadController.assign);

module.exports = router;
