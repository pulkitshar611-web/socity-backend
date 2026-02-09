const prisma = require('../lib/prisma');

class AmenityBookingController {
  static async list(req, res) {
    try {
      const where = {};
      if (req.user.role !== 'SUPER_ADMIN') {
        where.amenity = {
          societyId: req.user.societyId
        };
      }
      const bookings = await prisma.amenityBooking.findMany({
        where,
        include: { amenity: true, user: true },
        orderBy: { startTime: 'desc' }
      });
      res.json(bookings);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async create(req, res) {
    try {
      const { amenityId, date, startTime, endTime, status, amountPaid, purpose } = req.body;
      const booking = await prisma.amenityBooking.create({
        data: {
          amenityId: parseInt(amenityId),
          userId: req.user.id,
          date: new Date(date),
          startTime,
          endTime,
          purpose,
          status: status || 'PENDING',
          amountPaid: parseFloat(amountPaid || 0)
        }
      });
      res.status(201).json(booking);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async update(req, res) {
    try {
      const { id } = req.params;
      const { status, startTime, endTime, date } = req.body;
      const booking = await prisma.amenityBooking.update({
        where: { id: parseInt(id) },
        data: {
          status,
          date: date ? new Date(date) : undefined,
          startTime,
          endTime
        }
      });
      res.json(booking);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = AmenityBookingController;

