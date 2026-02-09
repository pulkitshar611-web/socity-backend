const prisma = require('../lib/prisma');

class GuardDashboardController {
    static async getStats(req, res) {
        try {
            const societyId = req.user.societyId;
            const isGuard = (req.user.role || '').toUpperCase() === 'GUARD';
            const guardId = isGuard ? req.user.id : null;
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Guard: only counts for visitors/parcels this guard checked in or logged
            const [visitorsToday, pendingApprovals, parcelsToDeliver, vehiclesIn] = await Promise.all([
                prisma.visitor.count({
                    where: {
                        societyId,
                        createdAt: { gte: today },
                        ...(isGuard && { checkedInById: guardId })
                    }
                }),
                prisma.visitor.count({
                    where: {
                        societyId,
                        status: 'PENDING',
                        checkedInById: null // Pending = not yet checked in by any guard
                    }
                }),
                prisma.parcel.count({
                    where: {
                        societyId,
                        status: 'PENDING',
                        ...(isGuard && { loggedByGuardId: guardId })
                    }
                }),
                prisma.visitor.count({
                    where: {
                        societyId,
                        status: 'CHECKED_IN',
                        vehicleNo: { not: null, not: '' },
                        ...(isGuard && { checkedInById: guardId })
                    }
                })
            ]);

            res.json({
                visitorsToday,
                pendingApprovals,
                parcelsToDeliver,
                vehiclesIn
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async getActivity(req, res) {
        try {
            const societyId = req.user.societyId;
            const isGuard = (req.user.role || '').toUpperCase() === 'GUARD';
            const guardId = isGuard ? req.user.id : null;

            // Guard: only activity for visitors/parcels/incidents this guard handled (no staff – guard sees only own data)
            const [visitors, parcels, incidents, staff] = await Promise.all([
                prisma.visitor.findMany({
                    where: {
                        societyId,
                        ...(isGuard && { checkedInById: guardId })
                    },
                    take: 5,
                    orderBy: { createdAt: 'desc' },
                    include: { unit: true }
                }),
                prisma.parcel.findMany({
                    where: {
                        societyId,
                        ...(isGuard && { loggedByGuardId: guardId })
                    },
                    take: 5,
                    orderBy: { createdAt: 'desc' },
                    include: { unit: true }
                }),
                prisma.incident.findMany({
                    where: {
                        societyId,
                        ...(isGuard && { reportedById: guardId })
                    },
                    take: 5,
                    orderBy: { createdAt: 'desc' }
                }),
                prisma.staff.findMany({
                    where: {
                        societyId,
                        ...(isGuard && { createdByGuardId: guardId })
                    },
                    take: 5,
                    orderBy: { updatedAt: 'desc' }
                })
            ]);

            const staffList = Array.isArray(staff) ? staff : [];
            // Map to common format
            const activities = [
                ...visitors.map(v => ({
                    id: `visitor-${v.id}`,
                    action: v.status === 'CHECKED_IN' ? 'Visitor Check-in' : v.status === 'APPROVED' ? 'Visitor Approved' : v.status === 'REJECTED' ? 'Visitor Rejected' : 'Visitor Entry',
                    name: v.name,
                    unit: v.unit ? `${v.unit.block}-${v.unit.number}` : 'N/A',
                    time: v.createdAt,
                    status: v.status.toLowerCase()
                })),
                ...parcels.map(p => ({
                    id: `parcel-${p.id}`,
                    action: p.status === 'COLLECTED' ? 'Parcel Delivered' : 'Parcel Received',
                    name: p.courierName,
                    unit: p.unit ? `${p.unit.block}-${p.unit.number}` : 'N/A',
                    time: p.createdAt,
                    status: p.status === 'COLLECTED' ? 'delivered' : 'pending'
                })),
                ...incidents.map(i => ({
                    id: `incident-${i.id}`,
                    action: 'Incident Reported',
                    name: i.title,
                    unit: i.location || 'N/A',
                    time: i.createdAt,
                    status: 'incident'
                })),
                ...staffList.map(s => ({
                    id: `staff-${s.id}`,
                    action: s.status === 'ON_DUTY' ? 'Staff Check-in' : 'Staff Check-out',
                    name: s.name,
                    unit: s.role,
                    time: s.updatedAt,
                    status: s.status === 'ON_DUTY' ? 'checkin' : 'exit'
                }))
            ].sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 10);

            res.json(activities);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = GuardDashboardController;
