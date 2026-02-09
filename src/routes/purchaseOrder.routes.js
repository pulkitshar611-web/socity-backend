const express = require('express');
const PurchaseOrderController = require('../controllers/PurchaseOrder.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/', authenticate, PurchaseOrderController.list);
router.post('/', authenticate, PurchaseOrderController.create);
router.get('/stats', authenticate, PurchaseOrderController.getStats);
router.patch('/:id/status', authenticate, PurchaseOrderController.updateStatus);

module.exports = router;
