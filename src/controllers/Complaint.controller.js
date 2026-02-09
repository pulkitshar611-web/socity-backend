const prisma = require('../lib/prisma');

class ComplaintController {
  static async list(req, res) {
    try {
      let { status, category, priority, search, isPrivate, escalatedToTech, page = 1, limit = 10 } = req.query;
      page = parseInt(page);
      limit = parseInt(limit);
      const skip = (page - 1) * limit;

      const where = {};

      if (req.user.role === 'RESIDENT') {
        where.reportedById = req.user.id;
      } else if (req.user.role === 'ADMIN' || req.user.role === 'COMMITTEE') {
        // Admins see all public tickets in their society, 
        // OR private tickets assigned to them, 
        // OR private tickets they reported
        where.societyId = req.user.societyId;
        where.OR = [
          { isPrivate: false },
          { assignedToId: req.user.id },
          { reportedById: req.user.id }
        ];
      } else if (req.user.role === 'SUPER_ADMIN') {
        // Super Admins see public tickets OR admin-escalated complaints
        where.OR = [
          { isPrivate: false },
          { escalatedToSuperAdmin: true }
        ];
      } else if (req.user.role === 'VENDOR') {
        const vendor = await prisma.vendor.findFirst({ where: { email: req.user.email } });
        if (vendor) {
            where.vendorId = vendor.id;
        }
      }

      if (status) where.status = status;
      if (category && category !== 'all') where.category = category;
      if (priority) where.priority = priority;
      if (escalatedToTech !== undefined) where.escalatedToTech = escalatedToTech === 'true';
      if (search) {
        where.OR = [
          { title: { contains: search } },
          { description: { contains: search } }
        ];
      }

      const [total, complaints] = await Promise.all([
        prisma.complaint.count({ where }),
        prisma.complaint.findMany({
          where,
          skip,
          take: limit,
          include: {
            reportedBy: {
              select: {
                name: true,
                email: true,
                role: true,
                ownedUnits: { select: { block: true, number: true } },
                rentedUnits: { select: { block: true, number: true } }
              }
            },
            assignedTo: { select: { name: true } },
            society: { select: { name: true } },
            vendor: { select: { name: true } },
            comments: { select: { id: true } }
          },
          orderBy: { createdAt: 'desc' }
        })
      ]);

      const transformed = complaints.map(c => {
        const units = [...c.reportedBy.ownedUnits, ...c.reportedBy.rentedUnits];
        const unitStr = units.length > 0 ? `${units[0].block}-${units[0].number}` : 'N/A';

        return {
          ...c,
          unit: unitStr,
          residentName: c.reportedBy.name,
          source: c.reportedBy.role === 'RESIDENT' ? 'resident' : 'society',
          serviceName: c.category,
          reportedByOriginal: c.reportedBy,
          reportedBy: c.reportedBy.name,
          messages: c.comments // Map comments to messages for frontend compatibility
        };
      });

      res.json({
        data: transformed,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async create(req, res) {
    try {
      const { title, description, category, priority, isPrivate, images, vendorId } = req.body;
      let finalVendorId = vendorId != null ? parseInt(vendorId, 10) : null;

      // Smart Routing: Auto-assign to vendor if not explicitly selected
      if (!finalVendorId && category) {
        const categoryMap = {
          'cleaning': ['Housekeeping', 'Cleaning', 'Maid', 'House Keeping'],
          'security': ['Security', 'Guard', 'Security Guard'],
          'pest': ['Pest Control', 'Pest'],
          'plumbing': ['Plumber', 'Plumbing'],
          'electric': ['Electrician', 'Electrical'],
          'internet': ['Internet', 'Broadband', 'Wifi']
        };

        const targetServiceTypes = categoryMap[category.toLowerCase()] || [category];
        
        // Find an active vendor in this society matching the service type
        const vendor = await prisma.vendor.findFirst({
          where: {
            societyId: req.user.societyId,
            status: 'ACTIVE',
            serviceType: { in: targetServiceTypes } // Prisma 'in' filter
          }
        });

        if (vendor) {
            finalVendorId = vendor.id;
        }
      }

      const isAdminEscalation = (req.user.role === 'ADMIN' || req.user.role === 'COMMITTEE') && !finalVendorId;
      const complaint = await prisma.complaint.create({
        data: {
          title,
          description,
          category,
          priority: priority || 'MEDIUM',
          isPrivate: isAdminEscalation ? true : (isPrivate || false),
          escalatedToSuperAdmin: isAdminEscalation,
          images: images || undefined,
          societyId: req.user.societyId,
          reportedById: req.user.id,
          vendorId: isAdminEscalation ? null : finalVendorId
        }
      });
      res.status(201).json(complaint);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async updateStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const complaint = await prisma.complaint.update({
        where: { id: parseInt(id) },
        data: { status: status.toUpperCase() },
        include: { society: { select: { name: true } } }
      });

      // Notify society and platform admins
      const { getIO } = require('../lib/socket');
      const io = getIO();
      io.to(`society_${complaint.societyId}`).emit('complaint_updated', {
        id: complaint.id,
        status: complaint.status,
        title: complaint.title,
        societyName: complaint.society?.name
      });

      res.json(complaint);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async assign(req, res) {
    try {
      const { id } = req.params;
      const { assignedToId } = req.body;
      const complaint = await prisma.complaint.update({
        where: { id: parseInt(id) },
        data: { assignedToId },
        include: { assignedTo: { select: { name: true } } }
      });

      // Notify society
      const { getIO } = require('../lib/socket');
      const io = getIO();
      io.to(`society_${complaint.societyId}`).emit('complaint_updated', {
        id: complaint.id,
        assignedTo: complaint.assignedTo?.name,
        title: complaint.title
      });

      res.json(complaint);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async addComment(req, res) {
    try {
      const { id } = req.params;
      const { message } = req.body;
      const comment = await prisma.complaintComment.create({
        data: {
          complaintId: parseInt(id),
          userId: req.user.id,
          message
        }
      });
      res.status(201).json(comment);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  /** Admin-only: raise a complaint against a specific vendor (separate from "escalate to Super Admin"). */
  static async createAgainstVendor(req, res) {
    try {
      const { vendorId, title, description, category, priority, isPrivate, images } = req.body;
      const vId = vendorId != null ? parseInt(vendorId, 10) : null;
      if (!vId || !title || !description || !category) {
        return res.status(400).json({ error: 'vendorId, title, description and category are required' });
      }
      const complaint = await prisma.complaint.create({
        data: {
          title,
          description,
          category,
          priority: priority || 'MEDIUM',
          isPrivate: isPrivate ?? false,
          escalatedToSuperAdmin: false,
          images: images || undefined,
          societyId: req.user.societyId,
          reportedById: req.user.id,
          vendorId: vId
        }
      });
      res.status(201).json(complaint);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getStats(req, res) {
    try {
      const societyId = req.user.societyId;
      const stats = await prisma.complaint.groupBy({
        by: ['status'],
        where: { societyId },
        _count: true
      });

      const total = await prisma.complaint.count({ where: { societyId } });
      const highPriority = await prisma.complaint.count({
        where: {
          societyId,
          priority: { in: ['HIGH', 'URGENT'] }
        }
      });
      const resolved = stats.find(s => s.status === 'RESOLVED')?._count || 0;
      const inProgress = stats.find(s => s.status === 'IN_PROGRESS')?._count || 0;
      const open = stats.find(s => s.status === 'OPEN')?._count || 0;

      res.json({
        total,
        resolved,
        pending: inProgress + open,
        highPriority,
        byStatus: stats
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = ComplaintController;
