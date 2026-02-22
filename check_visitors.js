const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkVisitors() {
    try {
        const visitors = await prisma.visitor.findMany({
            orderBy: { createdAt: 'desc' },
            take: 5,
            select: { id: true, name: true, societyId: true, createdAt: true }
        });
        console.log('Last 5 visitors:');
        console.log(JSON.stringify(visitors, null, 2));
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await prisma.$disconnect();
    }
}

checkVisitors();
