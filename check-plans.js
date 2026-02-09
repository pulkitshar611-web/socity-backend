const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    try {
        const plans = await prisma.billingPlan.findMany();
        console.log('--- ALL PLANS ---');
        plans.forEach((p, i) => {
            console.log(`Plan ${i + 1}: ID=${p.id}, Name="${p.name}", Price=${p.price}, Type=${p.type}, Status=${p.status}`);
        });
    } catch (err) {
        console.error('Error fetching plans:', err);
    } finally {
        await prisma.$disconnect();
    }
}

check();
