const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkNotifications() {
    try {
        const notifications = await prisma.notification.findMany({
            orderBy: { createdAt: 'desc' },
            take: 10,
            include: {
                user: { select: { name: true, role: true } }
            }
        });
        console.log('Last 10 notifications:');
        console.log(JSON.stringify(notifications, null, 2));
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await prisma.$disconnect();
    }
}

checkNotifications();
