const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// List all parcels for a society
// List all parcels with filters and search
const getAll = async (req, res) => {
  try {
    const societyId = req.user.societyId;
    const { status, search } = req.query;
    
    const where = { societyId };
    if ((req.user.role || '').toUpperCase() === 'GUARD') {
      where.loggedByGuardId = req.user.id;
    }
    
    if (status && status !== 'all') {
      where.status = status; // e.g., 'PENDING', 'COLLECTED', 'OVERDUE'
    }

    if (search) {
      where.OR = [
        { trackingNumber: { contains: search } },
        { courierName: { contains: search } },
        { description: { contains: search } },
        { unit: { number: { contains: search } } },
        { unit: { block: { contains: search } } }
      ];
    }
    
    const parcels = await prisma.parcel.findMany({
      where,
      include: {
        unit: {
          include: {
            owner: { select: { name: true } },
            tenant: { select: { name: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, data: parcels });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get single parcel
const getById = async (req, res) => {
  try {
    const { id } = req.params;
    const parcel = await prisma.parcel.findUnique({
      where: { id: parseInt(id) },
      include: {
        unit: {
          include: {
            owner: { select: { name: true } },
            tenant: { select: { name: true } }
          }
        }
      }
    });
    if (!parcel) return res.status(404).json({ success: false, message: 'Parcel not found' });
    if (req.user.role !== 'SUPER_ADMIN' && parcel.societyId !== req.user.societyId) {
      return res.status(403).json({ success: false, message: 'Access denied: parcel belongs to another society' });
    }
    if ((req.user.role || '').toUpperCase() === 'GUARD' && parcel.loggedByGuardId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied: you can only view parcels you logged' });
    }
    res.json({ success: true, data: parcel });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Create parcel entry
const create = async (req, res) => {
  try {
    const { unitId, courierName, trackingNumber, description, receivedBy } = req.body;
    const societyId = req.user.societyId;
    
    const parcel = await prisma.parcel.create({
      data: {
        unitId: parseInt(unitId),
        courierName,
        trackingNumber,
        description,
        receivedBy,
        status: 'PENDING',
        societyId,
        loggedByGuardId: (req.user.role || '').toUpperCase() === 'GUARD' ? req.user.id : null
      }
    });
    res.status(201).json({ success: true, data: parcel });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update parcel status (collected)
const updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, collectedBy, collectedAt } = req.body;
    const existing = await prisma.parcel.findUnique({ where: { id: parseInt(id) } });
    if (!existing) return res.status(404).json({ success: false, message: 'Parcel not found' });
    if (req.user.role !== 'SUPER_ADMIN' && existing.societyId !== req.user.societyId) {
      return res.status(403).json({ success: false, message: 'Access denied: parcel belongs to another society' });
    }
    if ((req.user.role || '').toUpperCase() === 'GUARD' && existing.loggedByGuardId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied: you can only update parcels you logged' });
    }
    const parcel = await prisma.parcel.update({
      where: { id: parseInt(id) },
      data: {
        status,
        collectedBy,
        collectedAt: collectedAt ? new Date(collectedAt) : new Date()
      }
    });
    res.json({ success: true, data: parcel });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete parcel
const remove = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await prisma.parcel.findUnique({ where: { id: parseInt(id) } });
    if (!existing) return res.status(404).json({ success: false, message: 'Parcel not found' });
    if (req.user.role !== 'SUPER_ADMIN' && existing.societyId !== req.user.societyId) {
      return res.status(403).json({ success: false, message: 'Access denied: parcel belongs to another society' });
    }
    await prisma.parcel.delete({ where: { id: parseInt(id) } });
    res.json({ success: true, message: 'Parcel deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get parcel statistics (Guard: only parcels they logged)
const getStats = async (req, res) => {
  try {
    const societyId = req.user.societyId;
    const guardScope = (req.user.role || '').toUpperCase() === 'GUARD' ? { loggedByGuardId: req.user.id } : {};
    const baseWhere = { societyId, ...guardScope };

    const [total, pending, delivered, overdue] = await Promise.all([
      prisma.parcel.count({ where: baseWhere }),
      prisma.parcel.count({ where: { ...baseWhere, status: 'PENDING' } }),
      prisma.parcel.count({ where: { ...baseWhere, status: 'COLLECTED' } }),
      prisma.parcel.count({ where: { ...baseWhere, status: 'OVERDUE' } })
    ]);
    
    res.json({
      success: true,
      data: {
        total,
        pending,
        delivered,
        overdue
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getAll, getById, create, updateStatus, remove, getStats };
