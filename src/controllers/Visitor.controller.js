const prisma = require('../lib/prisma');
const cloudinary = require('../config/cloudinary');
const { getIO } = require('../lib/socket');

class VisitorController {
  static async list(req, res) {
    try {
      const societyId = req.user.societyId;
      console.log(`[VisitorList] User: ${req.user.id}, Role: ${req.user.role}, Society: ${societyId}, Status: ${req.query.status}`);
      if (!societyId && req.user.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Visitor list is only available for society-scoped users' });
      }
      if (!societyId) {
        return res.json([]);
      }
      const { status, search, unitId, date, block } = req.query;
      const where = {
        AND: [
          { societyId: societyId }
        ]
      };

      const userRole = (req.user.role || '').toUpperCase();
      const isGuard = userRole === 'GUARD';
      const isAdmin = userRole === 'ADMIN' || userRole === 'COMMUNITY-MANAGER';

      if (isAdmin) {
        // Admins see all
      } else if (isGuard) {
        const activeStatuses = ['PENDING', 'APPROVED', 'CHECKED_IN'];
        const historicalStatuses = ['CHECKED_OUT', 'REJECTED', 'EXITED'];
        if (status && status !== 'all') {
          const mappedStatus = status.toUpperCase().replace('-', '_');
          if (activeStatuses.includes(mappedStatus) || historicalStatuses.includes(mappedStatus) || status === 'history') {
            // Let it be handled by the common status filter logic below
          } else {
            return res.json([]);
          }
        } else {
          where.AND.push({ status: { in: activeStatuses } });
        }
      } else {
        // Residents see their own visitors (direct or thru their linked units)
        const currentUserId = Number(req.user.id);
        const currentUserEmail = req.user.email;
        where.AND.push({
          OR: [
            { residentId: currentUserId },
            {
              unit: {
                OR: [
                  { ownerId: currentUserId },
                  { tenantId: currentUserId },
                  { members: { some: { email: currentUserEmail } } }
                ]
              }
            }
          ]
        });
      }

      // Status filter (Global/Admin/Resident)
      if (status && status !== 'all') {
        if (status === 'history') {
          where.AND.push({ status: { in: ['CHECKED_OUT', 'REJECTED', 'EXITED'] } });
        } else {
          const statusMap = {
            'checked-in': 'CHECKED_IN',
            'checked-out': 'CHECKED_OUT',
            'exited': 'EXITED',
            'approved': 'APPROVED',
            'pending': 'PENDING',
            'rejected': 'REJECTED'
          };
          const mapped = statusMap[status] || status.toUpperCase().replace('-', '_');
          where.AND.push({ status: mapped });
        }
      }

      // Unit filter
      if (unitId) where.AND.push({ visitingUnitId: parseInt(unitId) });

      // Block filter
      if (block && block !== 'all-blocks') {
        where.AND.push({ unit: { block: block } });
      }

      // Date filter
      if (date) {
        const now = new Date();
        const startOfDay = new Date(new Date().setHours(0, 0, 0, 0));
        const startOfWeek = new Date(new Date().setDate(now.getDate() - now.getDay()));
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        if (date === 'today') {
          where.AND.push({ createdAt: { gte: startOfDay } });
        } else if (date === 'yesterday') {
          const yesterdayStart = new Date(new Date().setDate(new Date().getDate() - 1)).setHours(0, 0, 0, 0);
          const yesterdayEnd = new Date(new Date().setDate(new Date().getDate() - 1)).setHours(23, 59, 59, 999);
          where.AND.push({ createdAt: { gte: new Date(yesterdayStart), lte: new Date(yesterdayEnd) } });
        } else if (date === 'week') {
          where.AND.push({ createdAt: { gte: startOfWeek } });
        } else if (date === 'month') {
          where.AND.push({ createdAt: { gte: startOfMonth } });
        }
      }

      // Search filter
      if (search && search.trim()) {
        where.AND.push({
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
          resident: true,
          checkedInBy: true
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

      // Guards/Admins see all society-wide stats; Residents see only their own stats
      const isGuard = (req.user.role || '').toUpperCase() === 'GUARD';
      const isAdmin = (req.user.role || '').toUpperCase() === 'ADMIN';

      let guardScope = {};
      if (isAdmin || isGuard) {
        guardScope = { societyId }; // Guards/Admins see all for society
      } else if ((req.user.role || '').toUpperCase() === 'RESIDENT') {
        const currentUserId = Number(req.user.id);
        const currentUserEmail = req.user.email;
        guardScope = {
          societyId,
          OR: [
            { residentId: currentUserId },
            {
              unit: {
                OR: [
                  { ownerId: currentUserId },
                  { tenantId: currentUserId },
                  { members: { some: { email: currentUserEmail } } }
                ]
              }
            }
          ]
        };
      }


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
      const existing = await prisma.visitor.findUnique({
        where: { id: parseInt(id) },
        include: { unit: { include: { members: true } } }
      });
      if (!existing) return res.status(404).json({ error: 'Visitor not found' });

      const userId = Number(req.user.id);
      const userRole = (req.user.role || '').toUpperCase();
      const isAdmin = userRole === 'ADMIN' || userRole === 'COMMUNITY-MANAGER' || userRole === 'SUPER_ADMIN';

      if (!isAdmin && existing.societyId !== req.user.societyId) {
        return res.status(403).json({ error: 'Access denied: visitor belongs to another society' });
      }

      // Residents can only update their own visitors or visitors to their unit
      if (userRole === 'RESIDENT') {
        const isLinkedToUnit =
          existing.residentId === userId ||
          existing.unit.ownerId === userId ||
          existing.unit.tenantId === userId ||
          existing.unit.members.some(m => m.email === req.user.email);

        if (!isLinkedToUnit) {
          return res.status(403).json({ error: 'Access denied: you can only update status for visitors to your unit' });
        }
      }

      const newStatus = (status || '').toUpperCase();
      const updateData = { status: newStatus };

      // Residents "take ownership" of the visit tracking when they approve
      if (userRole === 'RESIDENT' && (newStatus === 'CHECKED_IN' || newStatus === 'APPROVED')) {
        updateData.residentId = userId;
      }

      // Auto-record entry time if status becomes CHECKED_IN
      if (newStatus === 'CHECKED_IN' && !existing.entryTime) {
        updateData.entryTime = new Date();
      }

      // Auto-record exit time if status becomes EXITED or CHECKED_OUT
      if ((newStatus === 'EXITED' || newStatus === 'CHECKED_OUT') && !existing.exitTime) {
        updateData.exitTime = new Date();
      }

      // Record who approved/checked in
      if (newStatus === 'CHECKED_IN' || newStatus === 'APPROVED') {
        updateData.checkedInById = userId;
      }

      const visitor = await prisma.visitor.update({
        where: { id: parseInt(id) },
        data: updateData
      });

      // Emit socket notification
      try {
        const io = getIO();

        // 1. To the public visitor-entry page (for individual tracking)
        io.to(`user_visitor_${id}`).emit('visitor_status_updated', {
          id: visitor.id,
          status: visitor.status
        });

        // 2. To the Guards/Society (for dashboard refresh)
        io.to(`society_${visitor.societyId}`).emit('visitor_status_updated', {
          id: visitor.id,
          status: visitor.status,
          name: visitor.name,
          message: `Visitor ${visitor.name} status updated to ${visitor.status}`
        });
      } catch (ioErr) {
        console.error('Visitor status socket emission failed:', ioErr);
      }


      res.json(visitor);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = VisitorController;
