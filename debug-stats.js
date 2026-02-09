const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const societyId = 1;
    try {
        console.log('--- USER COUNTS ---');
        const [totalUsers, activeUsers, inactiveUsers, pendingUsers, owners, tenants, staff, neverLoggedIn] = await Promise.all([
            prisma.user.count({ where: { societyId } }),
            prisma.user.count({ where: { societyId, status: 'ACTIVE' } }),
            prisma.user.count({ where: { societyId, status: 'SUSPENDED' } }),
            prisma.user.count({ where: { societyId, status: 'PENDING' } }),
            prisma.user.count({ where: { societyId, ownedUnits: { some: {} } } }),
            prisma.user.count({ where: { societyId, rentedUnits: { some: {} } } }),
            prisma.user.count({ where: { societyId, role: { in: ['GUARD', 'VENDOR', 'ACCOUNTANT'] } } }),
            prisma.user.count({ where: { societyId, sessions: { none: {} } } }),
        ]);
        console.log({ totalUsers, activeUsers, inactiveUsers, pendingUsers, owners, tenants, staff, neverLoggedIn });

        console.log('--- UNIT COUNTS ---');
        const units = await prisma.unit.findMany({
            where: { societyId },
            select: { id: true, ownerId: true, tenantId: true }
        });
        console.log('Units found:', units.length);

        console.log('--- FINANCIAL DATA ---');
        const transactions = await prisma.transaction.findMany({
            where: { societyId },
            select: { amount: true, type: true, status: true, createdAt: true, category: true, receivedFrom: true }
        });
        console.log('Transactions found:', transactions.length);

        console.log('--- ACTIVITY COUNTS ---');
        const [openComplaints, pendingVisitors, upcomingMeetings, activeVendors, todayVisitors, openPurchaseRequests, unfinalizedPurchaseRequests] = await Promise.all([
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
            prisma.purchaseRequest.count({ where: { societyId, status: 'REJECTED' } }),
        ]);
        console.log({ openComplaints, pendingVisitors, upcomingMeetings, activeVendors, todayVisitors, openPurchaseRequests, unfinalizedPurchaseRequests });

        console.log('Logic completed successfully!');
    } catch (err) {
        console.error('Logic failed:', err);
    }
}

main().finally(() => prisma.$disconnect());
