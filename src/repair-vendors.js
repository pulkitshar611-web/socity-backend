const prisma = require('./lib/prisma');
const bcrypt = require('bcryptjs');

async function main() {
  console.log('Starting Vendor Repair...');
  
  // 1. Get all vendors
  const vendors = await prisma.vendor.findMany();
  console.log(`Found ${vendors.length} vendors.`);

  for (const vendor of vendors) {
    if (!vendor.email) {
        console.log(`Skipping vendor ${vendor.name} (no email)`);
        continue;
    }

    // 2. Check if user exists
    const user = await prisma.user.findUnique({
        where: { email: vendor.email }
    });

    if (!user) {
        console.log(`Creating User for Vendor: ${vendor.name} (${vendor.email})`);
        
        try {
            const hashedPassword = await bcrypt.hash('Vendor@123', 10);
            await prisma.user.create({
                data: {
                    name: vendor.name,
                    email: vendor.email,
                    phone: vendor.contact || '',
                    password: hashedPassword,
                    role: 'VENDOR',
                    status: 'ACTIVE',
                    societyId: vendor.societyId
                }
            });
            console.log('  -> Success');
        } catch (e) {
            console.error('  -> Failed:', e.message);
        }
    } else {
        console.log(`User already exists for: ${vendor.name}`);
    }
  }
  console.log('Repair Complete.');
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
