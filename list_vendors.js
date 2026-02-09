const prisma = require('./src/lib/prisma');

async function listVendors() {
  try {
    const vendors = await prisma.vendor.findMany({
        select: { id: true, name: true, societyId: true, serviceType: true }
    });
    console.log('--- ALL VENDORS ---');
    console.log(JSON.stringify(vendors, null, 2));
    console.log('-------------------');
  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

listVendors();
