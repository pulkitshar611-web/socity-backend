const prisma = require('../lib/prisma');

class ReportController {
  static async getPlatformStats(req, res) {
    try {
      const now = new Date();

      // 1. Overview Stats (real counts)
      const totalSocieties = await prisma.society.count();
      const activeSocieties = await prisma.society.count({ where: { status: 'ACTIVE' } });
      const totalUsers = await prisma.user.count();
      const totalUnits = await prisma.unit.count();

      // Life-time Total Revenue
      const lifeTimePaid = await prisma.platformInvoice.aggregate({
        where: { status: 'PAID' },
        _sum: { amount: true }
      });
      const totalRevenue = Number(lifeTimePaid._sum?.amount ?? 0);

      const overview = {
        totalRevenue: `₹${totalRevenue.toLocaleString()}`,
        revenueChange: '+0%', // Placeholder for now
        activeSocieties: activeSocieties,
        societiesChange: '+2',
        totalUsers,
        totalUnits,
        avgEngagement: '82%'
      };

      // 2. Growth Data (last 6 months)
      const growthData = [];
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const startOfMonth = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);

        const newSocieties = await prisma.society.count({
          where: { createdAt: { gte: startOfMonth, lte: endOfMonth } }
        });

        growthData.push({
          month: months[d.getMonth()],
          newSocieties,
          churned: 0
        });
      }

      // 3. Plan Distribution & Revenue
      const plans = ['BASIC', 'PROFESSIONAL', 'ENTERPRISE'];
      const revenueByPlan = [];
      
      for (const plan of plans) {
        const societiesInPlan = await prisma.society.findMany({
          where: { subscriptionPlan: plan },
          select: { id: true }
        });
        const societyIds = societiesInPlan.map(s => s.id);
        
        const planRevenue = await prisma.platformInvoice.aggregate({
          where: {
            status: 'PAID',
            societyId: { in: societyIds }
          },
          _sum: { amount: true }
        });

        const amount = Number(planRevenue._sum?.amount ?? 0);
        revenueByPlan.push({
          plan: plan === 'BASIC' ? 'Basic' : plan === 'PROFESSIONAL' ? 'Professional' : 'Enterprise',
          societies: societiesInPlan.length,
          revenue: `₹${amount.toLocaleString()}`,
          percentage: totalRevenue > 0 ? Math.round((amount / totalRevenue) * 100) : 0
        });
      }

      // 4. Monthly revenue from PlatformInvoice (PAID, current month)
      const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const paidThisMonth = await prisma.platformInvoice.aggregate({
        where: {
          status: 'PAID',
          OR: [
            { paidDate: { gte: startOfCurrentMonth, lte: endOfCurrentMonth } },
            { paidDate: null, issueDate: { gte: startOfCurrentMonth, lte: endOfCurrentMonth } }
          ]
        },
        _sum: { amount: true }
      });
      const monthlyRevenue = Number(paidThisMonth._sum?.amount ?? 0);

      // 5. Revenue by month (last 6 months) for chart
      const revenueData = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const startOfMonth = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
        const sum = await prisma.platformInvoice.aggregate({
          where: {
            status: 'PAID',
            OR: [
              { paidDate: { gte: startOfMonth, lte: endOfMonth } },
              { paidDate: null, issueDate: { gte: startOfMonth, lte: endOfMonth } }
            ]
          },
          _sum: { amount: true }
        });
        revenueData.push({
          month: months[d.getMonth()],
          revenue: Number(sum._sum?.amount ?? 0)
        });
      }

      // 6. Recent Societies
      const recentSocietiesList = await prisma.society.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { _count: { select: { units: true } } }
      });
      const recentSocieties = recentSocietiesList.map(s => ({
        id: s.id,
        name: s.name,
        city: s.city || '—',
        units: s._count?.units ?? s.expectedUnits ?? 0,
        status: (s.status || '').toLowerCase(),
        joinedDate: s.createdAt ? new Date(s.createdAt).toLocaleDateString() : '—'
      }));

      // 7. Top Performing Societies
      const topSocietiesList = await prisma.society.findMany({
        include: { 
          _count: { select: { users: true } }
        },
        take: 5
      });

      const topSocieties = await Promise.all(topSocietiesList.map(async s => {
        const sRev = await prisma.platformInvoice.aggregate({
          where: { societyId: s.id, status: 'PAID' },
          _sum: { amount: true }
        });
        return {
          name: s.name,
          users: s._count?.users || 0,
          revenue: `₹${Number(sRev._sum?.amount ?? 0).toLocaleString()}`
        };
      }));

      res.json({
        overview,
        growthData,
        revenueByPlan,
        topSocieties,
        platformStats: {
          totalSocieties,
          activeSocieties,
          totalUsers,
          totalUnits,
          monthlyRevenue,
        },
        revenueData,
        recentSocieties,
        totalMRR: monthlyRevenue
      });
    } catch (error) {
      console.error('Platform Stats Error:', error);
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = ReportController;
