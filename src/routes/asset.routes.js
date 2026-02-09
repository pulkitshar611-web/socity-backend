const express = require('express');
const router = express.Router();
const AssetController = require('../controllers/Asset.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

router.use(authenticate);

// List all assets
router.get('/', AssetController.getAll);

// Get asset statistics
router.get('/stats', AssetController.getStats);

// Get single asset
router.get('/:id', AssetController.getById);

// Create asset (Admin only)
router.post('/', authorize(['ADMIN', 'SUPER_ADMIN']), AssetController.create);

// Update asset
router.patch('/:id', authorize(['ADMIN', 'SUPER_ADMIN']), AssetController.update);

// Delete asset
router.delete('/:id', authorize(['ADMIN', 'SUPER_ADMIN']), AssetController.remove);

module.exports = router;
