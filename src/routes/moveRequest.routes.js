const express = require('express');
const router = express.Router();
const MoveRequestController = require('../controllers/MoveRequest.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

// All routes require authentication
router.use(authenticate);

// List all move requests
router.get('/', authorize(['ADMIN', 'SUPER_ADMIN']), MoveRequestController.list);

// Create new move request
router.post('/', authorize(['ADMIN', 'SUPER_ADMIN', 'RESIDENT']), MoveRequestController.create);

// Update move request
router.patch('/:id', authorize(['ADMIN', 'SUPER_ADMIN']), MoveRequestController.update);

// Update status
router.patch('/:id/status', authorize(['ADMIN', 'SUPER_ADMIN']), MoveRequestController.updateStatus);

// Delete move request
router.delete('/:id', authorize(['ADMIN', 'SUPER_ADMIN']), MoveRequestController.delete);

module.exports = router;
