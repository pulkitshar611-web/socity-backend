const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const user = await prisma.user.findUnique({
        where: { email: 'tell@gmail.com' },
        include: {
            ownedUnits: true,
            rentedUnits: true
        }
    });

    if (!user) {
        console.log('User not found');
        return;
    }

    console.log('User ID:', user.id);
    console.log('User Role:', user.role);
    console.log('Society ID:', user.societyId);

    const units = [...user.ownedUnits, ...user.rentedUnits];
    const unitIds = units.map(u => u.id);
    console.log('Associated Unit IDs:', unitIds);

    const memberships = await prisma.unitMember.findMany({
        where: { email: user.email }
    });
    console.log('Unit Memberships (by email):', memberships.map(m => m.unitId));
    const membershipUnitIds = memberships.map(m => m.unitId);

    const allRelevantUnitIds = [...new Set([...unitIds, ...membershipUnitIds])];
    console.log('All Relevant Unit IDs:', allRelevantUnitIds);

    const visitors = await prisma.visitor.findMany({
        where: {
            OR: [
                { residentId: user.id },
                { visitingUnitId: { in: allRelevantUnitIds } }
            ]
        },
        include: {
            unit: true
        }
    });

    console.log('Total Visitors Found:', visitors.length);
    visitors.forEach(v => {
        console.log(`ID: ${v.id}, Name: ${v.name}, Status: ${v.status}, Unit: ${v.visitingUnitId}, ResidentID: ${v.residentId}`);
    });
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
