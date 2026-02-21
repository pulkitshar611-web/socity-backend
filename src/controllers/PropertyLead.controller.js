const prisma = require('../lib/prisma');

/** Helper: get Cloudinary upload URL
 * We reuse the same upload approach as existing (base64 in JSON body).
 */
const cloudinary = require('cloudinary').v2;

class PropertyLeadController {

    // ─── RESIDENT ENDPOINTS ────────────────────────────────────────────────────

    /** POST /api/property-leads  →  Create a new lead (Resident) */
    static async create(req, res) {
        try {
            const {
                title, description, category, actionType,
                city, area, address,
                size, budget, bedrooms, floor,
                phone, email,
                images,     // Array of base64 strings for upload
            } = req.body;

            // req.user only has id, role, societyId — fetch full user for name/email
            const user = await prisma.user.findUnique({
                where: { id: req.user.id },
                select: { id: true, name: true, email: true, societyId: true, role: true },
            });

            // Validate required fields
            if (!title || !category || !actionType || !city || !area || !phone) {
                return res.status(400).json({ error: 'title, category, actionType, city, area, and phone are required' });
            }

            const lead = await prisma.propertyLead.create({
                data: {
                    title,
                    description,
                    category,
                    actionType,
                    city,
                    area,
                    address,
                    size: size ? parseFloat(size) : null,
                    budget: budget ? parseFloat(budget) : null,
                    bedrooms: bedrooms ? parseInt(bedrooms) : null,
                    floor: floor ? parseInt(floor) : null,
                    residentName: user.name || 'Unknown',
                    phone,
                    email: email || user.email,
                    status: 'New Lead',
                    residentId: user.id,
                    societyId: user.societyId || null,
                },
            });

            // Upload images to Cloudinary and store them as PropertyMedia
            if (Array.isArray(images) && images.length > 0) {
                const uploadedMedia = await Promise.all(
                    images.map(async (base64Img) => {
                        try {
                            const result = await cloudinary.uploader.upload(base64Img, {
                                folder: 'property_leads',
                                resource_type: 'auto',
                            });
                            return { leadId: lead.id, url: result.secure_url, type: 'image' };
                        } catch (err) {
                            console.error('Image upload failed:', err.message);
                            return null;
                        }
                    })
                );

                const validMedia = uploadedMedia.filter(Boolean);
                if (validMedia.length > 0) {
                    await prisma.propertyMedia.createMany({ data: validMedia });
                }
            }

            // ── Notify all Super Admins ────────────────────────────
            try {
                const superAdmins = await prisma.user.findMany({ where: { role: 'SUPER_ADMIN' }, select: { id: true } });
                if (superAdmins.length > 0) {
                    await prisma.notification.createMany({
                        data: superAdmins.map(admin => ({
                            userId: admin.id,
                            title: 'New Property Lead',
                            description: `${user.name} posted a new property lead: ${title} (${actionType} – ${category})`,
                            type: 'property_lead',
                            read: false,
                        })),
                    });
                }
            } catch (notifErr) {
                console.error('Notification error:', notifErr.message);
            }

            // Return lead with media
            const full = await prisma.propertyLead.findUnique({
                where: { id: lead.id },
                include: { media: true, history: true },
            });
            res.status(201).json(full);
        } catch (error) {
            console.error('Create PropertyLead Error:', error);
            res.status(500).json({ error: error.message });
        }
    }

    /** GET /api/property-leads  →  List leads (role‑aware) */
    static async list(req, res) {
        try {
            let {
                page = 1, limit = 10,
                category, actionType, status, city,
                search, societyId,
            } = req.query;
            page = parseInt(page);
            limit = parseInt(limit);
            const skip = (page - 1) * limit;
            const role = req.user.role;

            const where = {};

            if (role === 'RESIDENT') {
                // Residents only see their own leads
                where.residentId = req.user.id;
            } else if (role === 'ADMIN') {
                where.societyId = req.user.societyId;
            } else if (role === 'SUPER_ADMIN') {
                if (societyId && societyId !== 'all') where.societyId = parseInt(societyId);
            } else {
                return res.status(403).json({ error: 'Access denied' });
            }

            if (category && category !== 'all') where.category = category;
            if (actionType && actionType !== 'all') where.actionType = actionType;
            if (status && status !== 'all') where.status = status;
            if (city && city !== 'all') where.city = city;

            if (search) {
                where.OR = [
                    { residentName: { contains: search } },
                    { phone: { contains: search } },
                    { title: { contains: search } },
                ];
            }

            const [total, leads] = await Promise.all([
                prisma.propertyLead.count({ where }),
                prisma.propertyLead.findMany({
                    where,
                    skip,
                    take: limit,
                    include: {
                        media: true,
                        resident: { select: { id: true, name: true, email: true, phone: true } },
                        society: { select: { name: true } },
                        assignedTo: { select: { id: true, name: true } },
                    },
                    orderBy: { createdAt: 'desc' },
                }),
            ]);

            res.json({
                data: leads,
                meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
            });
        } catch (error) {
            console.error('List PropertyLeads Error:', error);
            res.status(500).json({ error: error.message });
        }
    }

    /** GET /api/property-leads/:id  →  Single lead */
    static async get(req, res) {
        try {
            const { id } = req.params;
            const role = req.user.role;

            const lead = await prisma.propertyLead.findUnique({
                where: { id: parseInt(id) },
                include: {
                    media: true,
                    history: { orderBy: { createdAt: 'asc' } },
                    resident: { select: { id: true, name: true, email: true, phone: true } },
                    society: { select: { name: true } },
                    assignedTo: { select: { id: true, name: true } },
                },
            });

            if (!lead) return res.status(404).json({ error: 'Lead not found' });

            // Access check
            if (role === 'RESIDENT' && lead.residentId !== req.user.id) {
                return res.status(403).json({ error: 'Access denied' });
            }
            if (role === 'ADMIN' && lead.societyId !== req.user.societyId) {
                return res.status(403).json({ error: 'Access denied' });
            }

            res.json(lead);
        } catch (error) {
            console.error('Get PropertyLead Error:', error);
            res.status(500).json({ error: error.message });
        }
    }

    /** PUT /api/property-leads/:id  →  Update lead (Resident or Admin) */
    static async update(req, res) {
        try {
            const { id } = req.params;
            const role = req.user.role;

            const existing = await prisma.propertyLead.findUnique({ where: { id: parseInt(id) } });
            if (!existing) return res.status(404).json({ error: 'Lead not found' });

            // Residents can only edit their own, Admins/SuperAdmins can edit any in scope
            if (role === 'RESIDENT' && existing.residentId !== req.user.id) {
                return res.status(403).json({ error: 'Access denied' });
            }

            const {
                title, description, category, actionType,
                city, area, address,
                size, budget, bedrooms, floor,
                phone, email,
                images,
            } = req.body;

            const updated = await prisma.propertyLead.update({
                where: { id: parseInt(id) },
                data: {
                    ...(title !== undefined && { title }),
                    ...(description !== undefined && { description }),
                    ...(category !== undefined && { category }),
                    ...(actionType !== undefined && { actionType }),
                    ...(city !== undefined && { city }),
                    ...(area !== undefined && { area }),
                    ...(address !== undefined && { address }),
                    ...(size !== undefined && { size: size ? parseFloat(size) : null }),
                    ...(budget !== undefined && { budget: budget ? parseFloat(budget) : null }),
                    ...(bedrooms !== undefined && { bedrooms: bedrooms ? parseInt(bedrooms) : null }),
                    ...(floor !== undefined && { floor: floor ? parseInt(floor) : null }),
                    ...(phone !== undefined && { phone }),
                    ...(email !== undefined && { email }),
                },
                include: { media: true, history: true },
            });

            // If new images provided, add them
            if (Array.isArray(images) && images.length > 0) {
                const uploadedMedia = await Promise.all(
                    images.map(async (base64Img) => {
                        try {
                            const result = await cloudinary.uploader.upload(base64Img, {
                                folder: 'property_leads',
                                resource_type: 'auto',
                            });
                            return { leadId: parseInt(id), url: result.secure_url, type: 'image' };
                        } catch (err) {
                            console.error('Image upload failed:', err.message);
                            return null;
                        }
                    })
                );
                const validMedia = uploadedMedia.filter(Boolean);
                if (validMedia.length > 0) {
                    await prisma.propertyMedia.createMany({ data: validMedia });
                }
            }

            res.json(updated);
        } catch (error) {
            console.error('Update PropertyLead Error:', error);
            res.status(500).json({ error: error.message });
        }
    }

    /** DELETE /api/property-leads/:id  →  Delete lead */
    static async remove(req, res) {
        try {
            const { id } = req.params;
            const role = req.user.role;

            const existing = await prisma.propertyLead.findUnique({ where: { id: parseInt(id) } });
            if (!existing) return res.status(404).json({ error: 'Lead not found' });

            if (role === 'RESIDENT' && existing.residentId !== req.user.id) {
                return res.status(403).json({ error: 'Access denied' });
            }

            // Delete media + history cascade handled by Prisma schema
            await prisma.propertyLead.delete({ where: { id: parseInt(id) } });
            res.json({ success: true });
        } catch (error) {
            console.error('Delete PropertyLead Error:', error);
            res.status(500).json({ error: error.message });
        }
    }

    // ─── ADMIN / SUPER‑ADMIN ENDPOINTS ─────────────────────────────────────────

    /** PATCH /api/property-leads/:id/status  →  Update lead status */
    static async updateStatus(req, res) {
        try {
            const { id } = req.params;
            const { status, notes } = req.body;
            const role = req.user.role;

            if (!['ADMIN', 'SUPER_ADMIN'].includes(role)) {
                return res.status(403).json({ error: 'Only admins can update lead status' });
            }

            const validStatuses = ['New Lead', 'Contacted', 'Closed'];
            if (!validStatuses.includes(status)) {
                return res.status(400).json({ error: `Invalid status. Allowed: ${validStatuses.join(', ')}` });
            }

            const existing = await prisma.propertyLead.findUnique({ where: { id: parseInt(id) } });
            if (!existing) return res.status(404).json({ error: 'Lead not found' });

            const [updated] = await prisma.$transaction([
                prisma.propertyLead.update({
                    where: { id: parseInt(id) },
                    data: { status },
                    include: { media: true, resident: { select: { id: true, name: true } } },
                }),
                prisma.leadStatusHistory.create({
                    data: {
                        leadId: parseInt(id),
                        status,
                        notes: notes || null,
                        updatedById: req.user.id,
                    },
                }),
            ]);

            // Notify the resident about the status change
            try {
                await prisma.notification.create({
                    data: {
                        userId: existing.residentId,
                        title: 'Property Lead Status Updated',
                        description: `Your property lead "${existing.title}" status changed to: ${status}`,
                        type: 'property_lead_status',
                        read: false,
                    },
                });
            } catch (notifErr) {
                console.error('Status notification error:', notifErr.message);
            }

            res.json(updated);
        } catch (error) {
            console.error('UpdateStatus PropertyLead Error:', error);
            res.status(500).json({ error: error.message });
        }
    }

    /** PATCH /api/property-leads/:id/assign  →  Assign lead to admin/agent */
    static async assign(req, res) {
        try {
            const { id } = req.params;
            const { assignedToId } = req.body;
            const role = req.user.role;

            if (!['ADMIN', 'SUPER_ADMIN'].includes(role)) {
                return res.status(403).json({ error: 'Only admins can assign leads' });
            }

            const updated = await prisma.propertyLead.update({
                where: { id: parseInt(id) },
                data: { assignedToId: assignedToId ? parseInt(assignedToId) : null },
                include: {
                    media: true,
                    assignedTo: { select: { id: true, name: true } },
                    resident: { select: { id: true, name: true } },
                },
            });

            // Notify the assignee
            if (assignedToId) {
                try {
                    await prisma.notification.create({
                        data: {
                            userId: parseInt(assignedToId),
                            title: 'Property Lead Assigned',
                            description: `A property lead ("${updated.title}") has been assigned to you.`,
                            type: 'lead_assigned',
                            read: false,
                        },
                    });
                } catch (notifErr) {
                    console.error('Assign notification error:', notifErr.message);
                }
            }

            res.json(updated);
        } catch (error) {
            console.error('Assign PropertyLead Error:', error);
            res.status(500).json({ error: error.message });
        }
    }

    /** DELETE /api/property-leads/:leadId/media/:mediaId  →  Delete a specific media item */
    static async deleteMedia(req, res) {
        try {
            const { leadId, mediaId } = req.params;
            const role = req.user.role;

            const lead = await prisma.propertyLead.findUnique({ where: { id: parseInt(leadId) } });
            if (!lead) return res.status(404).json({ error: 'Lead not found' });

            if (role === 'RESIDENT' && lead.residentId !== req.user.id) {
                return res.status(403).json({ error: 'Access denied' });
            }

            await prisma.propertyMedia.delete({ where: { id: parseInt(mediaId) } });
            res.json({ success: true });
        } catch (error) {
            console.error('DeleteMedia PropertyLead Error:', error);
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = PropertyLeadController;
