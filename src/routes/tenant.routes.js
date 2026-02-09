const express = require('express');
const router = express.Router();
const TenantController = require('../controllers/Tenant.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

router.use(authenticate);
router.use(authorize(['ADMIN', 'SUPER_ADMIN']));

// List all tenants
router.get('/', TenantController.getAll);

// Get tenant stats
router.get('/stats', TenantController.getStats);

// Create tenant (assign to unit)
router.post('/', TenantController.create);

// Update tenant/lease
router.patch('/:id', TenantController.update);

// Remove tenant from unit
router.delete('/:id', TenantController.remove);

module.exports = router;
