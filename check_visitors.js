const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const p = new PrismaClient();

async function run() {
    const visitors = await p.visitor.findMany({
        where: {
            OR: [
                { residentId: 36, visitingUnitId: { not: 2 } },
                { residentId: 3, visitingUnitId: { not: 1 } },
            ]
        }
    });

    fs.writeFileSync('visitors_cross_linked.json', JSON.stringify(visitors, null, 2));
}

run().finally(() => process.exit(0));
