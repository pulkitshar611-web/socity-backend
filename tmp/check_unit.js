const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const unit = await prisma.unit.findUnique({
        where: { id: 2 }
    });
    console.log('Unit 2 details:', unit);
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
