const prisma = require('../lib/prisma');

class BillingConfigController {
    // Maintenance Rules
    static async getMaintenanceRules(req, res) {
        try {
            const societyId = req.user.societyId;
            const rules = await prisma.maintenanceRule.findMany({
                where: { societyId },
                orderBy: { unitType: 'asc' }
            });
            res.json(rules);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async updateMaintenanceRule(req, res) {
        try {
            const { id } = req.params;
            const { unitType, calculationType, amount, ratePerSqFt, isActive } = req.body;
            const societyId = req.user.societyId;

            let rule;
            if (id === 'new') {
                rule = await prisma.maintenanceRule.create({
                    data: {
                        societyId,
                        unitType,
                        calculationType,
                        amount: parseFloat(amount || 0),
                        ratePerSqFt: parseFloat(ratePerSqFt || 0),
                        isActive: isActive !== undefined ? isActive : true
                    }
                });
            } else {
                rule = await prisma.maintenanceRule.update({
                    where: { id: parseInt(id), societyId },
                    data: {
                        unitType,
                        calculationType,
                        amount: parseFloat(amount || 0),
                        ratePerSqFt: parseFloat(ratePerSqFt || 0),
                        isActive
                    }
                });
            }
            res.json(rule);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async deleteMaintenanceRule(req, res) {
        try {
            const { id } = req.params;
            const societyId = req.user.societyId;
            await prisma.maintenanceRule.delete({
                where: { id: parseInt(id), societyId }
            });
            res.json({ message: 'Rule deleted successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // Charge Master
    static async getChargeMaster(req, res) {
        try {
            const societyId = req.user.societyId;
            const charges = await prisma.chargeMaster.findMany({
                where: { societyId },
                orderBy: { name: 'asc' }
            });
            res.json(charges);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async createCharge(req, res) {
        try {
            const { name, defaultAmount, calculationMethod, isOptional, isActive } = req.body;
            const societyId = req.user.societyId;

            const charge = await prisma.chargeMaster.create({
                data: {
                    societyId,
                    name,
                    defaultAmount: parseFloat(defaultAmount || 0),
                    calculationMethod,
                    isOptional: isOptional || false,
                    isActive: isActive !== undefined ? isActive : true
                }
            });
            res.status(201).json(charge);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async updateCharge(req, res) {
        try {
            const { id } = req.params;
            const { name, defaultAmount, calculationMethod, isOptional, isActive } = req.body;
            const societyId = req.user.societyId;

            const charge = await prisma.chargeMaster.update({
                where: { id: parseInt(id), societyId },
                data: {
                    name,
                    defaultAmount: parseFloat(defaultAmount || 0),
                    calculationMethod,
                    isOptional,
                    isActive
                }
            });
            res.json(charge);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async deleteCharge(req, res) {
        try {
            const { id } = req.params;
            const societyId = req.user.societyId;
            await prisma.chargeMaster.delete({
                where: { id: parseInt(id), societyId }
            });
            res.json({ message: 'Charge head deleted successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // Late Fee Config
    static async getLateFeeConfig(req, res) {
        try {
            const societyId = req.user.societyId;
            let config = await prisma.lateFeeConfig.findUnique({
                where: { societyId }
            });

            if (!config) {
                config = await prisma.lateFeeConfig.create({
                    data: { societyId }
                });
            }
            res.json(config);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async updateLateFeeConfig(req, res) {
        try {
            const societyId = req.user.societyId;
            const { gracePeriod, feeType, amount, maxCap, isActive } = req.body;

            const config = await prisma.lateFeeConfig.upsert({
                where: { societyId },
                update: {
                    gracePeriod: parseInt(gracePeriod || 0),
                    feeType,
                    amount: parseFloat(amount || 0),
                    maxCap: maxCap ? parseFloat(maxCap) : null,
                    isActive: isActive !== undefined ? isActive : true
                },
                create: {
                    societyId,
                    gracePeriod: parseInt(gracePeriod || 0),
                    feeType,
                    amount: parseFloat(amount || 0),
                    maxCap: maxCap ? parseFloat(maxCap) : null,
                    isActive: isActive !== undefined ? isActive : true
                }
            });
            res.json(config);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // Global Billing Config Get
    static async getBillingConfig(req, res) {
        try {
            const societyId = req.user.societyId;
            const [maintenanceRules, chargeMaster, lateFeeConfig] = await Promise.all([
                prisma.maintenanceRule.findMany({ where: { societyId, isActive: true } }),
                prisma.chargeMaster.findMany({ where: { societyId, isActive: true } }),
                prisma.lateFeeConfig.findUnique({ where: { societyId } })
            ]);

            res.json({
                maintenanceRules,
                chargeMaster,
                lateFeeConfig: lateFeeConfig || { isActive: false }
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = BillingConfigController;
