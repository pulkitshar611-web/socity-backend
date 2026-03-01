const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Deleting id 2...');
    await prisma.maintenanceRule.delete({
        where: { id: 2 }
    });
    console.log('Deleted id 2!');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
