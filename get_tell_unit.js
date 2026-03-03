const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const p = new PrismaClient();

async function run() {
    const unit = await p.unit.findUnique({
        where: { id: 2 },
        include: {
            members: true,
            tenant: true
        }
    });

    fs.writeFileSync('tell_unit_debug.json', JSON.stringify(unit, null, 2));
}

run().finally(() => process.exit(0));
