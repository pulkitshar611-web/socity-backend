const express = require('express');
const VendorController = require('../controllers/Vendor.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/', authenticate, VendorController.listSocietalVendors);
router.post('/', authenticate, authorize(['ADMIN', 'SUPER_ADMIN']), VendorController.createVendor);

// Admin \u0026 Super Admin Actions
router.get('/stats', authenticate, authorize(['ADMIN', 'SUPER_ADMIN']), VendorController.getStats);
router.put('/:id', authenticate, authorize(['ADMIN', 'SUPER_ADMIN']), VendorController.updateVendor);
router.patch('/:id/status', authenticate, authorize(['ADMIN', 'SUPER_ADMIN']), VendorController.updateVendorStatus);
router.delete('/:id', authenticate, authorize(['ADMIN', 'SUPER_ADMIN']), VendorController.deleteVendor);
router.post('/:id/renew', authenticate, authorize(['ADMIN']), VendorController.renewContract);
router.post('/:id/rate', authenticate, authorize(['ADMIN']), VendorController.rateVendor);
router.get('/:id/payments', authenticate, authorize(['ADMIN']), VendorController.getPaymentHistory);

// Super Admin Only
router.get('/all', authenticate, authorize(['SUPER_ADMIN']), VendorController.listAllVendors);

module.exports = router;
