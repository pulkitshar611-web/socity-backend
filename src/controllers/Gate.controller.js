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
                },
                include: {
                    unit: true,
                    gate: true
                }
            });

            // Notify guards via Socket.io
            try {
                const { getIO } = require('../lib/socket');
                const io = getIO();

                const notificationData = {
                    id: visitor.id,
                    name: visitor.name,
                    purpose: visitor.purpose,
                    gateName: gate.name,
                    unit: visitor.unit ? `${visitor.unit.block}-${visitor.unit.number}` : null
                };

                io.to(`society_${gate.societyId}`).emit('new_visitor_request', notificationData);

                // ALSO: Save to Database Notifications for Persistent Dropdown
                const staffToNotify = await prisma.user.findMany({
                    where: {
                        societyId: gate.societyId,
                        role: { in: ['GUARD', 'ADMIN', 'COMMUNITY_MANAGER'] },
                        status: 'ACTIVE'
                    },
                    select: { id: true, role: true, name: true }
                });

                console.log(`[Notification] Found ${staffToNotify.length} staff members to notify for society ${gate.societyId}`);

                if (staffToNotify.length > 0) {
                    const result = await prisma.notification.createMany({
                        data: staffToNotify.map(staff => ({
                            userId: staff.id,
                            title: 'New Visitor Request',
                            description: `${visitor.name} at ${gate.name} for ${visitor.purpose}`,
                            type: 'visitor',
                            metadata: { visitorId: visitor.id, gateId: gate.id }
                        }))
                    });
                    console.log(`[Notification] Successfully created ${result.count} notification records.`);
                }
            } catch (err) {
                console.error('Notification workflow failed:', err.message);
            }

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
