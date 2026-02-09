const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkAdmin() {
  try {
    const admin = await prisma.user.findUnique({
      where: { email: 'superadmin@society.com' }
    });
    console.log('--- Super Admin Info ---');
    console.log('Name:', admin.name);
    console.log('Role:', admin.role);
    console.log('SocietyID:', admin.societyId);
    console.log('------------------------');
  } catch (error) {
    console.error('Error checking admin:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAdmin();
