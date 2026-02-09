const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
    console.log('--- Testing Enhanced Unit Lookup ---');

    // Get a valid unit
    const unit = await prisma.unit.findFirst();
    if (!unit) {
        console.error('No units found. Please seed the DB.');
        return;
    }

    const societyId = unit.societyId;
    const unitNumber = unit.number;
    const unitId = unit.id;

    console.log(`Original Unit: ID=${unitId}, Number=${unitNumber}, Society=${societyId}`);

    // Mock lookup logic
    const lookup = async (identifier) => {
        let found = null;
        const numericId = parseInt(identifier);
        if (!isNaN(numericId)) {
            found = await prisma.unit.findFirst({ where: { id: numericId, societyId } });
        }
        if (!found) {
            found = await prisma.unit.findFirst({ where: { number: identifier.toString(), societyId } });
        }
        return found;
    };

    // Test 1: ID lookup
    const byId = await lookup(unitId);
    console.log(`Test ID ${unitId}: ${byId ? '✅ Found' : '❌ Not Found'}`);

    // Test 2: Number lookup
    const byNumber = await lookup(unitNumber);
    console.log(`Test Number "${unitNumber}": ${byNumber ? '✅ Found' : '❌ Not Found'}`);

    // Test 3: Invalid
    const byInvalid = await lookup("999-NON-EXISTENT");
    console.log(`Test Invalid: ${byInvalid ? '❌ Found (Wrong!)' : '✅ Not Found'}`);
}

test().finally(() => prisma.$disconnect());
