const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// List all vehicles for a society
const getAll = async (req, res) => {
  try {
    const societyId = req.user.societyId;
    const { type, status, search } = req.query;

    const where = { societyId };

    if (type && type !== 'all') {
      where.type = type;
    }

    if (status && status !== 'all') {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { number: { contains: search } },
        { ownerName: { contains: search } },
        { make: { contains: search } },
        { unit: { number: { contains: search } } },
        { unit: { block: { contains: search } } }
      ];
    }

    const vehicles = await prisma.unitVehicle.findMany({
      where,
      include: {
        unit: true
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ success: true, data: vehicles });
  } catch (error) {
    console.error('Get Vehicles Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Register vehicle
const register = async (req, res) => {
  try {
    const { vehicleNumber, vehicleType, make, color, unitId, parkingSlot, ownerName } = req.body;
    const societyId = req.user.societyId;

    // Check if vehicle number already exists in this society
    const existing = await prisma.unitVehicle.findFirst({
        where: { number: vehicleNumber, societyId }
    });

    if (existing) {
        return res.status(400).json({ success: false, message: 'Vehicle number already registered' });
    }

    const vehicle = await prisma.unitVehicle.create({
      data: {
        societyId,
        number: vehicleNumber,
        type: vehicleType,
        make,
        color,
        unitId: parseInt(unitId), // Ensure Int
        parkingSlot,
        ownerName,
        status: 'verified' // Default to verified for admin
      }
    });

    res.json({ success: true, data: vehicle });
  } catch (error) {
    console.error('Register Vehicle Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Remove vehicle
const remove = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.unitVehicle.delete({
      where: { id: parseInt(id) }
    });
    res.json({ success: true, message: 'Vehicle removed' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get vehicle statistics
const getStats = async (req, res) => {
  try {
    const societyId = req.user.societyId;
    
    const [total, cars, twoWheelers, verified] = await Promise.all([
      prisma.unitVehicle.count({ where: { societyId } }),
      prisma.unitVehicle.count({ where: { societyId, type: 'Car' } }),
      prisma.unitVehicle.count({ where: { societyId, type: 'Two Wheeler' } }),
      prisma.unitVehicle.count({ where: { societyId, status: 'verified' } })
    ]);
    
    res.json({
      success: true,
      data: {
        total,
        cars,
        twoWheelers,
        verified
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update vehicle status
const updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // 'verified' or 'pending' (or others like 'inactive')
    
    const vehicle = await prisma.unitVehicle.update({
      where: { id: parseInt(id) },
      data: { status }
    });
    
    res.json({ success: true, data: vehicle });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getAll, register, remove, getStats, updateStatus };
