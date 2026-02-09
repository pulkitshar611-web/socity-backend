const express = require('express');
const router = express.Router();
const FacilityRequestController = require('../controllers/FacilityRequest.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

router.use(authenticate);

router.get('/', FacilityRequestController.list);
router.get('/stats', FacilityRequestController.getStats);
router.post('/', FacilityRequestController.create);
router.patch('/:id/status', authorize(['ADMIN', 'SUPER_ADMIN']), FacilityRequestController.updateStatus);
router.post('/:id/vote', FacilityRequestController.vote);

module.exports = router;
