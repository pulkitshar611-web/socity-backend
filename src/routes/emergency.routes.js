const express = require('express');
const router = express.Router();
const EmergencyLogController = require('../controllers/EmergencyLog.controller');
const EmergencyBarcodeController = require('../controllers/EmergencyBarcode.controller');
const EmergencyAlertController = require('../controllers/EmergencyAlert.controller');
const EmergencyContactController = require('../controllers/EmergencyContact.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware.js');

router.get('/logs', authenticate, EmergencyLogController.listLogs);
router.get('/barcodes', authenticate, EmergencyBarcodeController.listBarcodes);
router.post('/barcodes', authenticate, EmergencyBarcodeController.createBarcode);
router.patch('/barcodes/:id/status', authenticate, EmergencyBarcodeController.updateBarcodeStatus);
router.post('/barcodes/:id/regenerate', authenticate, EmergencyBarcodeController.regenerateBarcode);
router.delete('/barcodes/:id', authenticate, EmergencyBarcodeController.deleteBarcode);

// Emergency Alerts
router.post('/alerts', authenticate, EmergencyAlertController.createAlert);
router.get('/alerts', authenticate, EmergencyAlertController.listAlerts);
router.get('/alerts/:id', authenticate, EmergencyAlertController.getAlertDetails);
router.patch('/alerts/:id/resolve', authenticate, authorize(['ADMIN']), EmergencyAlertController.resolveAlert);

// Emergency Contacts
router.get('/contacts', authenticate, EmergencyContactController.listContacts);
router.post('/contacts', authenticate, authorize(['ADMIN']), EmergencyContactController.addContact);
router.put('/contacts/:id', authenticate, authorize(['ADMIN']), EmergencyContactController.updateContact);
router.delete('/contacts/:id', authenticate, authorize(['ADMIN']), EmergencyContactController.deleteContact);

module.exports = router;
