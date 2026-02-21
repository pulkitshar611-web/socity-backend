const express = require('express');
const router = express.Router();
const SocietyReceiptController = require('../controllers/SocietyReceipt.controller');
const WalletController = require('../controllers/Wallet.controller');
const { authenticate } = require('../middlewares/auth.middleware');

// Receipt Routes
router.get('/receipts', authenticate, SocietyReceiptController.list);
router.get('/receipts/:id', authenticate, SocietyReceiptController.getById);
router.get('/receipts/:id/pdf', authenticate, SocietyReceiptController.generatePDF);
router.post('/receipts', authenticate, SocietyReceiptController.create);

// Wallet Routes
router.get('/wallet/:unitId/balance', authenticate, WalletController.getBalance);
router.get('/wallet/:unitId/transactions', authenticate, WalletController.listTransactions);
router.post('/wallet/advance', authenticate, WalletController.addAdvance);
router.post('/wallet/security-deposit', authenticate, WalletController.addSecurityDeposit);

module.exports = router;
