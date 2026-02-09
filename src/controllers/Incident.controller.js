const prisma = require('../lib/prisma');

// Get all incidents (with filters)
const getAll = async (req, res) => {
  try {
    const { societyId } = req.user;
    const { status, severity, search } = req.query;

    const where = {
      societyId,
      ...((req.user.role || '').toUpperCase() === 'GUARD' ? { reportedById: req.user.id } : {}),
      ...(status && status !== 'all' ? { status } : {}),
      ...(severity && severity !== 'all' ? { severity } : {}),
      ...(search ? {
        OR: [
          { title: { contains: search } },
          { description: { contains: search } },
          { location: { contains: search } }
        ]
      } : {})
    };

    const incidents = await prisma.incident.findMany({
      where,
      include: {
        reportedBy: {
          select: { id: true, name: true, role: { select: { name: true } } }
        },
        assignedTo: {
          select: { id: true, name: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ success: true, data: incidents });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Create new incident
const create = async (req, res) => {
  try {
    const { title, description, location, severity, images } = req.body;
    const { societyId, id: userId } = req.user;

    const incident = await prisma.incident.create({
      data: {
        title,
        description,
        location,
        severity: severity || 'medium',
        societyId,
        reportedById: userId,
        images: images || [],
        status: 'open'
      }
    });

    res.status(201).json({ success: true, data: incident });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update incident status (Guard: only own reported incidents)
const updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, assignedToId } = req.body;

    const existing = await prisma.incident.findUnique({ where: { id: parseInt(id) } });
    if (!existing) return res.status(404).json({ success: false, message: 'Incident not found' });
    if (req.user.role !== 'SUPER_ADMIN' && existing.societyId !== req.user.societyId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    if ((req.user.role || '').toUpperCase() === 'GUARD' && existing.reportedById !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied: you can only update incidents you reported' });
    }

    const incident = await prisma.incident.update({
      where: { id: parseInt(id) },
      data: {
        status,
        ...(assignedToId ? { assignedToId: parseInt(assignedToId) } : {})
      }
    });

    res.json({ success: true, data: incident });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get incident stats (Guard: only own reported incidents)
const getStats = async (req, res) => {
  try {
    const { societyId } = req.user;
    const guardScope = (req.user.role || '').toUpperCase() === 'GUARD' ? { reportedById: req.user.id } : {};
    const baseWhere = { societyId, ...guardScope };

    const [total, open, resolved, critical] = await Promise.all([
      prisma.incident.count({ where: baseWhere }),
      prisma.incident.count({ where: { ...baseWhere, status: 'open' } }),
      prisma.incident.count({ where: { ...baseWhere, status: 'resolved' } }),
      prisma.incident.count({ where: { ...baseWhere, severity: 'critical' } })
    ]);

    res.json({
      success: true,
      data: { total, open, resolved, critical }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getAll,
  create,
  updateStatus,
  getStats
};
