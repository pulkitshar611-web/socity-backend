const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkVisitorNotifs() {
    try {
        // Check for visitor notifications
        const notifs = await prisma.notification.findMany({
            where: { type: 'visitor' },
            orderBy: { createdAt: 'desc' },
            take: 10,
            include: {
                user: { select: { name: true, role: true } }
            }
        });
        console.log('Visitor notifications:');
        console.log(JSON.stringify(notifs, null, 2));

        // Check also for visitor 19 (saif) specifically
        const visitor19 = await prisma.visitor.findUnique({
            where: { id: 19 },
            include: { gate: true }
        });
        console.log('\nVisitor 19 (saif) data:');
        console.log(JSON.stringify(visitor19, null, 2));
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await prisma.$disconnect();
    }
}

checkVisitorNotifs();
