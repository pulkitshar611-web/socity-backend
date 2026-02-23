const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Get full billing config
const getConfig = async (req, res) => {
    try {
        const societyId = req.user.societyId;

        const [maintenanceRules, chargeMaster, lateFeeConfig] = await Promise.all([
            prisma.maintenanceRule.findMany({ where: { societyId }, orderBy: { createdAt: 'asc' } }),
            prisma.chargeMaster.findMany({ where: { societyId }, orderBy: { createdAt: 'asc' } }),
            prisma.lateFeeConfig.findUnique({ where: { societyId } })
        ]);

        return res.json({ maintenanceRules, chargeMaster, lateFeeConfig });
    } catch (err) {
        console.error('getConfig error:', err);
        return res.status(500).json({ error: err.message });
    }
};

// Create or Update a Maintenance Rule
const upsertMaintenanceRule = async (req, res) => {
    try {
        const societyId = req.user.societyId;
        const { id } = req.params;
        const { unitType, calculationType, amount, ratePerSqFt, isActive } = req.body;

        let rule;
        if (id === 'new') {
            rule = await prisma.maintenanceRule.create({
                data: {
                    societyId,
                    unitType: unitType || 'ALL',
                    calculationType: calculationType || 'FLAT',
                    amount: parseFloat(amount) || 0,
                    ratePerSqFt: parseFloat(ratePerSqFt) || 0,
                    isActive: isActive !== false,
                }
            });
        } else {
            rule = await prisma.maintenanceRule.update({
                where: { id: parseInt(id) },
                data: {
                    ...(unitType !== undefined && { unitType }),
                    ...(calculationType !== undefined && { calculationType }),
                    ...(amount !== undefined && { amount: parseFloat(amount) }),
                    ...(ratePerSqFt !== undefined && { ratePerSqFt: parseFloat(ratePerSqFt) }),
                    ...(isActive !== undefined && { isActive }),
                }
            });
        }

        return res.json(rule);
    } catch (err) {
        console.error('upsertMaintenanceRule error:', err);
        if (err.code === 'P2002') {
            return res.status(400).json({ error: `A rule for unit type "${req.body.unitType}" already exists.` });
        }
        return res.status(500).json({ error: err.message });
    }
};

// Delete a Maintenance Rule
const deleteMaintenanceRule = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.maintenanceRule.delete({ where: { id: parseInt(id) } });
        return res.json({ success: true });
    } catch (err) {
        console.error('deleteMaintenanceRule error:', err);
        return res.status(500).json({ error: err.message });
    }
};

// Create a new Charge Head
const createCharge = async (req, res) => {
    try {
        const societyId = req.user.societyId;
        const { name, defaultAmount, calculationMethod, isOptional } = req.body;

        const charge = await prisma.chargeMaster.create({
            data: {
                societyId,
                name,
                defaultAmount: parseFloat(defaultAmount) || 0,
                calculationMethod: calculationMethod || 'FIXED',
                isOptional: Boolean(isOptional),
                isActive: true,
            }
        });
        return res.json(charge);
    } catch (err) {
        console.error('createCharge error:', err);
        return res.status(500).json({ error: err.message });
    }
};

// Update a Charge Head
const updateCharge = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, defaultAmount, calculationMethod, isOptional, isActive } = req.body;

        const charge = await prisma.chargeMaster.update({
            where: { id: parseInt(id) },
            data: {
                ...(name !== undefined && { name }),
                ...(defaultAmount !== undefined && { defaultAmount: parseFloat(defaultAmount) }),
                ...(calculationMethod !== undefined && { calculationMethod }),
                ...(isOptional !== undefined && { isOptional: Boolean(isOptional) }),
                ...(isActive !== undefined && { isActive }),
            }
        });
        return res.json(charge);
    } catch (err) {
        console.error('updateCharge error:', err);
        return res.status(500).json({ error: err.message });
    }
};

// Delete a Charge Head
const deleteCharge = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.chargeMaster.delete({ where: { id: parseInt(id) } });
        return res.json({ success: true });
    } catch (err) {
        console.error('deleteCharge error:', err);
        return res.status(500).json({ error: err.message });
    }
};

// Upsert Late Fee Config
const upsertLateFeeConfig = async (req, res) => {
    try {
        const societyId = req.user.societyId;
        const { gracePeriod, feeType, amount, maxCap, isActive } = req.body;

        const config = await prisma.lateFeeConfig.upsert({
            where: { societyId },
            update: {
                ...(gracePeriod !== undefined && { gracePeriod: parseInt(gracePeriod) }),
                ...(feeType !== undefined && { feeType }),
                ...(amount !== undefined && { amount: parseFloat(amount) }),
                ...(maxCap !== undefined && { maxCap: maxCap ? parseFloat(maxCap) : null }),
                ...(isActive !== undefined && { isActive }),
            },
            create: {
                societyId,
                gracePeriod: parseInt(gracePeriod) || 5,
                feeType: feeType || 'FIXED',
                amount: parseFloat(amount) || 0,
                maxCap: maxCap ? parseFloat(maxCap) : null,
                isActive: Boolean(isActive),
            }
        });
        return res.json(config);
    } catch (err) {
        console.error('upsertLateFeeConfig error:', err);
        return res.status(500).json({ error: err.message });
    }
};

module.exports = {
    getConfig,
    upsertMaintenanceRule,
    deleteMaintenanceRule,
    createCharge,
    updateCharge,
    deleteCharge,
    upsertLateFeeConfig,
};
