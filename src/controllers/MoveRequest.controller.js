const prisma = require('../lib/prisma');

const MoveRequestController = {
  // List all move requests with filters
  list: async (req, res) => {
    try {
      const { type, status, search } = req.query;
      const societyId = req.user.societyId;
      const role = req.user.role.toUpperCase();

      const where = { societyId };

      // If resident, only show requests for their units
      if (role === 'RESIDENT') {
        const userUnits = await prisma.unit.findMany({
          where: {
            OR: [
              { ownerId: req.user.id },
              { tenantId: req.user.id }
            ]
          },
          select: { id: true }
        });
        const unitIds = userUnits.map(u => u.id);
        where.unitId = { in: unitIds };
      }

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
      let finalDepositAmount = depositAmount ? parseFloat(depositAmount) : null;
      let finalDepositStatus = normalizedType === 'MOVE_IN' ? 'PENDING' : null;

      // For MOVE_OUT, automatically fetch deposit from unit
      if (normalizedType === 'MOVE_OUT' && req.body.actualUnitId) {
        const unit = await prisma.unit.findUnique({
          where: { id: req.body.actualUnitId }
        });
        if (unit?.securityDeposit) {
          finalDepositAmount = unit.securityDeposit;
          finalDepositStatus = 'REFUND_PENDING';
        }
      }

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
          depositAmount: finalDepositAmount,
          depositStatus: finalDepositStatus,
          notes,
          societyId,
        },
        include: {
          unit: true,
        },
      });

      // Create Notification if it's a MOVE_IN with deposit
      if (normalizedType === 'MOVE_IN' && finalDepositAmount > 0) {
        // Try to find the user to notify
        const targetUnit = await prisma.unit.findUnique({
          where: { id: request.unitId },
          include: { owner: true, tenant: true }
        });
        const targetUser = targetUnit?.tenant || targetUnit?.owner;
        
        if (targetUser) {
          await prisma.notification.create({
            data: {
              userId: targetUser.id,
              title: 'Move-In Security Deposit',
              description: `A security deposit of ₹${finalDepositAmount} is required for your Move-In request for unit ${targetUnit.block}-${targetUnit.number}.`,
              type: 'payment',
              metadata: { moveRequestId: request.id, amount: finalDepositAmount }
            }
          });
        }
      }

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
      const { status, nocStatus, depositStatus: newDepositStatus, checklistItems } = req.body;

      const currentRequest = await prisma.moveRequest.findUnique({
        where: { id: parseInt(id) },
        include: { unit: true }
      });

      if (!currentRequest) {
        return res.status(404).json({ success: false, error: 'Move request not found' });
      }

      const updateData = {};
      if (status) updateData.status = status.toUpperCase();
      if (nocStatus) updateData.nocStatus = nocStatus.toUpperCase();
      if (newDepositStatus) updateData.depositStatus = newDepositStatus.toUpperCase().replace('-', '_');
      if (checklistItems) updateData.checklistItems = checklistItems;

      const isCompleting = status && status.toUpperCase() === 'COMPLETED';
      const isMoveIn = currentRequest.type === 'MOVE_IN';
      const isMoveOut = currentRequest.type === 'MOVE_OUT';

      const result = await prisma.$transaction(async (tx) => {
        const updatedRequest = await tx.moveRequest.update({
          where: { id: parseInt(id) },
          data: updateData,
          include: {
            unit: true,
          },
        });

        if (isCompleting) {
          // Handle Deposit/Refund Logic on Completion
          if (isMoveIn && updatedRequest.depositAmount > 0) {
            // 1. Update Unit Deposit
            await tx.unit.update({
              where: { id: updatedRequest.unitId },
              data: { securityDeposit: updatedRequest.depositAmount }
            });

            // 2. Create INCOME Transaction
            await tx.transaction.create({
              data: {
                type: 'INCOME',
                category: 'SECURITY_DEPOSIT',
                amount: updatedRequest.depositAmount,
                date: new Date(),
                description: `Security Deposit for Unit ${updatedRequest.unitId} (Move-In)`,
                paymentMethod: 'CASH',
                status: 'PAID',
                societyId: updatedRequest.societyId,
                receivedFrom: updatedRequest.residentName
              }
            });

            // 3. Ensure deposit status is PAID
            await tx.moveRequest.update({
              where: { id: updatedRequest.id },
              data: { depositStatus: 'PAID' }
            });
          } else if (isMoveOut) {
            const refundAmount = updatedRequest.unit?.securityDeposit || 0;
            
            if (refundAmount > 0) {
              // 1. Create EXPENSE Transaction
              await tx.transaction.create({
                data: {
                  type: 'EXPENSE',
                  category: 'SECURITY_DEPOSIT_REFUND',
                  amount: refundAmount,
                  date: new Date(),
                  description: `Security Deposit Refund for Unit ${updatedRequest.unitId} (Move-Out)`,
                  paymentMethod: 'CASH',
                  status: 'PAID',
                  societyId: updatedRequest.societyId,
                  paidTo: updatedRequest.residentName
                }
              });

              // 2. Reset Unit Deposit
              await tx.unit.update({
                where: { id: updatedRequest.unitId },
                data: { securityDeposit: 0 }
              });

              // 3. Set deposit status to REFUNDED
              await tx.moveRequest.update({
                where: { id: updatedRequest.id },
                data: { depositStatus: 'REFUNDED' }
              });
            }
          }
        }

        return updatedRequest;
      });

      res.json({
        success: true,
        data: result,
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
