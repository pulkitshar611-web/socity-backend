const express = require('express');
const router = express.Router();
const BillingConfigController = require('../controllers/BillingConfig.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

// All billing config routes require ADMIN or SUPER_ADMIN role
router.use(authenticate);
router.use(authorize(['ADMIN', 'SUPER_ADMIN']));

// Global Config
router.get('/config', BillingConfigController.getBillingConfig);

// Maintenance Rules
router.get('/maintenance', BillingConfigController.getMaintenanceRules);
router.post('/maintenance/:id', BillingConfigController.updateMaintenanceRule);
router.delete('/maintenance/:id', BillingConfigController.deleteMaintenanceRule);

// Charge Master
router.get('/charges', BillingConfigController.getChargeMaster);
router.post('/charges', BillingConfigController.createCharge);
router.put('/charges/:id', BillingConfigController.updateCharge);
router.delete('/charges/:id', BillingConfigController.deleteCharge);

// Late Fee Config
router.get('/late-fee', BillingConfigController.getLateFeeConfig);
router.post('/late-fee', BillingConfigController.updateLateFeeConfig);

module.exports = router;
