const express = require('express');
const router = express.Router();
const VendorInvoiceController = require('../controllers/VendorInvoice.controller');
const { authenticate } = require('../middlewares/auth.middleware');

router.use(authenticate);

router.get('/', VendorInvoiceController.list);
router.post('/', VendorInvoiceController.create);
router.post('/:id/approve', VendorInvoiceController.approve);
router.post('/:id/pay', VendorInvoiceController.pay);

module.exports = router;
