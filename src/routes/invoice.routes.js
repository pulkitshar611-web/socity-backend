const express = require('express');
const router = express.Router();
const InvoiceController = require('../controllers/Invoice.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

router.get('/', authenticate, authorize(['ADMIN', 'ACCOUNTANT']), InvoiceController.list);
router.get('/stats', authenticate, authorize(['ADMIN', 'ACCOUNTANT']), InvoiceController.getStats);
router.get('/defaulters', authenticate, authorize(['ADMIN', 'ACCOUNTANT']), InvoiceController.listDefaulters);
router.get('/defaulters/stats', authenticate, authorize(['ADMIN', 'ACCOUNTANT']), InvoiceController.getDefaulterStats);
router.post('/', authenticate, authorize(['ADMIN']), InvoiceController.create);
router.post('/generate', authenticate, authorize(['ADMIN']), InvoiceController.generateBills);
router.patch('/:invoiceNo/pay', authenticate, authorize(['ADMIN', 'ACCOUNTANT']), InvoiceController.markAsPaid);

module.exports = router;
