const prisma = require('../lib/prisma');

class ParkingSlotController {
  
  // Get all slots with filters and relations
  static async list(req, res) {
    try {
      const { societyId } = req.user;
      const { status, type, block, search } = req.query;

      const where = { 
        societyId,
        ...(status && status !== 'all' ? { status } : {}),
        ...(type && type !== 'all' ? { type } : {}),
        ...(block && block !== 'all' ? { block } : {}),
        ...(search ? {
            OR: [
                { number: { contains: search } },
                { vehicleNumber: { contains: search } },
                { unit: { OR: [
                    { block: { contains: search } },
                    { number: { contains: search } },
                    { owner: { name: { contains: search } } }, // Search by resident name
                    { tenant: { name: { contains: search } } }
                ]}}
            ]
        } : {})
      };

      const slots = await prisma.parkingSlot.findMany({
        where,
        include: { 
            unit: {
                include: {
                    owner: { select: { name: true } },
                    tenant: { select: { name: true } }
                }
            }
        },
        orderBy: { number: 'asc' }
      });

      res.json({ success: true, data: slots });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Get Parking Stats
  static async getStats(req, res) {
      try {
          const { societyId } = req.user;
          
          const [total, occupied, available, maintenance] = await Promise.all([
              prisma.parkingSlot.count({ where: { societyId } }),
              prisma.parkingSlot.count({ where: { societyId, status: 'occupied' } }),
              prisma.parkingSlot.count({ where: { societyId, status: 'available' } }),
              prisma.parkingSlot.count({ where: { societyId, status: 'maintenance' } })
          ]);

          res.json({
              success: true,
              data: { total, occupied, available, maintenance }
          });
      } catch (error) {
          res.status(500).json({ success: false, error: error.message });
      }
  }

  static async create(req, res) {
    try {
      const { number, type, status, block, floor, monthlyCharge } = req.body;
      const { societyId } = req.user;

      const slot = await prisma.parkingSlot.create({
        data: {
          number,
          type,
          status: status || 'available',
          block,
          floor,
          monthlyCharge: parseFloat(monthlyCharge || 0),
          societyId
        }
      });
      res.status(201).json({ success: true, data: slot });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Assign slot to a unit/resident
  static async assign(req, res) {
      try {
          const { id } = req.params;
          const { unitId, vehicleNumber } = req.body;

          const slot = await prisma.parkingSlot.update({
              where: { id: parseInt(id) },
              data: {
                  status: 'occupied',
                  allocatedToUnitId: parseInt(unitId),
                  vehicleNumber
              }
          });
          
          res.json({ success: true, data: slot });
      } catch (error) {
          res.status(500).json({ success: false, error: error.message });
      }
  }

  // Unassign slot
  static async unassign(req, res) {
      try {
          const { id } = req.params;

          const slot = await prisma.parkingSlot.update({
              where: { id: parseInt(id) },
              data: {
                  status: 'available',
                  allocatedToUnitId: null,
                  vehicleNumber: null
              }
          });
          
          res.json({ success: true, data: slot });
      } catch (error) {
          res.status(500).json({ success: false, error: error.message });
      }
  }

  static async update(req, res) {
    try {
      const { id } = req.params;
      const data = { ...req.body };
      
      if (data.monthlyCharge) {
          data.monthlyCharge = parseFloat(data.monthlyCharge);
      }
      
       const slot = await prisma.parkingSlot.update({
        where: { id: parseInt(id) },
        data // Now using sanitized data
      });
      res.json({ success: true, data: slot });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  static async delete(req, res) {
    try {
      const { id } = req.params;
      await prisma.parkingSlot.delete({ where: { id: parseInt(id) } });
      res.json({ success: true, message: 'Parking slot deleted successfully' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

module.exports = ParkingSlotController;
