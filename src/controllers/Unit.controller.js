const prisma = require('../lib/prisma');

class UnitController {
  static async list(req, res) {
    try {
      const where = {};
      if (req.user.role !== 'SUPER_ADMIN') {
        where.societyId = req.user.societyId;
      }
      const units = await prisma.unit.findMany({
        where,
        include: { owner: true, tenant: true },
        orderBy: [{ block: 'asc' }, { number: 'asc' }]
      });
      res.json(units);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getById(req, res) {
    try {
       const { id } = req.params;
       const unit = await prisma.unit.findUnique({
           where: { id: parseInt(id) },
           include: { owner: true, tenant: true, parkingSlots: true, visitors: true }
       });
       if (!unit) return res.status(404).json({ error: 'Unit not found' });
       if (req.user.role !== 'SUPER_ADMIN' && unit.societyId !== req.user.societyId) {
         return res.status(403).json({ error: 'Access denied: unit belongs to another society' });
       }
       res.json(unit);
    } catch (error) {
       res.status(500).json({ error: error.message });
    }
  }

  static async create(req, res) {
    try {
      const { block, number, floor, type, areaSqFt, societyId } = req.body;
      const finalSocietyId = parseInt(societyId || req.user.societyId);
      
      if (!finalSocietyId) {
        return res.status(400).json({ error: 'Society ID is required' });
      }

      // Check if unit already exists (same block + number in same society)
      const existing = await prisma.unit.findFirst({
        where: {
          block: String(block),
          number: String(number),
          societyId: finalSocietyId
        }
      });

      if (existing) {
        return res.status(400).json({ error: `Unit ${block}-${number} already exists in this society` });
      }

      const unit = await prisma.unit.create({
        data: {
          block: String(block),
          number: String(number),
          floor: floor ? parseInt(floor) : null,
          type: type || 'APARTMENT',
          areaSqFt: areaSqFt ? parseFloat(areaSqFt) : null,
          societyId: finalSocietyId
        }
      });
      res.status(201).json(unit);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async update(req, res) {
    try {
      const { id } = req.params;
      const existing = await prisma.unit.findUnique({ where: { id: parseInt(id) } });
      if (!existing) return res.status(404).json({ error: 'Unit not found' });
      if (req.user.role !== 'SUPER_ADMIN' && existing.societyId !== req.user.societyId) {
        return res.status(403).json({ error: 'Access denied: unit belongs to another society' });
      }
      const unit = await prisma.unit.update({
        where: { id: parseInt(id) },
        data: req.body
      });
      res.json(unit);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async delete(req, res) {
    try {
      const { id } = req.params;
      const existing = await prisma.unit.findUnique({ where: { id: parseInt(id) } });
      if (!existing) return res.status(404).json({ error: 'Unit not found' });
      if (req.user.role !== 'SUPER_ADMIN' && existing.societyId !== req.user.societyId) {
        return res.status(403).json({ error: 'Access denied: unit belongs to another society' });
      }
      await prisma.unit.delete({ where: { id: parseInt(id) } });
      res.json({ message: 'Unit deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = UnitController;
