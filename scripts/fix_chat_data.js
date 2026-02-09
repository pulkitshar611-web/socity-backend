const { PrismaClient } = require('@prisma/client');
try { require('dotenv').config(); } catch (e) { console.log("dotenv not loaded"); }
const prisma = new PrismaClient();

async function main() {
  console.log("Starting user adoption process...");
  
  // Find all societies and their admins
  const societies = await prisma.society.findMany({
    include: {
      users: {
        where: { role: 'ADMIN' },
        orderBy: { createdAt: 'asc' }
      }
    }
  });

  for (const society of societies) {
    if (society.users.length === 0) {
      console.log(`Society ${society.name} (ID: ${society.id}): No Admin found. Skipping.`);
      continue;
    }

    const mainAdmin = society.users[0];
    console.log(`Society ${society.name}: Adopting users to Admin ${mainAdmin.name} (ID: ${mainAdmin.id})`);

    // Assign orphans to this admin
    const result = await prisma.user.updateMany({
      where: {
        societyId: society.id,
        role: { in: ['RESIDENT', 'GUARD', 'ACCOUNTANT', 'COMMITTEE', 'VENDOR'] },
        addedByUserId: null,
        id: { not: mainAdmin.id }
      },
      data: {
        addedByUserId: mainAdmin.id
      }
    });

    console.log(`  -> Linked ${result.count} existing users to Admin ${mainAdmin.name}.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
