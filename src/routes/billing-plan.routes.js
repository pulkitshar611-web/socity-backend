const express = require('express');
const router = express.Router();
const BillingPlanController = require('../controllers/BillingPlan.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware.js');

router.get('/', authenticate, BillingPlanController.listPlans);
router.post('/', authenticate, authorize(['SUPER_ADMIN']), BillingPlanController.createPlan);
router.put('/:id', authenticate, authorize(['SUPER_ADMIN']), BillingPlanController.updatePlan);
router.delete('/:id', authenticate, authorize(['SUPER_ADMIN']), BillingPlanController.deletePlan);

module.exports = router;
