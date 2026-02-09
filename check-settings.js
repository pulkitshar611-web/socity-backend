const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    try {
        const s = await prisma.systemSetting.findMany();
        console.log('--- SETTINGS ---');
        console.log(JSON.stringify(s, null, 2));
    } catch (err) {
        console.error('Error fetching settings:', err);
    } finally {
        await prisma.$disconnect();
    }
}

check();
