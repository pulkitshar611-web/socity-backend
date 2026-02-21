const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const cloudinary = require('../config/cloudinary');

const RentalAgreementController = {
    // ─── Create Enquiry (Resident) ────────────────────────────────────────────────
    create: async (req, res) => {
        try {
            const {
                propertyType, propertyAddress, city, area,
                agreementType, rentAmount, depositAmount, durationMonths, startDate,
                ownerName, tenantName, numberOfTenants, remarks
            } = req.body;

            const decoded = req.user;
            if (!decoded) return res.status(401).json({ error: 'Unauthorized' });

            // Get full user details for name and email
            const user = await prisma.user.findUnique({
                where: { id: parseInt(decoded.id) },
                include: { society: true }
            });

            if (!user) return res.status(404).json({ error: 'User not found' });

            // Handle file uploads (Cloudinary)
            let mediaData = [];
            if (req.files && req.files.length > 0) {
                for (const file of req.files) {
                    const result = await cloudinary.uploader.upload(file.path, {
                        folder: 'rental_agreements',
                        resource_type: 'auto',
                    });
                    mediaData.push({
                        url: result.secure_url,
                        name: file.originalname,
                        type: file.mimetype.startsWith('image/') ? 'image' : 'pdf',
                    });
                }
            }

            const lead = await prisma.rentalAgreementLead.create({
                data: {
                    residentName: user.name,
                    phone: user.phone || '',
                    email: user.email,
                    propertyType,
                    propertyAddress,
                    city,
                    area,
                    agreementType,
                    rentAmount: parseFloat(rentAmount),
                    depositAmount: parseFloat(depositAmount),
                    durationMonths: parseInt(durationMonths),
                    startDate: new Date(startDate),
                    ownerName,
                    tenantName,
                    numberOfTenants: parseInt(numberOfTenants),
                    remarks,
                    residentId: user.id,
                    societyId: user.societyId,
                    status: 'New',
                    documents: { create: mediaData },
                    history: {
                        create: {
                            status: 'New',
                            notes: 'Initial request submitted',
                            updatedById: user.id,
                        },
                    },
                },
                include: { documents: true, history: true },
            });

            // Notification to Admins
            const admins = await prisma.user.findMany({
                where: {
                    OR: [
                        { role: 'SUPER_ADMIN' },
                        { role: 'ADMIN', societyId: user.societyId }
                    ]
                }
            });

            for (const admin of admins) {
                await prisma.notification.create({
                    data: {
                        userId: admin.id,
                        title: 'New Rental Agreement Request',
                        description: `${user.name} submitted a new ${agreementType} agreement request for ${propertyType}.`,
                        type: 'rental_agreement',
                        read: false,
                    },
                });
            }

            res.status(201).json(lead);
        } catch (error) {
            console.error('Error creating rental agreement:', error);
            res.status(500).json({ error: error.message });
        }
    },

    // ─── List Enquiries (Role-based) ──────────────────────────────────────────────
    list: async (req, res) => {
        try {
            const decoded = req.user;
            const { page = 1, limit = 20, status, search, propertyType } = req.query;
            const skip = (page - 1) * limit;

            let where = {};

            // Role-based filtering
            if (decoded.role === 'RESIDENT' || decoded.role === 'INDIVIDUAL') {
                where.residentId = parseInt(decoded.id);
            } else if (decoded.role === 'ADMIN') {
                where.societyId = decoded.societyId;
            }
            // SUPER_ADMIN sees all

            if (status && status !== 'all') where.status = status;
            if (propertyType && propertyType !== 'all') where.propertyType = propertyType;
            if (search) {
                where.OR = [
                    { residentName: { contains: search } },
                    { phone: { contains: search } },
                    { city: { contains: search } },
                ];
            }

            const [leads, total] = await Promise.all([
                prisma.rentalAgreementLead.findMany({
                    where,
                    include: { documents: true, resident: { select: { name: true, phone: true } } },
                    orderBy: { createdAt: 'desc' },
                    skip: parseInt(skip),
                    take: parseInt(limit),
                }),
                prisma.rentalAgreementLead.count({ where }),
            ]);

            res.json({
                data: leads,
                meta: {
                    total,
                    page: parseInt(page),
                    totalPages: Math.ceil(total / limit),
                },
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // ─── Get Details ─────────────────────────────────────────────────────────────
    getDetail: async (req, res) => {
        try {
            const { id } = req.params;
            const lead = await prisma.rentalAgreementLead.findUnique({
                where: { id: parseInt(id) },
                include: {
                    documents: true,
                    history: { orderBy: { createdAt: 'desc' } },
                    resident: { select: { name: true, phone: true, email: true } },
                    assignedTo: { select: { name: true, role: true } },
                },
            });

            if (!lead) return res.status(404).json({ error: 'Lead not found' });
            res.json(lead);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // ─── Update Status ───────────────────────────────────────────────────────────
    updateStatus: async (req, res) => {
        try {
            const { id } = req.params;
            const { status, notes } = req.body;
            const decoded = req.user;

            const currentLead = await prisma.rentalAgreementLead.findUnique({
                where: { id: parseInt(id) },
            });

            if (!currentLead) return res.status(404).json({ error: 'Lead not found' });

            const updatedLead = await prisma.rentalAgreementLead.update({
                where: { id: parseInt(id) },
                data: {
                    status,
                    history: {
                        create: {
                            status,
                            notes,
                            updatedById: parseInt(decoded.id),
                        },
                    },
                },
            });

            // Notify Resident
            await prisma.notification.create({
                data: {
                    userId: currentLead.residentId,
                    title: 'Rental Agreement Status Updated',
                    description: `Your rental agreement request status has been updated to "${status}".`,
                    type: 'rental_agreement_update',
                    read: false,
                },
            });

            res.json(updatedLead);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // ─── Assign Lead ─────────────────────────────────────────────────────────────
    assign: async (req, res) => {
        try {
            const { id } = req.params;
            const { assignedToId } = req.body;
            const decoded = req.user;

            const lead = await prisma.rentalAgreementLead.update({
                where: { id: parseInt(id) },
                data: {
                    assignedToId: parseInt(assignedToId),
                    history: {
                        create: {
                            status: 'Processing',
                            notes: `Lead assigned to user ID ${assignedToId}`,
                            updatedById: parseInt(decoded.id),
                        },
                    },
                },
            });

            // Notify the assigned person
            await prisma.notification.create({
                data: {
                    userId: parseInt(assignedToId),
                    title: 'Rental Agreement Lead Assigned',
                    description: `A new rental agreement lead for ${lead.residentName} has been assigned to you.`,
                    type: 'rental_agreement_assigned',
                    read: false,
                },
            });

            res.json(lead);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // ─── Delete Lead (Resident only if status is New) ──────────────────────────
    delete: async (req, res) => {
        try {
            const { id } = req.params;
            const decoded = req.user;

            const lead = await prisma.rentalAgreementLead.findUnique({
                where: { id: parseInt(id) },
            });

            if (!lead) return res.status(404).json({ error: 'Not found' });

            // Only owner can delete and only if status is "New"
            if (lead.residentId !== parseInt(decoded.id)) {
                return res.status(403).json({ error: 'Permission denied' });
            }

            if (lead.status !== 'New') {
                return res.status(400).json({ error: 'Can only delete new requests' });
            }

            await prisma.rentalAgreementLead.delete({ where: { id: parseInt(id) } });
            res.json({ message: 'Deleted successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },
};

module.exports = RentalAgreementController;
