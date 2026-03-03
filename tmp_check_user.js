const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    const user = await prisma.user.findUnique({ where: { id: 36 } });
    console.log('User 36:', JSON.stringify(user, null, 2));
}
main().finally(() => prisma.$disconnect());
