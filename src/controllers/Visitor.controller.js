const prisma = require('../lib/prisma');
const cloudinary = require('../config/cloudinary');

class VisitorController {
  static async list(req, res) {
    try {
      const societyId = req.user.societyId;
      if (!societyId && req.user.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Visitor list is only available for society-scoped users' });
      }
      if (!societyId) {
        return res.json([]);
      }
      const { status, search, unitId, date, block } = req.query;
      const where = { societyId };

      // Guard: only see (1) visitors they checked in, OR (2) pending/approved not yet checked in by any guard
      // Do NOT show checkedInById=null with CHECKED_IN/CHECKED_OUT (legacy) – else both guards see same list
      const isGuard = (req.user.role || '').toUpperCase() === 'GUARD';
      if (isGuard) {
        where.AND = (where.AND || []).concat({
          OR: [
            { checkedInById: req.user.id },
            { checkedInById: null, status: { in: ['PENDING', 'APPROVED', 'PRE_APPROVED'] } }
          ]
        });
      }

      // Status filter
      if (status && status !== 'all') {
        const statusMap = {
          'checked-in': 'CHECKED_IN',
          'checked-out': 'CHECKED_OUT',
          'approved': 'APPROVED',
          'pending': 'PENDING',
          'rejected': 'DENIED' // or REJECTED
        };
        where.status = statusMap[status] || status.toUpperCase();
      }

      // Unit filter
      if (unitId) where.visitingUnitId = parseInt(unitId);

      // Block filter
      if (block && block !== 'all-blocks') {
        where.unit = {
          block: block
        };
      }

      // Date filter
      if (date) {
        const now = new Date();
        const startOfDay = new Date(now.setHours(0, 0, 0, 0));
        const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        if (date === 'today') {
          where.createdAt = { gte: startOfDay };
        } else if (date === 'yesterday') {
          const yesterdayStart = new Date(new Date().setDate(new Date().getDate() - 1)).setHours(0, 0, 0, 0);
          const yesterdayEnd = new Date(new Date().setDate(new Date().getDate() - 1)).setHours(23, 59, 59, 999);
          where.createdAt = { gte: new Date(yesterdayStart), lte: new Date(yesterdayEnd) };
        } else if (date === 'week') {
          where.createdAt = { gte: startOfWeek };
        } else if (date === 'month') {
          where.createdAt = { gte: startOfMonth };
        }
      }

      // Search filter (AND with guard filter so guard scope is never lost)
      if (search && search.trim()) {
        where.AND = (where.AND || []).concat({
          OR: [
            { name: { contains: search } },
            { phone: { contains: search } },
            { purpose: { contains: search } },
            { unit: { block: { contains: search } } },
            { unit: { number: { contains: search } } }
          ]
        });
      }

      const visitors = await prisma.visitor.findMany({
        where,
        include: {
          unit: {
            include: {
              owner: true,
              tenant: true
            }
          },
          resident: true
        },
        orderBy: { createdAt: 'desc' }
      });

      res.json(visitors);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  }

  static async getStats(req, res) {
    try {
      const societyId = req.user.societyId;
      if (!societyId) {
        return res.json({ totalToday: 0, activeNow: 0, preApproved: 0, totalMonth: 0 });
      }
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

      // Guard: same scope as list – only my visitors OR pending/approved (not legacy checked-in with null)
      const guardScope = (req.user.role || '').toUpperCase() === 'GUARD'
        ? { OR: [{ checkedInById: req.user.id }, { checkedInById: null, status: { in: ['PENDING', 'APPROVED', 'PRE_APPROVED'] } }] }
        : {};

      const [totalToday, activeNow, preApproved, totalMonth] = await Promise.all([
        prisma.visitor.count({
          where: {
            societyId,
            createdAt: { gte: today },
            ...guardScope
          }
        }),
        prisma.visitor.count({
          where: {
            societyId,
            status: 'CHECKED_IN',
            ...guardScope
          }
        }),
        prisma.visitor.count({
          where: {
            societyId,
            status: { in: ['APPROVED', 'PRE_APPROVED'] },
            createdAt: { gte: today },
            ...guardScope
          }
        }),
        prisma.visitor.count({
          where: {
            societyId,
            createdAt: { gte: firstDayOfMonth },
            ...guardScope
          }
        })
      ]);

      res.json({
        totalToday,
        activeNow,
        preApproved,
        totalMonth
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async checkIn(req, res) {
    try {
      const societyId = req.user.societyId;
      if (!societyId) {
        return res.status(403).json({ error: 'Visitor check-in is only for society-scoped users' });
      }
      const { name, phone, visitingUnitId, purpose, vehicleNo, idType, idNumber } = req.body;
      let photoUrl = null;

      // Handle Photo Upload
      if (req.file) {
        const b64 = Buffer.from(req.file.buffer).toString('base64');
        const dataURI = 'data:' + req.file.mimetype + ';base64,' + b64;
        const uploadResponse = await cloudinary.uploader.upload(dataURI, {
          folder: 'socity_visitors',
          resource_type: 'auto'
        });
        photoUrl = uploadResponse.secure_url;
      }

      // Auto-assign resident if unit is provided; ensure unit belongs to same society
      let residentId = null;
      if (visitingUnitId) {
        const unit = await prisma.unit.findUnique({
          where: { id: parseInt(visitingUnitId) },
          include: { owner: true, tenant: true }
        });
        if (unit && unit.societyId !== societyId) {
          return res.status(403).json({ error: 'Unit belongs to another society' });
        }
        if (unit) residentId = unit.tenantId || unit.ownerId;
      }

      const visitor = await prisma.visitor.create({
        data: {
          name,
          phone,
          visitingUnitId: parseInt(visitingUnitId),
          residentId,
          purpose,
          vehicleNo,
          idType,
          idNumber,
          photo: photoUrl,
          status: 'CHECKED_IN',
          entryTime: new Date(),
          societyId,
          checkedInById: (req.user.role || '').toUpperCase() === 'GUARD' ? req.user.id : null
        }
      });
      res.status(201).json(visitor);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  }

  static async preApprove(req, res) {
    try {
      const societyId = req.user.societyId;
      if (!societyId) {
        return res.status(403).json({ error: 'Pre-approval is only for society-scoped users' });
      }
      const { name, phone, purpose, visitingUnitId, vehicleNo } = req.body;
      let photoUrl = null;

      if (req.file) {
        const b64 = Buffer.from(req.file.buffer).toString('base64');
        const dataURI = 'data:' + req.file.mimetype + ';base64,' + b64;
        const uploadResponse = await cloudinary.uploader.upload(dataURI, {
          folder: 'socity_visitors',
          resource_type: 'auto'
        });
        photoUrl = uploadResponse.secure_url;
      }

      let unitId = visitingUnitId;
      if (req.user.role === 'RESIDENT' && !unitId) {
        const userUnit = await prisma.unit.findFirst({
          where: { OR: [{ ownerId: req.user.id }, { tenantId: req.user.id }], societyId }
        });
        if (userUnit) unitId = userUnit.id;
      }
      if (unitId) {
        const unit = await prisma.unit.findUnique({ where: { id: parseInt(unitId) } });
        if (unit && unit.societyId !== societyId) {
          return res.status(403).json({ error: 'Unit belongs to another society' });
        }
      }

      const visitor = await prisma.visitor.create({
        data: {
          name,
          phone,
          purpose,
          vehicleNo,
          visitingUnitId: unitId ? parseInt(unitId) : null,
          residentId: req.user.role === 'RESIDENT' ? req.user.id : null,
          status: 'APPROVED',
          photo: photoUrl,
          societyId
        }
      });
      res.status(201).json(visitor);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  }

  static async checkOut(req, res) {
    try {
      const { id } = req.params;
      const existing = await prisma.visitor.findUnique({ where: { id: parseInt(id) } });
      if (!existing) return res.status(404).json({ error: 'Visitor not found' });
      if (req.user.role !== 'SUPER_ADMIN' && existing.societyId !== req.user.societyId) {
        return res.status(403).json({ error: 'Access denied: visitor belongs to another society' });
      }
      if ((req.user.role || '').toUpperCase() === 'GUARD' && existing.checkedInById != null && existing.checkedInById !== req.user.id) {
        return res.status(403).json({ error: 'Access denied: you can only check out visitors you checked in' });
      }
      const visitor = await prisma.visitor.update({
        where: { id: parseInt(id) },
        data: { status: 'CHECKED_OUT', exitTime: new Date() }
      });
      res.json(visitor);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async updateStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const existing = await prisma.visitor.findUnique({ where: { id: parseInt(id) } });
      if (!existing) return res.status(404).json({ error: 'Visitor not found' });
      if (req.user.role !== 'SUPER_ADMIN' && existing.societyId !== req.user.societyId) {
        return res.status(403).json({ error: 'Access denied: visitor belongs to another society' });
      }
      const newStatus = (status || '').toUpperCase();
      const updateData = { status: newStatus };
      // When guard approves or checks in, record this guard as the one who did it
      if ((req.user.role || '').toUpperCase() === 'GUARD' && (newStatus === 'CHECKED_IN' || newStatus === 'APPROVED')) {
        updateData.checkedInById = req.user.id;
        if (newStatus === 'CHECKED_IN') updateData.entryTime = new Date();
      }
      const visitor = await prisma.visitor.update({
        where: { id: parseInt(id) },
        data: updateData
      });
      res.json(visitor);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = VisitorController;
