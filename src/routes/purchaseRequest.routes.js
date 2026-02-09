const express = require('express');
const PurchaseRequestController = require('../controllers/PurchaseRequest.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/', authenticate, PurchaseRequestController.list);
router.post('/', authenticate, PurchaseRequestController.create);
router.get('/stats', authenticate, PurchaseRequestController.getStats);
router.patch('/:id/status', authenticate, authorize(['ADMIN', 'SUPER_ADMIN', 'COMMUNITY_MANAGER', 'ACCOUNTANT']), PurchaseRequestController.updateStatus);

module.exports = router;
