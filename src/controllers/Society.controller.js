const prisma = require('../lib/prisma');

class SocietyController {
  static async getUnits(req, res) {
    try {
      const societyId = req.user.societyId;
      if (!societyId) return res.json([]);
      const units = await prisma.unit.findMany({
        where: { societyId },
        include: { owner: true, tenant: true }
      });
      res.json(units);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async updateOwnership(req, res) {
    try {
      const { id } = req.params;
      const { ownerId, tenantId } = req.body;
      const existing = await prisma.unit.findUnique({ where: { id: parseInt(id) } });
      if (!existing) return res.status(404).json({ error: 'Unit not found' });
      if (req.user.role !== 'SUPER_ADMIN' && existing.societyId !== req.user.societyId) {
        return res.status(403).json({ error: 'Access denied: unit belongs to another society' });
      }
      const unit = await prisma.unit.update({
        where: { id: parseInt(id) },
        data: { ownerId, tenantId }
      });
      res.json(unit);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async postNotice(req, res) {
    try {
      const { title, content, audience, expiresAt } = req.body;
      const notice = await prisma.notice.create({
        data: {
          title,
          content,
          audience,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          societyId: req.user.societyId
        }
      });
      res.status(201).json(notice);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get Society Members (Residents Directory)
   */
  static async getMembers(req, res) {
    try {
      const { type } = req.query;
      const societyId = req.user.societyId;

      const whereClause = { societyId };
      if (type === 'directory') {
        whereClause.role = 'RESIDENT';
        // Only show users who are either owners or tenants
        whereClause.OR = [
          { ownedUnits: { some: {} } },
          { rentedUnits: { some: {} } }
        ];
      }

      // Privacy: Residents can only see their own data
      if (req.user.role === 'RESIDENT') {
        whereClause.id = req.user.id;
      }

      const members = await prisma.user.findMany({
        where: whereClause,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          status: true,
          profileImg: true,
          createdAt: true,
          ownedUnits: {
            select: {
              id: true, block: true, number: true,
              _count: { select: { members: true, vehicles: true } }
            }
          },
          rentedUnits: {
            select: {
              id: true, block: true, number: true,
              _count: { select: { members: true, vehicles: true } }
            }
          }
        },
        orderBy: { name: 'asc' }
      });

      const formatted = members.map(m => {
        const isOwner = m.ownedUnits.length > 0;
        const isTenant = m.rentedUnits.length > 0;

        // Aggregate counts from all units (usually just one)
        const unitsList = [...m.ownedUnits, ...m.rentedUnits];
        const membersCount = unitsList.reduce((sum, u) => sum + (u._count?.members || 0), 0);
        const vehiclesCount = unitsList.reduce((sum, u) => sum + (u._count?.vehicles || 0), 0);

        return {
          ...m,
          role: isOwner ? 'OWNER' : (isTenant ? 'TENANT' : 'RESIDENT'),
          unit: unitsList[0] || null,
          avatar: m.profileImg,
          familyMembersCount: membersCount,
          vehiclesCount: vehiclesCount
        };
      });

      res.json(formatted);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async addMember(req, res) {
    try {
      const { name, email, phone, role, unitId, status, password: plainPassword } = req.body;
      const societyId = req.user.societyId;
      const bcrypt = require('bcryptjs');

      // Check for duplicate email
      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser) {
        return res.status(400).json({ error: 'Email already registered' });
      }

      const result = await prisma.$transaction(async (tx) => {
        // 1. Create User
        const validRoles = ['RESIDENT', 'ADMIN', 'SUPER_ADMIN', 'GUARD', 'VENDOR', 'ACCOUNTANT'];
        let userRole = role?.toUpperCase() || 'RESIDENT';
        if (!validRoles.includes(userRole)) {
          userRole = 'RESIDENT';
        }

        const passwordToUse = (typeof plainPassword === 'string' && plainPassword.trim().length >= 6)
          ? plainPassword.trim()
          : 'password123';
        const hashedPassword = await bcrypt.hash(passwordToUse, 10);

        // Record who added this user (Admin/Super Admin) – Guard can chat only with creator + residents added by same creator
        const addedByUserId = req.user?.id ?? null;

        const user = await tx.user.create({
          data: {
            name,
            email,
            phone,
            role: userRole,
            status: status?.toUpperCase() || 'ACTIVE',
            password: hashedPassword,
            societyId,
            ...(addedByUserId != null && { addedByUserId }),
          }
        });

        // 2. Link to Unit
        if (unitId) {
          const isTenant = role?.toLowerCase() === 'tenant';
          await tx.unit.update({
            where: { id: parseInt(unitId) },
            data: {
              ownerId: isTenant ? undefined : user.id,
              tenantId: isTenant ? user.id : undefined,
              status: 'OCCUPIED'
            }
          });
        }
        return user;
      });

      res.status(201).json(result);
    } catch (error) {
      console.error('Add Member Error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  static async removeMember(req, res) {
    try {
      const { id } = req.params;
      const memberId = parseInt(id);
      const societyId = req.user.societyId;

      const member = await prisma.user.findUnique({ where: { id: memberId } });
      if (!member) {
        return res.status(404).json({ error: 'Member not found' });
      }
      if (member.societyId !== societyId) {
        return res.status(403).json({ error: 'You can only remove members of your society' });
      }
      if (member.role !== 'RESIDENT') {
        return res.status(403).json({ error: 'Only residents can be removed from this screen' });
      }

      await prisma.$transaction(async (tx) => {
        await tx.userSession.deleteMany({ where: { userId: memberId } });
        await tx.unit.updateMany({
          where: { OR: [{ ownerId: memberId }, { tenantId: memberId }] },
          data: {
            ownerId: null,
            tenantId: null,
            status: 'VACANT'
          }
        });
        await tx.user.delete({ where: { id: memberId } });
      });

      res.json({ message: 'Resident removed successfully' });
    } catch (error) {
      console.error('Remove Member Error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  static async getAllSocieties(req, res) {
    try {
      const societies = await prisma.society.findMany({
        include: {
          _count: {
            select: { units: true, users: true }
          },
          users: {
            where: { role: 'ADMIN' },
            select: { name: true, email: true, phone: true },
            take: 1
          }
        }
      });

      const formattedSocieties = societies.map(s => ({
        id: s.id,
        name: s.name,
        code: s.code,
        status: s.status.toLowerCase(),
        subscriptionPlan: s.subscriptionPlan,
        createdAt: s.createdAt,
        city: s.city,
        state: s.state,
        pincode: s.pincode,
        address: s.address,
        billingPlanId: s.billingPlanId,
        discount: s.discount,
        isPaid: s.isPaid,
        expectedUnits: s.expectedUnits,
        unitsCount: s._count.units,
        usersCount: s._count.users,
        admin: s.users[0] || { name: 'N/A', email: 'N/A', phone: 'N/A' }
      }));

      res.json(formattedSocieties);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async updateSocietyStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const society = await prisma.society.update({
        where: { id: parseInt(id) },
        data: { status: status.toUpperCase() }
      });
      res.json(society);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async createSociety(req, res) {
    try {
      const {
        name,
        address,
        city,
        state,
        pincode,
        units,
        plan,
        billingPlanId,
        adminName,
        adminEmail,
        adminPassword,
        adminPhone,
        discount
      } = req.body;

      // Generate a unique code
      const code = name.toUpperCase().substring(0, 3) + Math.floor(1000 + Math.random() * 9000);

      const bcrypt = require('bcryptjs');
      const hashedPassword = adminPassword ? await bcrypt.hash(adminPassword, 10) : null;

      let subscriptionPlan = (plan && typeof plan === 'string') ? plan.toUpperCase() : 'BASIC';
      if (!['BASIC', 'PROFESSIONAL', 'ENTERPRISE'].includes(subscriptionPlan)) {
        subscriptionPlan = 'BASIC';
      }

      const data = {
        name,
        address,
        city,
        state,
        pincode,
        code,
        status: 'ACTIVE', // Changed from 'PENDING' to 'ACTIVE' as per instruction
        subscriptionPlan,
        expectedUnits: parseInt(units) || 0,
        createdByUserId: req.user?.id ?? null,
        discount: (discount != null && discount !== '') ? (parseFloat(discount) || 0) : 0
      };

      if (billingPlanId != null && billingPlanId !== '') {
        const billingPlan = await prisma.billingPlan.findUnique({
          where: { id: parseInt(billingPlanId) }
        });
        if (billingPlan && billingPlan.status === 'active') {
          data.billingPlanId = billingPlan.id;
          data.subscriptionPlan = billingPlan.planType;
        }
      }

      if (adminEmail && adminName) {
        data.users = {
          create: {
            name: adminName,
            email: adminEmail,
            password: hashedPassword || await bcrypt.hash('password123', 10),
            phone: adminPhone,
            role: 'ADMIN'
          }
        };
      }

      const society = await prisma.society.create({
        data,
        include: {
          users: true
        }
      });

      res.status(201).json(society);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async updateSociety(req, res) {
    try {
      const { id } = req.params;
      const { name, address, city, state, pincode, subscriptionPlan, billingPlanId, discount } = req.body;
      
      const updateData = {
        name,
        address,
        city,
        state,
        pincode,
        subscriptionPlan: subscriptionPlan?.toUpperCase(),
        discount: (discount != null && discount !== '') ? (parseFloat(discount) || 0) : (discount === '' ? 0 : undefined)
      };

      if (billingPlanId != null && billingPlanId !== '') {
        const bpId = parseInt(billingPlanId);
        const billingPlan = await prisma.billingPlan.findUnique({
          where: { id: bpId }
        });
        if (billingPlan) {
          updateData.billingPlanId = bpId;
          updateData.subscriptionPlan = billingPlan.planType;
        }
      }

      const society = await prisma.society.update({
        where: { id: parseInt(id) },
        data: updateData
      });
      res.json(society);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async deleteSociety(req, res) {
    try {
      const { id } = req.params;
      const societyId = parseInt(id);

      await prisma.$transaction(async (tx) => {
        // 1. Delete platform invoices
        await tx.platformInvoice.deleteMany({ where: { societyId } });

        // 2. Delete related complaints (and comments)
        const complaintIds = (await tx.complaint.findMany({
          where: { societyId },
          select: { id: true }
        })).map(c => c.id);

        await tx.complaintComment.deleteMany({ where: { complaintId: { in: complaintIds } } });
        await tx.complaint.deleteMany({ where: { societyId } });

        // 3. Delete visitors
        await tx.visitor.deleteMany({ where: { societyId } });

        // 4. Delete transactions
        await tx.transaction.deleteMany({ where: { societyId } });

        // 5. Delete notices
        await tx.notice.deleteMany({ where: { societyId } });

        // 6. Delete Amenity bookings and Amenities
        const amenityIds = (await tx.amenity.findMany({
          where: { societyId },
          select: { id: true }
        })).map(a => a.id);

        await tx.amenityBooking.deleteMany({ where: { amenityId: { in: amenityIds } } });
        await tx.amenity.deleteMany({ where: { societyId } });

        // 7. Delete parking slots
        await tx.parkingSlot.deleteMany({ where: { societyId } });

        // 8. Delete units
        await tx.unit.deleteMany({ where: { societyId } });

        // 9. Unlink or delete vendors
        await tx.vendor.deleteMany({ where: { societyId } });

        // 10. Delete User sessions and Users
        const userIds = (await tx.user.findMany({
          where: { societyId },
          select: { id: true }
        })).map(u => u.id);

        await tx.userSession.deleteMany({ where: { userId: { in: userIds } } });
        await tx.user.deleteMany({ where: { societyId } });

        // 11. Finally delete the society
        await tx.society.delete({
          where: { id: societyId }
        });
      });

      res.json({ message: 'Society and all related data deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getStats(req, res) {
    try {
      const stats = await prisma.society.groupBy({
        by: ['status'],
        _count: true
      });

      const formattedStats = {
        ACTIVE: 0,
        PENDING: 0,
        INACTIVE: 0
      };

      stats.forEach(item => {
        formattedStats[item.status] = item._count;
      });

      res.json(formattedStats);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get Admin Dashboard Statistics
   * Aggregated data for the main Admin Dashboard overview.
   * Only for society-scoped users (ADMIN/COMMITTEE). SUPER_ADMIN must use super-admin dashboard.
   */
  static async getAdminDashboardStats(req, res) {
    try {
      const societyId = req.user.societyId ?? (req.query.societyId ? parseInt(req.query.societyId) : null);
      if (!societyId) {
        return res.status(400).json({ error: 'Society context required. This dashboard is for society admins only.' });
      }
      const society = await prisma.society.findUnique({ where: { id: societyId } });
      if (!society && req.user.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Society not found or access denied' });
      }

      // ========== USER COUNTS ==========
      const [totalUsers, activeUsers, inactiveUsers, pendingUsers, owners, tenants, staff, totalResidentUsers, totalFamilyMembers] = await Promise.all([
        prisma.user.count({ where: { societyId } }),
        prisma.user.count({ where: { societyId, status: 'ACTIVE' } }),
        prisma.user.count({ where: { societyId, status: 'SUSPENDED' } }),
        prisma.user.count({ where: { societyId, status: 'PENDING' } }),
        prisma.user.count({ where: { societyId, ownedUnits: { some: {} } } }),
        prisma.user.count({ where: { societyId, rentedUnits: { some: {} } } }),
        prisma.user.count({ where: { societyId, role: { in: ['GUARD', 'VENDOR', 'ACCOUNTANT'] } } }),
        prisma.user.count({
          where: {
            societyId,
            role: 'RESIDENT',
            OR: [
              { ownedUnits: { some: {} } },
              { rentedUnits: { some: {} } }
            ]
          }
        }),
        prisma.unitMember.count({ where: { unit: { societyId } } }),
      ]);

      // ========== UNIT COUNTS ==========
      const units = await prisma.unit.findMany({
        where: { societyId },
        select: { id: true, ownerId: true, tenantId: true }
      });
      const totalUnits = units.length;
      const occupiedUnits = units.filter(u => u.ownerId || u.tenantId).length;
      const vacantUnits = totalUnits - occupiedUnits;

      // ========== FINANCIAL DATA ==========
      const transactions = await prisma.transaction.findMany({
        where: { societyId },
        select: { amount: true, type: true, status: true, createdAt: true, category: true, receivedFrom: true }
      });

      const currentMonth = new Date().getMonth();
      const currentYear = new Date().getFullYear();

      // Total revenue (all income)
      const totalRevenue = transactions
        .filter(t => t.type === 'INCOME')
        .reduce((sum, t) => sum + t.amount, 0);

      // Pending dues
      const pendingDues = transactions
        .filter(t => t.status === 'PENDING')
        .reduce((sum, t) => sum + t.amount, 0);

      // Collected this month
      const collectedThisMonth = transactions
        .filter(t => {
          const d = new Date(t.createdAt);
          return t.type === 'INCOME' && t.status === 'PAID' &&
            d.getMonth() === currentMonth && d.getFullYear() === currentYear;
        })
        .reduce((sum, t) => sum + t.amount, 0);

      // Total expenses
      const totalExpenses = transactions
        .filter(t => t.type === 'EXPENSE')
        .reduce((sum, t) => sum + t.amount, 0);

      // Parking income
      const parkingIncome = transactions
        .filter(t => t.type === 'INCOME' && t.category.toUpperCase() === 'PARKING' && t.status === 'PAID')
        .reduce((sum, t) => sum + t.amount, 0);

      // Amenity income
      const amenityIncome = transactions
        .filter(t => t.type === 'INCOME' && t.category.toUpperCase() === 'AMENITY' && t.status === 'PAID')
        .reduce((sum, t) => sum + t.amount, 0);

      // Pending vendor payments (Expences Pending)
      const pendingVendorPayments = transactions
        .filter(t => t.type === 'EXPENSE' && t.status === 'PENDING')
        .reduce((sum, t) => sum + t.amount, 0);

      // Late fees (calculated as a subset of pending income or specific category)
      const lateFees = transactions
        .filter(t => t.type === 'INCOME' && t.category.toUpperCase() === 'LATE_FEE')
        .reduce((sum, t) => sum + t.amount, 0);

      // Monthly income data (last 3 months)
      const monthlyIncome = [];
      for (let i = 2; i >= 0; i--) {
        const targetDate = new Date();
        targetDate.setMonth(targetDate.getMonth() - i);
        const month = targetDate.toLocaleString('default', { month: 'short' });
        const monthNum = targetDate.getMonth();
        const year = targetDate.getFullYear();

        const amount = transactions
          .filter(t => {
            const d = new Date(t.createdAt);
            return t.type === 'INCOME' && d.getMonth() === monthNum && d.getFullYear() === year;
          })
          .reduce((sum, t) => sum + t.amount, 0);

        monthlyIncome.push({ month, amount });
      }

      // ========== ACTIVITY COUNTS ==========
      const [
        openComplaints,
        pendingVisitors,
        upcomingMeetings,
        activeVendors,
        todayVisitors,
        openPurchaseRequests,
        unfinalizedPurchaseRequests,
        escalatedComplaints
      ] = await Promise.all([
        prisma.complaint.count({ where: { societyId, status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
        prisma.visitor.count({ where: { societyId, status: 'PENDING' } }),
        prisma.meeting.count({ where: { societyId, status: 'SCHEDULED', date: { gte: new Date() } } }),
        prisma.vendor.count({ where: { societyId, status: 'ACTIVE' } }),
        prisma.visitor.count({
          where: {
            societyId,
            createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) }
          }
        }),
        prisma.purchaseRequest.count({ where: { societyId, status: 'PENDING' } }),
        prisma.purchaseRequest.count({ where: { societyId, status: 'REJECTED' } }), // Mapping Rejected as "Unfinalized" for now
        prisma.complaint.count({ where: { societyId, status: 'OPEN', escalatedToTech: true } }),
      ]);

      // ========== DEFAULTERS ==========
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const defaultersList = await prisma.transaction.findMany({
        where: {
          societyId,
          status: 'PENDING',
          createdAt: { lt: thirtyDaysAgo }
        },
        select: {
          receivedFrom: true,
          amount: true,
          category: true,
          createdAt: true
        },
        orderBy: { amount: 'desc' },
        take: 10
      });

      // ========== RECENT ACTIVITIES ==========
      const recentActivities = [];

      // Recent payments
      const recentPayments = await prisma.transaction.findMany({
        where: { societyId, type: 'INCOME', status: 'PAID' },
        orderBy: { createdAt: 'desc' },
        take: 3,
        select: { receivedFrom: true, amount: true, createdAt: true, category: true }
      });
      recentPayments.forEach(p => {
        recentActivities.push({
          type: 'payment',
          user: p.receivedFrom || 'Unknown',
          action: `Paid ${p.category} of Rs. ${p.amount.toLocaleString()}`,
          time: p.createdAt,
          status: 'success'
        });
      });

      // Recent complaints
      const recentComplaints = await prisma.complaint.findMany({
        where: { societyId },
        orderBy: { createdAt: 'desc' },
        take: 2,
        include: { reportedBy: { select: { name: true } } }
      });
      recentComplaints.forEach(c => {
        recentActivities.push({
          type: 'complaint',
          user: c.reportedBy?.name || 'Unknown',
          action: `Reported ${c.title} - ${c.priority} Priority`,
          time: c.createdAt,
          status: 'warning'
        });
      });

      // Sort by time
      recentActivities.sort((a, b) => new Date(b.time) - new Date(a.time));

      const now = new Date();
      const firstDayOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      res.json({
        societyName: society?.name || 'Your Community',
        users: {
          total: totalUsers,
          active: activeUsers,
          inactive: inactiveUsers,
          pending: pendingUsers,
          owners,
          tenants,
          staff,
          totalResidents: totalResidentUsers + totalFamilyMembers,
        },
        units: {
          total: totalUnits,
          occupied: occupiedUnits,
          vacant: vacantUnits,
        },
        finance: {
          totalRevenue,
          pendingDues,
          collectedThisMonth,
          totalExpenses,
          defaultersCount: defaultersList.length,
          monthlyIncome,
          incomePeriod: {
            start: firstDayOfCurrentMonth,
            end: now
          },
          parkingIncome,
          amenityIncome,
          pendingVendorPayments,
          lateFees,
        },
        activity: {
          openComplaints,
          pendingVisitors,
          upcomingMeetings,
          activeVendors,
          todayVisitors,
          openPurchaseRequests,
          unfinalizedPurchaseRequests,
          escalatedComplaints,
        },
        defaulters: defaultersList,
        recentActivities: recentActivities.slice(0, 5),
      });

    } catch (error) {
      console.error('Admin Dashboard Stats Error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // ========== GUIDELINES MANAGEMENT (Super Admin) ==========

  static async getGuidelines(req, res) {
    try {
      const { societyId } = req.query;
      
      // If societyId is provided, fetch specific + global.
      // If not provided (Super Admin view all), fetch all (or we could default to global only, but usually Super Admin wants all).
      // However, for Society Admin (who sends their ID), we want THEIR guidelines + GLOBAL guidelines.
      
      let where = {};
      if (societyId) {
          where = {
            OR: [
                { societyId: parseInt(societyId) },
                { societyId: null }
            ]
          };
      }
      
      const guidelines = await prisma.communityGuideline.findMany({
        where,
        include: {
          society: {
            select: { id: true, name: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      res.json(guidelines);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getGuidelinesForMe(req, res) {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: 'Unauthorized' });

      const role = (user.role || '').toUpperCase();
      const societyId = user.societyId ? parseInt(user.societyId) : null;

      const audienceForRole = {
        ADMIN: ['ALL', 'ADMINS'],
        RESIDENT: ['ALL', 'RESIDENTS'],
        INDIVIDUAL: ['ALL', 'INDIVIDUALS'],
        VENDOR: ['ALL', 'VENDORS'],
        SUPER_ADMIN: ['ALL', 'ADMINS', 'RESIDENTS', 'INDIVIDUALS', 'VENDORS'],
      };
      const allowedAudiences = audienceForRole[role] || ['ALL'];

      // Include null targetAudience (legacy rows) as "ALL"
      const audienceOrNull = [...allowedAudiences.map((a) => ({ targetAudience: a })), { targetAudience: null }];

      let where = { OR: audienceOrNull };

      if (role === 'ADMIN' || role === 'RESIDENT') {
        where = {
          AND: [
            { OR: societyId != null ? [{ societyId }, { societyId: null }] : [{ societyId: null }] },
            { OR: audienceOrNull }
          ]
        };
      } else if (role === 'INDIVIDUAL') {
        where = {
          AND: [
            { societyId: null },
            { OR: audienceOrNull }
          ]
        };
      }
      // VENDOR, SUPER_ADMIN: any society or global, filtered by audience

      const guidelines = await prisma.communityGuideline.findMany({
        where,
        include: {
          society: { select: { id: true, name: true } }
        },
        orderBy: { createdAt: 'desc' }
      });

      res.json(guidelines);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async createGuideline(req, res) {
    try {
      const { societyId, title, content, category, targetAudience } = req.body;

      // Allow null societyId for global guidelines (only if Super Admin presumably, but enforcing data validity here)
      // If societyId is NOT provided or is null, it's global.
      if (!title || !content || !category) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const audience = (targetAudience || 'ALL').toUpperCase();
      const guideline = await prisma.communityGuideline.create({
        data: {
          societyId: societyId ? parseInt(societyId) : null,
          title,
          content,
          category: category.toUpperCase(),
          targetAudience: ['ALL', 'RESIDENTS', 'ADMINS', 'INDIVIDUALS', 'VENDORS'].includes(audience) ? audience : 'ALL'
        },
        include: {
          society: {
            select: { id: true, name: true }
          }
        }
      });

      res.status(201).json(guideline);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async updateGuideline(req, res) {
    try {
      const { id } = req.params;
      const { title, content, category, targetAudience } = req.body;

      const data = { title, content, category: (category || '').toUpperCase() };
      if (targetAudience != null) {
        const a = (targetAudience || 'ALL').toUpperCase();
        data.targetAudience = ['ALL', 'RESIDENTS', 'ADMINS', 'INDIVIDUALS', 'VENDORS'].includes(a) ? a : 'ALL';
      }

      const guideline = await prisma.communityGuideline.update({
        where: { id: parseInt(id) },
        data,
        include: {
          society: {
            select: { id: true, name: true }
          }
        }
      });

      res.json(guideline);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async deleteGuideline(req, res) {
    try {
      const { id } = req.params;

      await prisma.communityGuideline.delete({
        where: { id: parseInt(id) }
      });

      res.json({ message: 'Guideline deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async processSocietyPayment(req, res) {
    try {
      const { id } = req.params;
      const societyId = parseInt(id);

      const society = await prisma.society.update({
        where: { id: societyId },
        data: { isPaid: true },
        include: { 
          users: { where: { role: 'ADMIN' }, take: 1 },
          billingPlan: true
        }
      });

      // 0. Generate Invoice
      let invoice;
      try {
        const originalPrice = society.billingPlan?.price || 0;
        const discount = society.discount || 0;
        const finalPrice = Math.round(originalPrice * (1 - discount / 100));

        invoice = await prisma.platformInvoice.create({
          data: {
            societyId: society.id,
            invoiceNo: `INV-${society.id}-${Date.now().toString().slice(-6)}`,
            amount: finalPrice,
            status: 'PAID',
            dueDate: new Date(),
            paidDate: new Date()
          }
        });
      } catch (invErr) {
        console.error('Invoice Generation Error:', invErr.message);
      }

      // 1. Notify Super Admins
      try {
        const superAdmins = await prisma.user.findMany({
          where: { role: 'SUPER_ADMIN' },
          select: { id: true }
        });

        for (const sa of superAdmins) {
          await prisma.notification.create({
            data: {
              userId: sa.id,
              title: 'Society Activated',
              description: `Society "${society.name}" has successfully activated their dashboard.`,
              type: 'society_activation',
              metadata: invoice ? { invoiceId: invoice.id } : null
            }
          });
        }
      } catch (notifErr) {
        console.error('Super Admin Notification Error:', notifErr.message);
      }

      // 2. Notify Society Admin (Welcome)
      try {
        const societyAdmin = society.users[0];
        if (societyAdmin) {
          await prisma.notification.create({
            data: {
              userId: societyAdmin.id,
              title: 'Welcome to Socity!',
              description: `Your dashboard for "${society.name}" is now active. You can start managing your community now! Click to view your invoice.`,
              type: 'welcome',
              metadata: invoice ? { invoiceId: invoice.id } : null
            }
          });
        }
      } catch (notifErr) {
        console.error('Society Admin Notification Error:', notifErr.message);
      }

      res.json({
        message: 'Payment processed successfully',
        society
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = SocietyController;
