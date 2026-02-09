const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
    console.log('--- Testing MoveRequest Validation ---');

    // 1. Get a valid unit and society ID
    const unit = await prisma.unit.findFirst();
    if (!unit) {
        console.error('No units found in DB. Please run seed first.');
        return;
    }
    console.log(`Found valid Unit ID: ${unit.id}, Society ID: ${unit.societyId}`);

    // 2. Mock request data (normally from req.body)
    const societyId = unit.societyId;
    const validUnitId = unit.id;
    const invalidUnitId = 9999;

    // Simulate Controller Logic for invalid unit
    console.log('\nTesting Invalid Unit ID (Expected: 404/Error)');
    const foundInvalid = await prisma.unit.findFirst({
        where: { id: invalidUnitId, societyId }
    });
    if (!foundInvalid) {
        console.log(`✅ Success: Unit ${invalidUnitId} correctly not found in society ${societyId}`);
    } else {
        console.error(`❌ Failure: Unit ${invalidUnitId} found!`);
    }

    // Simulate Controller Logic for valid unit and creation
    console.log('\nTesting Valid Unit ID and Creation');
    const foundValid = await prisma.unit.findFirst({
        where: { id: validUnitId, societyId }
    });

    if (foundValid) {
        console.log(`✅ Success: Unit ${validUnitId} found.`);

        try {
            const newRequest = await prisma.moveRequest.create({
                data: {
                    type: 'MOVE_IN',
                    unitId: validUnitId,
                    residentName: 'Test Resident',
                    phone: '1234567890',
                    scheduledDate: new Date(),
                    timeSlot: 'Morning',
                    societyId: societyId
                }
            });
            console.log(`✅ Success: MoveRequest created with ID: ${newRequest.id}`);
        } catch (err) {
            console.error('❌ Failure: Could not create MoveRequest:', err.message);
        }
    } else {
        console.error(`❌ Failure: Unit ${validUnitId} not found!`);
    }
}

test().finally(() => prisma.$disconnect());
