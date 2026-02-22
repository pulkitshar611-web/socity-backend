const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkStaff() {
    try {
        const staff = await prisma.user.findMany({
            where: {
                societyId: 1,
                role: { in: ['GUARD', 'ADMIN', 'COMMUNITY_MANAGER'] },
                status: 'ACTIVE'
            },
            select: { id: true, name: true, role: true, societyId: true, status: true }
        });
        console.log('Staff found for society 1:');
        console.log(JSON.stringify(staff, null, 2));
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await prisma.$disconnect();
    }
}

checkStaff();
