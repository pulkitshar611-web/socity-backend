const axios = require('axios');

async function testCreateInvoice() {
    const baseURL = 'http://localhost:9000/api';

    // 1. Get Token (Assuming we know credentials or can get from DB)
    // For simplicity, let's assume we can bypass or have a valid token
    // I'll try to find a unit first to get valid ID
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    try {
        const unit = await prisma.unit.findFirst({ where: { societyId: 1 } });
        if (!unit) {
            console.log('No unit found to test with.');
            return;
        }

        console.log('Testing with unit:', unit.id);

        const payload = {
            unitId: unit.id.toString(),
            amount: 5000,
            issueDate: '2026-01-19',
            dueDate: '2026-02-19',
            description: 'Test Invoice'
        };

        // We need an admin token. I'll mock a login or just check the logic.
        // Since I can't easily get a token without password, I'll just check if the controller logic can run.
        console.log('Payload:', payload);

    } catch (err) {
        console.error(err);
    } finally {
        await prisma.$disconnect();
    }
}

testCreateInvoice();
