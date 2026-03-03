const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const p = new PrismaClient();

async function run() {
    const visitors = await p.visitor.findMany({
        where: {
            AND: [
                { societyId: 1 },
                {
                    OR: [
                        { residentId: 3 },
                        {
                            unit: {
                                OR: [
                                    { ownerId: 3 },
                                    { tenantId: 3 },
                                    { members: { some: { email: 'resident1@society.com' } } }
                                ]
                            }
                        }
                    ]
                }
            ]
        },
        include: {
            unit: true
        }
    });

    const res = visitors.map(v => ({
        id: v.id,
        name: v.name,
        visitingUnitId: v.visitingUnitId,
        residentId: v.residentId,
        unitNo: v.unit?.number
    }));

    fs.writeFileSync('john_doe_visitors_debug.json', JSON.stringify(res, null, 2));
}

run().finally(() => process.exit(0));
