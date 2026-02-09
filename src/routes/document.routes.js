const express = require('express');
const router = express.Router();
const DocumentController = require('../controllers/Document.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

router.use(authenticate);

// List all documents
router.get('/', DocumentController.getAll);

// Get single document
router.get('/:id', DocumentController.getById);

// Create document (Admin only)
router.post('/', authorize(['ADMIN', 'SUPER_ADMIN']), DocumentController.create);

// Delete document
router.delete('/:id', authorize(['ADMIN', 'SUPER_ADMIN']), DocumentController.remove);

module.exports = router;
