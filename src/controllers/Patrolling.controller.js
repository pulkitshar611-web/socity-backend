const prisma = require('../lib/prisma');

// Get all patrol logs
const getAll = async (req, res) => {
  try {
    const { societyId } = req.user;

    // Simple filter support
    const { status } = req.query;
    const where = {
      societyId,
      ...(status ? { status } : {})
    };

    const logs = await prisma.patrolLog.findMany({
      where,
      include: {
        guard: {
          select: { id: true, name: true }
        }
      },
      orderBy: { startTime: 'desc' }
    });

    res.json({ success: true, data: logs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Create patrol log
const create = async (req, res) => {
  try {
    const { area, notes, status } = req.body;
    const { societyId, id: userId } = req.user;

    const log = await prisma.patrolLog.create({
      data: {
        area,
        notes,
        status: status || 'completed',
        societyId,
        guardId: userId,
        startTime: new Date()
      }
    });

    res.status(201).json({ success: true, data: log });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getAll,
  create
};
