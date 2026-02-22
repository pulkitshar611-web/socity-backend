const prisma = require('../lib/prisma');
const cloudinary = require('../config/cloudinary');

class GateController {
    // ─── Admin: List all gates for this society ───
    static async list(req, res) {
        try {
            const societyId = req.user.societyId;
            if (!societyId) return res.status(403).json({ error: 'Society required' });
            const gates = await prisma.gate.findMany({
                where: { societyId },
                include: { _count: { select: { visitors: true } } },
                orderBy: { createdAt: 'desc' }
            });
            res.json(gates);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: error.message });
        }
    }

    // ─── Admin: Create a new gate ───
    static async create(req, res) {
        try {
            const societyId = req.user.societyId;
            if (!societyId) return res.status(403).json({ error: 'Society required' });
            const { name } = req.body;
            if (!name || !name.trim()) return res.status(400).json({ error: 'Gate name is required' });
            const gate = await prisma.gate.create({
                data: { name: name.trim(), societyId }
            });
            res.status(201).json(gate);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: error.message });
        }
    }

    // ─── Admin: Toggle gate active/inactive ───
    static async toggle(req, res) {
        try {
            const { id } = req.params;
            const existing = await prisma.gate.findUnique({ where: { id: parseInt(id) } });
            if (!existing) return res.status(404).json({ error: 'Gate not found' });
            if (req.user.role !== 'SUPER_ADMIN' && existing.societyId !== req.user.societyId) {
                return res.status(403).json({ error: 'Access denied' });
            }
            const gate = await prisma.gate.update({
                where: { id: parseInt(id) },
                data: { isActive: !existing.isActive }
            });
            res.json(gate);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: error.message });
        }
    }

    // ─── Admin: Delete a gate ───
    static async remove(req, res) {
        try {
            const { id } = req.params;
            const existing = await prisma.gate.findUnique({ where: { id: parseInt(id) } });
            if (!existing) return res.status(404).json({ error: 'Gate not found' });
            if (req.user.role !== 'SUPER_ADMIN' && existing.societyId !== req.user.societyId) {
                return res.status(403).json({ error: 'Access denied' });
            }
            await prisma.gate.delete({ where: { id: parseInt(id) } });
            res.json({ message: 'Gate deleted' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: error.message });
        }
    }

    // ═══════════════════════════════════════════
    // PUBLIC ENDPOINTS (No Auth Required)
    // ═══════════════════════════════════════════

    // ─── Public: Validate a gate (for QR scan) ───
    static async validateGate(req, res) {
        try {
            const { gateId } = req.params;
            const gate = await prisma.gate.findUnique({
                where: { id: parseInt(gateId) },
                include: {
                    society: {
                        select: { id: true, name: true, address: true, city: true, state: true }
                    }
                }
            });
            if (!gate) return res.status(404).json({ error: 'Gate not found' });
            if (!gate.isActive) return res.status(400).json({ error: 'This gate is currently inactive' });
            res.json({
                id: gate.id,
                name: gate.name,
                societyId: gate.societyId,
                society: gate.society
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: error.message });
        }
    }

    // ─── Public: Get units for a gate's society (for resident selector) ───
    static async getGateUnits(req, res) {
        try {
            const { gateId } = req.params;
            const gate = await prisma.gate.findUnique({ where: { id: parseInt(gateId) } });
            if (!gate || !gate.isActive) return res.status(404).json({ error: 'Gate not found or inactive' });

            const units = await prisma.unit.findMany({
                where: { societyId: gate.societyId },
                select: {
                    id: true, block: true, number: true, floor: true,
                    owner: { select: { id: true, name: true } },
                    tenant: { select: { id: true, name: true } }
                },
                orderBy: [{ block: 'asc' }, { number: 'asc' }]
            });
            res.json(units);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: error.message });
        }
    }

    // ─── Public: Submit walk-in visitor entry (QR flow) ───
    static async walkInEntry(req, res) {
        try {
            const { gateId } = req.params;
            const gate = await prisma.gate.findUnique({ where: { id: parseInt(gateId) } });
            if (!gate) return res.status(404).json({ error: 'Gate not found' });
            if (!gate.isActive) return res.status(400).json({ error: 'This gate is currently inactive' });

            const {
                name, phone, purpose, whomToMeet,
                vehicleNo, fromLocation, visitingUnitId
            } = req.body;

            // Validations
            if (!name || !name.trim()) return res.status(400).json({ error: 'Full name is required' });
            if (!phone || !phone.trim()) return res.status(400).json({ error: 'Mobile number is required' });
            if (!purpose || !purpose.trim()) return res.status(400).json({ error: 'Purpose of visit is required' });

            // Handle photo upload
            let photoUrl = null;
            if (req.file) {
                const b64 = Buffer.from(req.file.buffer).toString('base64');
                const dataURI = 'data:' + req.file.mimetype + ';base64,' + b64;
                const uploadResponse = await cloudinary.uploader.upload(dataURI, {
                    folder: 'socity_visitors',
                    resource_type: 'auto'
                });
                photoUrl = uploadResponse.secure_url;
            }

            // Auto-assign resident from unit if provided
            let residentId = null;
            if (visitingUnitId) {
                const unit = await prisma.unit.findUnique({
                    where: { id: parseInt(visitingUnitId) }
                });
                if (unit && unit.societyId === gate.societyId) {
                    residentId = unit.tenantId || unit.ownerId;
                }
            }

            const visitor = await prisma.visitor.create({
                data: {
                    name: name.trim(),
                    phone: phone.trim(),
                    purpose: purpose.trim(),
                    whomToMeet: whomToMeet?.trim() || null,
                    vehicleNo: vehicleNo?.trim() || null,
                    fromLocation: fromLocation?.trim() || null,
                    photo: photoUrl,
                    status: 'PENDING',
                    societyId: gate.societyId,
                    gateId: gate.id,
                    visitingUnitId: visitingUnitId ? parseInt(visitingUnitId) : null,
                    residentId
                }
            });

            res.status(201).json({
                message: 'Entry request submitted. Please wait for security approval.',
                visitorId: visitor.id,
                status: visitor.status
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = GateController;
