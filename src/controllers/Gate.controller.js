const prisma = require('../lib/prisma');
const cloudinary = require('../config/cloudinary');
const { getIO } = require('../lib/socket');

const GateController = {
    // List all gates for a society
    list: async (req, res) => {
        try {
            const societyId = req.user.societyId;
            if (!societyId) return res.status(403).json({ error: 'Society access required' });

            const gates = await prisma.gate.findMany({
                where: { societyId },
                include: {
                    _count: {
                        select: { visitors: true }
                    }
                },
                orderBy: { createdAt: 'desc' }
            });

            res.json(gates);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: error.message });
        }
    },

    // Create a new gate
    create: async (req, res) => {
        try {
            const { name } = req.body;
            const societyId = req.user.societyId;
            if (!societyId) return res.status(403).json({ error: 'Society access required' });

            const gate = await prisma.gate.create({
                data: {
                    name,
                    societyId
                }
            });

            res.status(201).json(gate);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: error.message });
        }
    },

    // Toggle gate active status
    toggle: async (req, res) => {
        try {
            const { id } = req.params;
            const societyId = req.user.societyId;

            const existing = await prisma.gate.findUnique({
                where: { id: parseInt(id) }
            });

            if (!existing || existing.societyId !== societyId) {
                return res.status(404).json({ error: 'Gate not found' });
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
    },

    // Remove a gate
    remove: async (req, res) => {
        try {
            const { id } = req.params;
            const societyId = req.user.societyId;

            const existing = await prisma.gate.findUnique({
                where: { id: parseInt(id) }
            });

            if (!existing || existing.societyId !== societyId) {
                return res.status(404).json({ error: 'Gate not found' });
            }

            await prisma.gate.delete({
                where: { id: parseInt(id) }
            });

            res.json({ success: true });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: error.message });
        }
    },

    // Public: Validate gate exists and is active
    validate: async (req, res) => {
        try {
            const { gateId } = req.params;
            const gate = await prisma.gate.findUnique({
                where: { id: parseInt(gateId), isActive: true },
                include: { society: true }
            });

            if (!gate) {
                return res.status(404).json({ error: 'Gate not found or inactive' });
            }

            res.json(gate);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: error.message });
        }
    },

    // Public: Get all units for the society this gate belongs to
    getUnits: async (req, res) => {
        try {
            const { gateId } = req.params;
            const gate = await prisma.gate.findUnique({
                where: { id: parseInt(gateId) }
            });

            if (!gate) return res.status(404).json({ error: 'Gate not found' });

            const units = await prisma.unit.findMany({
                where: { societyId: gate.societyId },
                include: {
                    owner: { select: { name: true } },
                    tenant: { select: { name: true } }
                },
                orderBy: [
                    { block: 'asc' },
                    { number: 'asc' }
                ]
            });


            res.json(units);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: error.message });
        }
    },

    // Public: Handle visitor walk-in entry via QR scan
    submitEntry: async (req, res) => {
        try {
            const { gateId } = req.params;
            const { name, phone, visitingUnitId, purpose, whomToMeet, fromLocation, vehicleNo } = req.body;

            const gate = await prisma.gate.findUnique({
                where: { id: parseInt(gateId) },
                include: { society: true }
            });

            if (!gate || !gate.isActive) {
                return res.status(404).json({ error: 'Gate not found or inactive' });
            }

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

            console.log(`[Gate QR] Submission for gate ${gateId}, unit: ${visitingUnitId}`);

            // Auto-assign resident if unit is provided
            let residentId = null;
            let unitInfo = null;
            if (visitingUnitId) {
                unitInfo = await prisma.unit.findUnique({
                    where: { id: parseInt(visitingUnitId) },
                    include: { owner: true, tenant: true }
                });
                if (unitInfo) {
                    residentId = unitInfo.tenantId || unitInfo.ownerId;
                    console.log(`[Gate QR] Found residentId: ${residentId} for unit ${unitInfo.block}-${unitInfo.number}`);
                } else {
                    console.log(`[Gate QR] Unit ${visitingUnitId} not found`);
                }
            } else {
                console.log(`[Gate QR] No visitingUnitId provided in submission`);
            }

            // Create visitor as PENDING for approval
            const visitor = await prisma.visitor.create({
                data: {
                    name,
                    phone,
                    purpose,
                    whomToMeet,
                    fromLocation,
                    vehicleNo,
                    visitingUnitId: visitingUnitId ? parseInt(visitingUnitId) : null,
                    residentId: residentId,
                    societyId: gate.societyId,
                    gateId: gate.id,
                    status: 'PENDING',
                    photo: photoUrl
                },
                include: {
                    unit: true
                }
            });

            // Emit real-time notification to guards and the specific resident
            try {
                const io = getIO();

                // 1. Notify Guards (Society wide)
                io.to(`society_${gate.societyId}`).emit('new_visitor_request', {
                    id: visitor.id,
                    name: visitor.name,
                    purpose: visitor.purpose,
                    unit: visitor.unit ? `${visitor.unit.block}-${visitor.unit.number}` : null,
                    gateName: gate.name,
                    photo: visitor.photo,
                    message: `New walk-in visitor at ${gate.name}`
                });

                // 2. Notify Specific Resident (Real-time)
                if (residentId) {
                    io.to(`user_${residentId}`).emit('resident_visitor_request', {
                        id: visitor.id,
                        name: visitor.name,
                        purpose: visitor.purpose,
                        gateName: gate.name,
                        photo: visitor.photo,
                        message: `${visitor.name} is at the ${gate.name} to meet you. Please approve/reject.`
                    });
                }

                // 3. Create database notifications
                const notificationData = [];

                // For Guards
                const guards = await prisma.user.findMany({
                    where: {
                        societyId: gate.societyId,
                        role: 'GUARD'
                    }
                });

                guards.forEach(guard => {
                    notificationData.push({
                        userId: guard.id,
                        title: 'New Visitor Request',
                        description: `${visitor.name} is waiting at ${gate.name} for ${visitor.purpose}`,
                        type: 'visitor',
                        metadata: { visitorId: visitor.id, gateId: gate.id }
                    });
                });

                // For Resident
                if (residentId) {
                    notificationData.push({
                        userId: residentId,
                        title: 'Visitor at Gate',
                        description: `${visitor.name} is at ${gate.name} to meet you. Reason: ${visitor.purpose}`,
                        type: 'visitor_approval',
                        metadata: { visitorId: visitor.id, gateId: gate.id }
                    });
                }

                if (notificationData.length > 0) {
                    await prisma.notification.createMany({
                        data: notificationData
                    });
                }

                // If resident is online, also send generic new_notification
                if (residentId) {
                    const residentNotification = notificationData.find(n => n.userId === residentId);
                    if (residentNotification) {
                        io.to(`user_${residentId}`).emit('new_notification', residentNotification);
                    }
                }

            } catch (ioErr) {
                console.error('Notification creation failed:', ioErr);
            }

            res.json(visitor);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: error.message });
        }
    }
};

module.exports = GateController;
