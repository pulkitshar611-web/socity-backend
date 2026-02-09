const prisma = require('../lib/prisma');

const StaffController = {
  // List all staff (can filter by role). Guard: only helpers this guard created.
  list: async (req, res) => {
    try {
      const { role, status, shift } = req.query;
      const societyId = req.user.societyId;
      const isGuard = (req.user.role || '').toUpperCase() === 'GUARD';

      const where = { societyId };
      if (isGuard) where.createdByGuardId = req.user.id;
      if (role && role !== 'all') where.role = role.toUpperCase();
      if (status && status !== 'all') where.status = status;
      if (shift && shift !== 'all') where.shift = shift;

      let staff;
      try {
        staff = await prisma.staff.findMany({
          where,
          orderBy: { createdAt: 'desc' }
        });
      } catch (listErr) {
        // Column createdByGuardId missing: show all society staff so helpers at least show (run migration for guard-wise separation)
        if (isGuard && listErr.message && listErr.message.includes('createdByGuardId')) {
          delete where.createdByGuardId;
          staff = await prisma.staff.findMany({
            where,
            orderBy: { createdAt: 'desc' }
          });
        } else {
          throw listErr;
        }
      }

      const statsWhere = { societyId };
      if (isGuard) statsWhere.createdByGuardId = req.user.id;
      if (role && role !== 'all') statsWhere.role = role.toUpperCase();

      let total, onDuty, onLeave, offDuty;
      try {
        total = await prisma.staff.count({ where: statsWhere });
        onDuty = await prisma.staff.count({ where: { ...statsWhere, status: 'ON_DUTY' } });
        onLeave = await prisma.staff.count({ where: { ...statsWhere, status: 'ON_LEAVE' } });
        offDuty = await prisma.staff.count({ where: { ...statsWhere, status: 'OFF_DUTY' } });
      } catch (statsErr) {
        if (isGuard && statsErr.message && statsErr.message.includes('createdByGuardId')) {
          delete statsWhere.createdByGuardId;
          total = await prisma.staff.count({ where: statsWhere });
          onDuty = await prisma.staff.count({ where: { ...statsWhere, status: 'ON_DUTY' } });
          onLeave = await prisma.staff.count({ where: { ...statsWhere, status: 'ON_LEAVE' } });
          offDuty = await prisma.staff.count({ where: { ...statsWhere, status: 'OFF_DUTY' } });
        } else {
          throw statsErr;
        }
      }

      res.json({
        success: true,
        data: staff,
        stats: {
          total,
          onDuty,
          onLeave,
          vacant: offDuty // Using OFF_DUTY count as vacant/available
        }
      });
    } catch (error) {
      console.error('List staff error:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch staff' });
    }
  },

  // Create new staff
  create: async (req, res) => {
    try {
      const { name, phone, email, shift, gate, role, address, emergencyContact, idProof, idNumber, password, workingDays } = req.body;
      const societyId = req.user.societyId;
      const bcrypt = require('bcryptjs');

      // Hash password (use provided password or default)
      const hashedPassword = await bcrypt.hash(password || 'Guard@123', 10);

      const userEmail = email || `${phone}@staff.local`;

      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email: userEmail }
      });

      let user;
      if (existingUser) {
        // Update existing user instead of creating
        user = await prisma.user.update({
          where: { email: userEmail },
          data: {
            name,
            phone,
            password: hashedPassword,
            role: role === 'GUARD' ? 'GUARD' : 'VENDOR',
          }
        });
      } else {
        // Create User record first (for login capability)
        user = await prisma.user.create({
          data: {
            name,
            email: userEmail,
            phone,
            password: hashedPassword,
            role: role === 'GUARD' ? 'GUARD' : 'VENDOR',
            societyId,
            status: 'ACTIVE',
            addedByUserId: req.user.id
          }
        });
      }

      // Then create Staff record (guard who creates gets createdByGuardId – skip if column missing)
      const staffData = {
        name,
        phone,
        password: hashedPassword,
        email,
        shift,
        gate,
        workingDays,
        role: role || 'GUARD',
        address,
        emergencyContact,
        idProof,
        idNumber,
        societyId,
        status: 'OFF_DUTY',
        attendanceStatus: 'UPCOMING'
      };
      if ((req.user.role || '').toUpperCase() === 'GUARD') staffData.createdByGuardId = req.user.id;

      let staff;
      try {
        staff = await prisma.staff.create({ data: staffData });
      } catch (createErr) {
        const isColumnMissing = createErr.code === 'P2022' || (createErr.meta?.target?.includes('createdByGuardId')) ||
          (createErr.message && (createErr.message.includes('createdByGuardId') || createErr.message.includes("does not exist")));
        if (isColumnMissing && staffData.createdByGuardId != null) {
          delete staffData.createdByGuardId;
          staff = await prisma.staff.create({ data: staffData });
        } else {
          throw createErr;
        }
      }

      // Remove password from response
      const { password: _, ...staffResponse } = staff;
      res.status(201).json({
        success: true,
        data: staffResponse,
        loginCredentials: {
          email: user.email,
          message: 'Helper can now login with this email and the password provided'
        }
      });
    } catch (error) {
      console.error('Create staff error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to create staff',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  },

  // Update staff details (Guard: only staff they created)
  update: async (req, res) => {
    try {
      const { id } = req.params;
      const data = req.body;
      let existing;
      try {
        existing = await prisma.staff.findUnique({ where: { id: parseInt(id) } });
      } catch (findErr) {
        if (findErr.message && findErr.message.includes('createdByGuardId')) {
          existing = await prisma.staff.findUnique({ where: { id: parseInt(id) }, select: { id: true, societyId: true } });
          if (existing) existing.createdByGuardId = null;
        } else throw findErr;
      }
      if (!existing) return res.status(404).json({ success: false, error: 'Staff not found' });
      if (req.user.societyId && existing.societyId !== req.user.societyId) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }
      if ((req.user.role || '').toUpperCase() === 'GUARD' && existing.createdByGuardId != null && existing.createdByGuardId !== req.user.id) {
        return res.status(403).json({ success: false, error: 'You can only update helpers you created' });
      }

      const staff = await prisma.staff.update({
        where: { id: parseInt(id) },
        data
      });

      res.json({ success: true, data: staff });
    } catch (error) {
      console.error('Update staff error:', error);
      res.status(500).json({ success: false, error: 'Failed to update staff' });
    }
  },

  // Delete staff (Guard: only staff they created)
  delete: async (req, res) => {
    try {
      const { id } = req.params;
      let existing;
      try {
        existing = await prisma.staff.findUnique({ where: { id: parseInt(id) } });
      } catch (findErr) {
        if (findErr.message && findErr.message.includes('createdByGuardId')) {
          existing = await prisma.staff.findUnique({ where: { id: parseInt(id) }, select: { id: true, societyId: true } });
          if (existing) existing.createdByGuardId = null;
        } else throw findErr;
      }
      if (!existing) return res.status(404).json({ success: false, error: 'Staff not found' });
      if (req.user.societyId && existing.societyId !== req.user.societyId) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }
      if ((req.user.role || '').toUpperCase() === 'GUARD' && existing.createdByGuardId != null && existing.createdByGuardId !== req.user.id) {
        return res.status(403).json({ success: false, error: 'You can only delete helpers you created' });
      }
      await prisma.staff.delete({ where: { id: parseInt(id) } });
      res.json({ success: true, message: 'Staff removed successfully' });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to delete staff' });
    }
  }
};

module.exports = StaffController;
