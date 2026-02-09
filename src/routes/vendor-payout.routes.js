const express = require('express');
const VendorPayoutController = require('../controllers/VendorPayout.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/', authenticate, authorize(['SUPER_ADMIN']), VendorPayoutController.listPayouts);
router.post('/', authenticate, authorize(['SUPER_ADMIN']), VendorPayoutController.createPayout);
router.get('/stats', authenticate, authorize(['SUPER_ADMIN']), VendorPayoutController.getPayoutStats);
router.put('/:id', authenticate, authorize(['SUPER_ADMIN']), VendorPayoutController.updateStatus);

module.exports = router;
