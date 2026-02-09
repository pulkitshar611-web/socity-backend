const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkData() {
    try {
        const societies = await prisma.society.count();
        const users = await prisma.user.count();
        const units = await prisma.unit.count();

        console.log('--- Database Stats ---');
        console.log('Societies:', societies);
        console.log('Users:', users);
        console.log('Units:', units);
        console.log('----------------------');
    } catch (error) {
        console.error('Error checking data:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkData();
