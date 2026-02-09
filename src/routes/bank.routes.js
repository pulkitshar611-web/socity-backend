const express = require('express');
const router = express.Router();
const BankController = require('../controllers/Bank.controller');
const { authenticate } = require('../middlewares/auth.middleware');

router.use(authenticate);

router.get('/', BankController.list);
router.post('/', BankController.create);
router.get('/transactions', BankController.getTransactions);

module.exports = router;
