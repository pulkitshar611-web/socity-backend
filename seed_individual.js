const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const email = 'individual@example.com';
  const plainPassword = 'user123';

  console.log(`Checking for user: ${email}...`);

  const user = await prisma.user.findUnique({ where: { email } });

  if (user) {
    console.log('User exists. Checking/Updating role and password...');
    const hashedPassword = await bcrypt.hash(plainPassword, 10);
    await prisma.user.update({
      where: { email },
      data: {
        role: 'INDIVIDUAL',
        password: hashedPassword,
        status: 'ACTIVE'
      }
    });
    console.log('User updated successfully.');
  } else {
    console.log('User does not exist. Creating...');
    const hashedPassword = await bcrypt.hash(plainPassword, 10);
    await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name: 'Demo Individual',
        role: 'INDIVIDUAL',
        status: 'ACTIVE',
        phone: '1234567890'
      }
    });
    console.log('User created successfully.');
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
