const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function dump() {
    try {
        const guidelines = await prisma.communityGuideline.findMany();
        console.log('--- GUIDELINES ---');
        console.log(JSON.stringify(guidelines, null, 2));
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await prisma.$disconnect();
    }
}

dump();
