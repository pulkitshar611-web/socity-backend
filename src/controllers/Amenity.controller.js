const prisma = require('../lib/prisma');

class AmenityController {
  static async list(req, res) {
    try {
      const where = {};
      if (req.user.role !== 'SUPER_ADMIN') {
        where.societyId = req.user.societyId;
      }
      const amenities = await prisma.amenity.findMany({
        where,
        orderBy: { name: 'asc' }
      });
      res.json(amenities);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async create(req, res) {
    try {
      const {
        name,
        description,
        chargesPerHour,
        societyId,
        type,
        capacity,
        availableDays,
        timings,
        status
      } = req.body;

      const amenity = await prisma.amenity.create({
        data: {
          name,
          description,
          chargesPerHour: parseFloat(chargesPerHour || 0),
          societyId: parseInt(societyId || req.user.societyId),
          type: type || 'other',
          capacity: parseInt(capacity || 0),
          availableDays: availableDays || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
          timings: timings || { start: '09:00', end: '22:00' },
          status: status || 'available'
        }
      });
      res.status(201).json(amenity);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async update(req, res) {
    try {
      const { id } = req.params;
      const data = { ...req.body };

      if (data.chargesPerHour !== undefined) data.chargesPerHour = parseFloat(data.chargesPerHour);
      if (data.capacity !== undefined) data.capacity = parseInt(data.capacity);
      if (data.societyId !== undefined) data.societyId = parseInt(data.societyId);

      const amenity = await prisma.amenity.update({
        where: { id: parseInt(id) },
        data: data
      });
      res.json(amenity);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async delete(req, res) {
    try {
      const { id } = req.params;
      await prisma.amenity.delete({ where: { id: parseInt(id) } });
      res.json({ message: 'Amenity deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = AmenityController;
