const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function inspectVendors() {
    try {
        const total = await prisma.vendor.count();
        const platform = await prisma.vendor.count({ where: { societyId: null } });
        const societal = await prisma.vendor.count({ where: { NOT: { societyId: null } } });
        const distinctSocieties = await prisma.vendor.groupBy({
            by: ['societyId'],
            where: { NOT: { societyId: null } }
        });

        const vendors = await prisma.vendor.findMany({
            select: { id: true, name: true, societyId: true }
        });

        console.log('--- Vendor Inspection ---');
        console.log('Total Vendors:', total);
        console.log('Platform-wide Vendors (societyId is null):', platform);
        console.log('Societal Vendors (societyId is NOT null):', societal);
        console.log('Distinct Societies Connected:', distinctSocieties.length);
        console.log('\nVendor List:');
        vendors.forEach(v => console.log(`ID: ${v.id} | Name: ${v.name} | SocietyID: ${v.societyId}`));
        console.log('-------------------------');
    } catch (error) {
        console.error('Error inspecting vendors:', error);
    } finally {
        await prisma.$disconnect();
    }
}

inspectVendors();
