const prisma = require('../lib/prisma');
const bcrypt = require('bcryptjs');

class TenantController {
    // Get all tenants (represented by units with a tenantId)
    static async getAll(req, res) {
        try {
            const { societyId } = req.user;
            const units = await prisma.unit.findMany({
                where: {
                    societyId,
                    tenantId: { not: null }
                },
                include: {
                    tenant: true,
                    owner: true
                },
                orderBy: [{ block: 'asc' }, { number: 'asc' }]
            });

            // Format for the frontend
            const formattedTenants = units.map(unit => ({
                id: `TEN-${unit.id.toString().padStart(3, '0')}`,
                dbId: unit.id,
                name: unit.tenant.name,
                email: unit.tenant.email,
                phone: unit.tenant.phone || unit.tenant.phone,
                unit: unit.number,
                block: unit.block,
                floor: unit.floor ? `${unit.floor}${getFloorSuffix(unit.floor)}` : '',
                ownerName: unit.owner ? unit.owner.name : '',
                ownerPhone: unit.owner ? unit.owner.phone : '',
                leaseStartDate: unit.leaseStartDate ? unit.leaseStartDate.toISOString().split('T')[0] : '',
                leaseEndDate: unit.leaseEndDate ? unit.leaseEndDate.toISOString().split('T')[0] : '',
                rentAmount: unit.rentAmount || 0,
                securityDeposit: unit.securityDeposit || 0,
                maintenanceCharges: unit.maintenanceCharges || 0,
                parkingSlot: unit.parkingSlot || '',
                vehicleNumber: unit.vehicleNumber || '',
                emergencyContact: unit.emergencyContact || '',
                status: unit.status === 'OCCUPIED' ? 'active' : 'inactive' // Simplified mapping
            }));

            res.json({ success: true, data: formattedTenants });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    static async getStats(req, res) {
        try {
            const { societyId } = req.user;

            const totalTenants = await prisma.unit.count({
                where: { societyId, tenantId: { not: null } }
            });

            const activeLeases = await prisma.unit.count({
                where: {
                    societyId,
                    tenantId: { not: null },
                    leaseEndDate: { gte: new Date() }
                }
            });

            const expiringSoon = await prisma.unit.count({
                where: {
                    societyId,
                    tenantId: { not: null },
                    leaseEndDate: {
                        gte: new Date(),
                        lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // Next 30 days
                    }
                }
            });

            const rentCollection = await prisma.unit.aggregate({
                where: { societyId, tenantId: { not: null } },
                _sum: { rentAmount: true }
            });

            res.json({
                success: true,
                data: {
                    totalTenants,
                    activeLeases,
                    expiringSoon,
                    totalRent: rentCollection._sum.rentAmount || 0
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    static async create(req, res) {
        try {
            const { societyId } = req.user;
            const {
                name,
                email,
                phone,
                unitNumber,
                block,
                leaseStartDate,
                leaseEndDate,
                rentAmount,
                securityDeposit,
                maintenanceCharges,
                parkingSlot,
                vehicleNumber,
                emergencyContact,
                notes
            } = req.body;

            // 1. Find the unit
            const unit = await prisma.unit.findFirst({
                where: { societyId, number: unitNumber, block }
            });

            if (!unit) {
                return res.status(404).json({ success: false, message: 'Unit not found' });
            }

            // 2. Find or Create the User (Tenant)
            let user = await prisma.user.findUnique({ where: { email } });

            if (!user) {
                const hashedPassword = await bcrypt.hash('Resident@123', 10);
                user = await prisma.user.create({
                    data: {
                        email,
                        name,
                        phone,
                        password: hashedPassword,
                        role: 'RESIDENT',
                        societyId,
                        status: 'ACTIVE',
                        addedByUserId: req.user.id
                    }
                });
            }

            // 3. Update the Unit with Tenant Details
            const updatedUnit = await prisma.unit.update({
                where: { id: unit.id },
                data: {
                    tenantId: user.id,
                    status: 'OCCUPIED',
                    leaseStartDate: leaseStartDate ? new Date(leaseStartDate) : null,
                    leaseEndDate: leaseEndDate ? new Date(leaseEndDate) : null,
                    rentAmount: parseFloat(rentAmount) || 0,
                    securityDeposit: parseFloat(securityDeposit) || 0,
                    maintenanceCharges: parseFloat(maintenanceCharges) || 0,
                    parkingSlot,
                    vehicleNumber,
                    emergencyContact,
                    notes
                }
            });

            res.status(201).json({ success: true, data: updatedUnit });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    static async update(req, res) {
        try {
            const { id } = req.params; // dbId
            const {
                leaseStartDate,
                leaseEndDate,
                rentAmount,
                securityDeposit,
                maintenanceCharges,
                parkingSlot,
                vehicleNumber,
                emergencyContact,
                notes,
                status
            } = req.body;

            const updatedUnit = await prisma.unit.update({
                where: { id: parseInt(id) },
                data: {
                    leaseStartDate: leaseStartDate ? new Date(leaseStartDate) : undefined,
                    leaseEndDate: leaseEndDate ? new Date(leaseEndDate) : undefined,
                    rentAmount: rentAmount !== undefined ? parseFloat(rentAmount) : undefined,
                    securityDeposit: securityDeposit !== undefined ? parseFloat(securityDeposit) : undefined,
                    maintenanceCharges: maintenanceCharges !== undefined ? parseFloat(maintenanceCharges) : undefined,
                    parkingSlot,
                    vehicleNumber,
                    emergencyContact,
                    notes,
                    status: status === 'active' ? 'OCCUPIED' : undefined
                }
            });

            res.json({ success: true, data: updatedUnit });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    static async remove(req, res) {
        try {
            const { id } = req.params;
            await prisma.unit.update({
                where: { id: parseInt(id) },
                data: {
                    tenantId: null,
                    status: 'VACANT',
                    leaseStartDate: null,
                    leaseEndDate: null,
                    rentAmount: null,
                    securityDeposit: null,
                    maintenanceCharges: null,
                    parkingSlot: null,
                    vehicleNumber: null,
                    emergencyContact: null,
                    notes: null
                }
            });
            res.json({ success: true, message: 'Tenant removed from unit' });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }
}

function getFloorSuffix(floor) {
    const j = floor % 10, k = floor % 100;
    if (j === 1 && k !== 11) return 'st Floor';
    if (j === 2 && k !== 12) return 'nd Floor';
    if (j === 3 && k !== 13) return 'rd Floor';
    return 'th Floor';
}

module.exports = TenantController;
