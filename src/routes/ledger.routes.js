const express = require('express');
const LedgerController = require('../controllers/Ledger.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/stats', authenticate, authorize(['ADMIN', 'ACCOUNTANT']), LedgerController.getStats);
router.post('/accounts', authenticate, authorize(['ADMIN']), LedgerController.createAccount);

module.exports = router;
