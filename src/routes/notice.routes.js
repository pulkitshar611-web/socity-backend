const express = require('express');
const router = express.Router();
const NoticeController = require('../controllers/Notice.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

router.use(authenticate);

// List all notices
router.get('/', NoticeController.list);

// Create notice (Admin only)
router.post('/', authorize(['ADMIN', 'SUPER_ADMIN']), NoticeController.create);

// Update notice
router.patch('/:id', authorize(['ADMIN', 'SUPER_ADMIN']), NoticeController.update);

// Delete notice
router.delete('/:id', authorize(['ADMIN', 'SUPER_ADMIN']), NoticeController.delete);

module.exports = router;

