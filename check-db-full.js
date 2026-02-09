const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const units = await prisma.unit.findMany();
        console.log('Units count:', units.length);
        console.log('Units:', JSON.stringify(units, null, 2));
        
        const societies = await prisma.society.findMany();
        console.log('Societies:', JSON.stringify(societies, null, 2));

        const users = await prisma.user.findMany({ select: { id: true, email: true, role: true, societyId: true } });
        console.log('Users:', JSON.stringify(users, null, 2));
    } catch (error) {
        console.error('Check failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
