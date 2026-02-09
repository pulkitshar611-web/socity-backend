const express = require('express');
const ReceiptController = require('../controllers/Receipt.controller');
const { authenticate } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/', authenticate, ReceiptController.list);
router.post('/', authenticate, ReceiptController.create);
router.get('/stats', authenticate, ReceiptController.getStats);
router.patch('/:id/qc', authenticate, ReceiptController.updateQC);

module.exports = router;
