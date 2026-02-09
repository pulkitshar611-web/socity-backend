const prisma = require('../lib/prisma');

const MoveRequestController = {
  // List all move requests with filters
  list: async (req, res) => {
    try {
      const { type, status, search } = req.query;
      const societyId = req.user.societyId;

      const where = { societyId };
      if (type && type !== 'all') where.type = type.toUpperCase().replace('-', '_');
      if (status && status !== 'all') where.status = status.toUpperCase();

      const requests = await prisma.moveRequest.findMany({
        where,
        include: {
          unit: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      // Calculate stats
      const stats = {
        total: await prisma.moveRequest.count({ where: { societyId } }),
        moveIns: await prisma.moveRequest.count({ where: { societyId, type: 'MOVE_IN' } }),
        moveOuts: await prisma.moveRequest.count({ where: { societyId, type: 'MOVE_OUT' } }),
        pending: await prisma.moveRequest.count({ where: { societyId, status: 'PENDING' } }),
      };

      res.json({
        success: true,
        data: requests,
        stats,
      });
    } catch (error) {
      console.error('List move requests error:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch move requests' });
    }
  },

  // Create new move request
  create: async (req, res) => {
    try {
      const {
        type,
        unitId,
        residentName,
        phone,
        email,
        scheduledDate,
        timeSlot,
        vehicleType,
        vehicleNumber,
        depositAmount,
        notes,
      } = req.body;
      const societyId = req.user.societyId;

      // Validate unit existence
      if (unitId) {
        console.log(`Creating MoveRequest: Attempting to find unit with identifier: ${unitId} in society: ${societyId}`);

        let unit = null;
        const numericId = parseInt(unitId);

        if (!isNaN(numericId)) {
          // Try finding by primary key ID first
          unit = await prisma.unit.findFirst({
            where: { id: numericId, societyId }
          });
        }

        // If not found by ID, try finding by unit number (common user input)
        if (!unit) {
          unit = await prisma.unit.findFirst({
            where: { number: unitId.toString(), societyId }
          });
        }

        if (!unit) {
          console.warn(`Create MoveRequest failed: Unit ${unitId} not found`);
          return res.status(400).json({
            success: false,
            error: `Unit '${unitId}' not found. Please ensure the unit number is correct.`
          });
        }

        // Use the actual database ID for the move request
        req.body.actualUnitId = unit.id;
        console.log(`Unit found: ${unit.block}-${unit.number} (ID: ${unit.id})`);
      }

      const normalizedType = type ? type.toUpperCase().replace('-', '_') : 'MOVE_IN';

      const request = await prisma.moveRequest.create({
        data: {
          type: normalizedType,
          unitId: req.body.actualUnitId || (unitId ? parseInt(unitId) : null),
          residentName,
          phone,
          email,
          scheduledDate: new Date(scheduledDate),
          timeSlot,
          vehicleType,
          vehicleNumber,
          depositAmount: depositAmount ? parseFloat(depositAmount) : null,
          depositStatus: normalizedType === 'MOVE_IN' ? 'PAID' : null,
          notes,
          societyId,
        },
        include: {
          unit: true,
        },
      });

      res.status(201).json({
        success: true,
        data: request,
      });
    } catch (error) {
      console.error('Create move request error:', error);
      res.status(500).json({ success: false, error: 'Failed to create move request' });
    }
  },

  // Update move request
  update: async (req, res) => {
    try {
      const { id } = req.params;
      const updateData = req.body;

      // Convert type if present
      if (updateData.type) {
        updateData.type = updateData.type.toUpperCase().replace('-', '_');
      }

      // Convert dates
      if (updateData.scheduledDate) {
        updateData.scheduledDate = new Date(updateData.scheduledDate);
      }

      // Convert numbers
      if (updateData.unitId) {
        updateData.unitId = parseInt(updateData.unitId);
      }
      if (updateData.depositAmount) {
        updateData.depositAmount = parseFloat(updateData.depositAmount);
      }

      const request = await prisma.moveRequest.update({
        where: { id: parseInt(id) },
        data: updateData,
        include: {
          unit: true,
        },
      });

      res.json({
        success: true,
        data: request,
      });
    } catch (error) {
      console.error('Update move request error:', error);
      res.status(500).json({ success: false, error: 'Failed to update move request' });
    }
  },

  // Update status (Approve/Reject/Complete)
  updateStatus: async (req, res) => {
    try {
      const { id } = req.params;
      const { status, nocStatus, depositStatus, checklistItems } = req.body;

      const updateData = {};
      if (status) updateData.status = status.toUpperCase();
      if (nocStatus) updateData.nocStatus = nocStatus.toUpperCase();
      if (depositStatus) updateData.depositStatus = depositStatus.toUpperCase().replace('-', '_');
      if (checklistItems) updateData.checklistItems = checklistItems;

      const request = await prisma.moveRequest.update({
        where: { id: parseInt(id) },
        data: updateData,
        include: {
          unit: true,
        },
      });

      res.json({
        success: true,
        data: request,
      });
    } catch (error) {
      console.error('Update status error:', error);
      res.status(500).json({ success: false, error: 'Failed to update status' });
    }
  },

  // Delete move request
  delete: async (req, res) => {
    try {
      const { id } = req.params;

      await prisma.moveRequest.delete({
        where: { id: parseInt(id) },
      });

      res.json({
        success: true,
        message: 'Move request deleted successfully',
      });
    } catch (error) {
      console.error('Delete move request error:', error);
      res.status(500).json({ success: false, error: 'Failed to delete move request' });
    }
  },
};

module.exports = MoveRequestController;
