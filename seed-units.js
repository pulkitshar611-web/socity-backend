const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seedUnits() {
    const societyId = 1;
    const unitsData = [
        { block: 'A', number: '101', floor: 1, type: '2BHK', areaSqFt: 1200, societyId },
        { block: 'A', number: '102', floor: 1, type: '2BHK', areaSqFt: 1200, societyId },
        { block: 'B', number: '101', floor: 1, type: '3BHK', areaSqFt: 1800, societyId },
        { block: 'B', number: '102', floor: 1, type: '3BHK', areaSqFt: 1800, societyId },
    ];

    for (const unit of unitsData) {
        await prisma.unit.upsert({
            where: { societyId_block_number: { societyId, block: unit.block, number: unit.number } },
            update: {},
            create: unit
        });
    }

    console.log('Units seeded/checked successfully.');
}

seedUnits()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
