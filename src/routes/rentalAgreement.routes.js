const express = require('express');
const router = express.Router();
const RentalAgreementController = require('../controllers/RentalAgreement.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

// All routes require authentication
router.use(authenticate);

// Resident routes
router.post('/', upload.array('documents'), RentalAgreementController.create);
router.get('/', RentalAgreementController.list);
router.get('/:id', RentalAgreementController.getDetail);
router.delete('/:id', RentalAgreementController.delete);

// Admin / Super-Admin routes
router.patch('/:id/status', RentalAgreementController.updateStatus);
router.patch('/:id/assign', RentalAgreementController.assign);

module.exports = router;
