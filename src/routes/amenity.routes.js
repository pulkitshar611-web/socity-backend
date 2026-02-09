const express = require('express');
const router = express.Router();
const AmenityController = require('../controllers/Amenity.controller');
const AmenityBookingController = require('../controllers/AmenityBooking.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

router.use(authenticate);

// Amenities
router.get('/', AmenityController.list);
router.post('/', authorize(['ADMIN', 'SUPER_ADMIN']), AmenityController.create);
router.patch('/:id', authorize(['ADMIN', 'SUPER_ADMIN']), AmenityController.update);
router.delete('/:id', authorize(['ADMIN', 'SUPER_ADMIN']), AmenityController.delete);

// Bookings
router.get('/bookings/all', AmenityBookingController.list);
router.post('/bookings', AmenityBookingController.create);
router.patch('/bookings/:id', authorize(['ADMIN', 'SUPER_ADMIN']), AmenityBookingController.update);

module.exports = router;

