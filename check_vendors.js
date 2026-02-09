const prisma = require('./src/lib/prisma');

async function checkVendors() {
  try {
    const vendors = await prisma.vendor.findMany();
    console.log('Total Vendors:', vendors.length);
    console.log(JSON.stringify(vendors, null, 2));
    
    // Also check users to see societyId assignment
    const users = await prisma.user.findMany({ 
        where: { email: 'admin@society.com' },
        select: { id: true, email: true, role: true, societyId: true }
    });
    console.log('Admin User:', JSON.stringify(users, null, 2));

  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

checkVendors();
