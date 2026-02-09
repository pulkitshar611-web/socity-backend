const express = require('express');
const TransactionController = require('../controllers/Transaction.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/', authenticate, TransactionController.list);
router.post('/income', authenticate, authorize(['ADMIN', 'ACCOUNTANT']), TransactionController.recordIncome);
router.post('/expense', authenticate, authorize(['ADMIN']), TransactionController.recordExpense);
router.get('/stats', authenticate, authorize(['ADMIN']), TransactionController.getStats);
router.patch('/:id', authenticate, authorize(['ADMIN']), TransactionController.update);
router.delete('/:id', authenticate, authorize(['ADMIN']), TransactionController.delete);

module.exports = router;
