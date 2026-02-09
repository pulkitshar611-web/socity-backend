const prisma = require('../lib/prisma');
const cloudinary = require('../config/cloudinary');

class ResidentController {
    static async getDashboardData(req, res) {
        try {
            const userId = req.user.id;
            const societyId = req.user.societyId;

            if (!societyId) {
                return res.status(400).json({ error: 'Resident must belong to a society' });
            }

            // 1. Society name for header
            const society = await prisma.society.findUnique({
                where: { id: societyId },
                select: { name: true }
            });

            // 2. Fetch User and Unit details
            const user = await prisma.user.findUnique({
                where: { id: userId },
                include: {
                    ownedUnits: {
                        where: { societyId },
                        include: { parkingSlots: true, members: true, petsList: true, vehicles: true }
                    },
                    rentedUnits: {
                        where: { societyId },
                        include: { parkingSlots: true, members: true, petsList: true, vehicles: true }
                    }
                }
            });

            const unit = user.ownedUnits[0] || user.rentedUnits[0];
            const isOwner = user.ownedUnits?.length > 0;

            // 3. Gate Updates (Visitors today)
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const visitorsToday = unit ? await prisma.visitor.count({
                where: {
                    visitingUnitId: unit.id,
                    createdAt: { gte: today }
                }
            }) : 0;

            const parcelsToCollect = unit ? await prisma.parcel.count({
                where: {
                    unitId: unit.id,
                    status: 'YET_TO_COLLECT'
                }
            }) : 0;

            // 4. Announcements (Notices) – audience by owner/tenant, not role
            const announcements = await prisma.notice.findMany({
                where: {
                    societyId,
                    OR: [
                        { audience: 'ALL' },
                        { audience: isOwner ? 'OWNERS' : 'TENANTS' }
                    ]
                },
                orderBy: { createdAt: 'desc' },
                take: 5
            });

            // 5. Community Buzz
            const buzz = await prisma.communityBuzz.findMany({
                where: { societyId },
                include: { author: { select: { name: true } } },
                orderBy: { createdAt: 'desc' },
                take: 5
            });

            // 6. Upcoming events (society, date >= today)
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const events = await prisma.event.findMany({
                where: { societyId, date: { gte: todayStart }, status: 'UPCOMING' },
                orderBy: { date: 'asc' },
                take: 5
            });

            // 7. Dues – pending/overdue invoices for this unit
            let duesAmount = 0;
            let duesPenalty = 0;
            if (unit) {
                const duesRows = await prisma.invoice.aggregate({
                    where: {
                        unitId: unit.id,
                        status: { in: ['PENDING', 'OVERDUE'] }
                    },
                    _sum: { amount: true, penalty: true }
                });
                duesAmount = Number(duesRows._sum?.amount ?? 0);
                duesPenalty = Number(duesRows._sum?.penalty ?? 0);
            }

            res.json({
                societyName: society?.name ?? null,
                unit: unit ? {
                    unitNo: `${unit.block} - ${unit.number}`,
                    members: unit.members?.length ?? 0,
                    pets: unit.petsList?.length ?? 0,
                    vehicles: unit.vehicles?.length ?? unit.parkingSlots?.length ?? 0
                } : null,
                gateUpdates: [
                    { type: 'Visitor', count: visitorsToday, label: 'Today', color: 'bg-purple-100 text-purple-600' },
                    { type: 'Helper', count: '0/4', label: 'In campus', color: 'bg-pink-100 text-pink-600' },
                    { type: 'Parcel', count: parcelsToCollect, label: 'Yet to collect', color: 'bg-blue-100 text-blue-600' }
                ],
                dues: {
                    amount: duesAmount,
                    penalty: duesPenalty,
                    penaltyLabel: duesPenalty > 0 ? 'Overdue-Accrued Penalty' : null
                },
                announcements: announcements.map(a => ({
                    id: a.id,
                    title: a.title,
                    description: a.content,
                    author: 'Admin',
                    time: a.createdAt,
                    type: 'announcement'
                })),
                buzz: buzz.map(b => ({
                    id: b.id,
                    type: (b.type || '').toLowerCase(),
                    title: b.title,
                    author: b.author?.name ?? 'Unknown',
                    hasResult: b.hasResult ?? false
                })),
                events: events.map(e => ({
                    id: e.id,
                    title: e.title,
                    date: e.date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
                    time: e.time || 'TBD',
                    location: e.location || 'TBD'
                }))
            });

        } catch (error) {
            console.error('Resident Dashboard Error:', error);
            res.status(500).json({ error: error.message });
        }
    }

    // --- My Unit Methods ---
    static async getUnitData(req, res) {
        try {
            const userId = req.user.id;
            const societyId = req.user.societyId;

            const user = await prisma.user.findUnique({
                where: { id: userId },
                include: {
                    ownedUnits: {
                        where: { societyId },
                        include: { members: true, vehicles: true, petsList: true, owner: true, tenant: true, parkingSlots: true }
                    },
                    rentedUnits: {
                        where: { societyId },
                        include: { members: true, vehicles: true, petsList: true, owner: true, tenant: true, parkingSlots: true }
                    }
                }
            });

            const unit = user.ownedUnits[0] || user.rentedUnits[0];
            if (!unit) return res.status(404).json({ error: 'No unit found for this resident' });

            const transformedUnit = {
                ...unit,
                unitNumber: `${unit.block}-${unit.number}`,
                area: `${unit.areaSqFt} sq.ft`,
                ownershipType: user.ownedUnits.length > 0 ? 'Owner' : 'Tenant',
                moveInDate: unit.createdAt.toLocaleDateString(),
                isRented: unit.tenantId !== null
            };

            res.json(transformedUnit);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async addFamilyMember(req, res) {
        try {
            const { unitId, name, relation, age, gender, phone, email } = req.body;
            const member = await prisma.unitMember.create({
                data: { unitId, name, relation, age: parseInt(age), gender, phone, email }
            });
            res.json(member);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async updateFamilyMember(req, res) {
        try {
            const { id } = req.params;
            const { name, relation, age, gender, phone, email } = req.body;
            const member = await prisma.unitMember.update({
                where: { id: parseInt(id) },
                data: { name, relation, age: parseInt(age), gender, phone, email }
            });
            res.json(member);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async addVehicle(req, res) {
        try {
            const { unitId, name, number, type, color, parkingSlot } = req.body;
            const vehicle = await prisma.unitVehicle.create({
                data: { unitId, name, number, type, color, parkingSlot }
            });
            res.json(vehicle);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async updateVehicle(req, res) {
        try {
            const { id } = req.params;
            const { name, number, type, color, parkingSlot } = req.body;
            const vehicle = await prisma.unitVehicle.update({
                where: { id: parseInt(id) },
                data: { name, number, type, color, parkingSlot }
            });
            res.json(vehicle);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async addPet(req, res) {
        try {
            const { unitId, name, type, breed, vaccinationStatus } = req.body;
            const pet = await prisma.unitPet.create({
                data: { unitId, name, type, breed, vaccinationStatus }
            });
            res.json(pet);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async updatePet(req, res) {
        try {
            const { id } = req.params;
            const { name, type, breed, vaccinationStatus } = req.body;
            const pet = await prisma.unitPet.update({
                where: { id: parseInt(id) },
                data: { name, type, breed, vaccinationStatus }
            });
            res.json(pet);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async getPaymentHistory(req, res) {
        try {
            const userId = req.user.id;
            const user = await prisma.user.findUnique({ where: { id: userId } });

            if (!user) return res.status(404).json({ error: 'User not found' });

            const transactions = await prisma.transaction.findMany({
                where: {
                    societyId: req.user.societyId,
                    type: 'INCOME',
                    receivedFrom: user.name // Matching by name for now
                },
                orderBy: { date: 'desc' }
            });
            res.json(transactions);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // --- SOS Methods ---
    static async triggerSOS(req, res) {
        try {
            const { type, location } = req.body;
            const userId = req.user.id;
            const societyId = req.user.societyId;

            // 1. Create the alert in the database
            const alert = await prisma.sOSAlert.create({
                data: {
                    residentId: userId,
                    societyId: societyId,
                    type,
                    location
                },
                include: {
                    resident: {
                        select: {
                            name: true,
                            phone: true,
                            ownedUnits: { select: { block: true, number: true }, take: 1 },
                            rentedUnits: { select: { block: true, number: true }, take: 1 }
                        }
                    }
                }
            });

            // 2. Emit Real-time Notification
            try {
                const { getIO } = require('../lib/socket');
                const io = getIO();

                // Construct a standardized payload for the frontend overlay
                const notificationPayload = {
                    id: alert.id,
                    type: alert.type,
                    title: `SOS: ${alert.type.toUpperCase()}`,
                    description: `Emergency reported by ${alert.resident.name} at ${alert.location}`,
                    unit: alert.location, // or construct from resident units
                    residentName: alert.resident.name,
                    residentPhone: alert.resident.phone,
                    societyId: alert.societyId,
                    createdAt: alert.createdAt,
                    source: 'SOS_BUTTON'
                };

                // Notify local society (Admins/Security)
                io.to(`society_${societyId}`).emit('new_emergency_alert', notificationPayload);

                // Notify Super Admins globally
                io.to('platform_admin').emit('new_emergency_alert', notificationPayload);

                console.log(`SOS Alert emitted for society_${societyId}`);
            } catch (socketError) {
                console.error('Socket emit failed:', socketError.message);
            }

            // Create in-app Notification for all Super Admins (and society admins) so they see it in bell
            try {
                const superAdmins = await prisma.user.findMany({
                    where: { role: 'SUPER_ADMIN' },
                    select: { id: true }
                });
                const societyAdmins = await prisma.user.findMany({
                    where: { societyId, role: { in: ['ADMIN', 'COMMITTEE'] } },
                    select: { id: true }
                });
                const notifyUserIds = [...new Set([
                    ...superAdmins.map(u => u.id),
                    ...societyAdmins.map(u => u.id)
                ])];
                const title = `SOS: ${(type || 'EMERGENCY').toUpperCase()}`;
                const description = `Emergency reported by ${alert.resident.name} at ${location || 'N/A'}`;
                for (const uid of notifyUserIds) {
                    await prisma.notification.create({
                        data: {
                            userId: uid,
                            title,
                            description,
                            type: 'emergency',
                            read: false
                        }
                    });
                }
            } catch (notifErr) {
                console.error('SOS: notification create failed', notifErr.message);
            }

            // Create EmergencyLog entry so it shows on Super Admin Emergency Logs page
            try {
                const unitStr = location || (alert.resident?.ownedUnits?.[0] ? `${alert.resident.ownedUnits[0].block}-${alert.resident.ownedUnits[0].number}` : null) || (alert.resident?.rentedUnits?.[0] ? `${alert.resident.rentedUnits[0].block}-${alert.resident.rentedUnits[0].number}` : null) || 'N/A';
                await prisma.emergencyLog.create({
                    data: {
                        visitorName: 'SOS – ' + (alert.resident?.name || 'User'),
                        visitorPhone: alert.resident?.phone || 'N/A',
                        residentName: alert.resident?.name || 'N/A',
                        unit: unitStr,
                        isEmergency: true,
                        societyId: societyId,
                        reason: `SOS triggered: ${(type || 'EMERGENCY').toUpperCase()} at ${location || unitStr}`,
                        barcodeId: 'SOS_TRIGGER'
                    }
                });
            } catch (logErr) {
                console.error('SOS: EmergencyLog create failed', logErr.message);
            }

            res.json(alert);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async getSOSData(req, res) {
        try {
            const userId = req.user.id;
            const contacts = await prisma.emergencyContact.findMany({ where: { residentId: userId } });
            const alerts = await prisma.sOSAlert.findMany({
                where: { residentId: userId },
                orderBy: { createdAt: 'desc' },
                take: 10
            });
            res.json({ contacts, alerts });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async addEmergencyContact(req, res) {
        try {
            const { name, phone, category } = req.body;
            const contact = await prisma.emergencyContact.create({
                data: {
                    residentId: req.user.id,
                    name,
                    phone,
                    category: category || 'custom'
                }
            });
            res.json(contact);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // --- Helpdesk Methods ---
    static async getTickets(req, res) {
        try {
            const { role, societyId, id: userId } = req.user;
            const where = { societyId };

            // Visibility Logic
            if (role === 'RESIDENT') {
                where.reportedById = userId;
            } else if (role === 'ADMIN' || role === 'COMMITTEE') {
                // Admins/Committee see all public tickets, 
                // OR private tickets assigned to them, 
                // OR private tickets they reported
                where.OR = [
                    { isPrivate: false },
                    { assignedToId: userId },
                    { reportedById: userId }
                ];
            } else if (role === 'SUPER_ADMIN') {
                // Super Admins see public tickets OR admin-escalated complaints
                where.OR = [
                    { isPrivate: false },
                    { escalatedToSuperAdmin: true }
                ];
            }

            const tickets = await prisma.complaint.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                include: {
                    reportedBy: {
                        select: {
                            name: true,
                            role: true,
                            profileImg: true // Useful for UI avatar
                        }
                    }
                }
            });
            res.json(tickets);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async getTicket(req, res) {
        try {
            const { id } = req.params;
            const ticket = await prisma.complaint.findUnique({
                where: { id: parseInt(id) },
                include: {
                    reportedBy: { select: { name: true } },
                    // messages: { include: { sender: { select: { name: true, role: true } } } } // If messages are related
                }
            });

            if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

            // Authorization check
            if (ticket.reportedById !== req.user.id && req.user.role !== 'SUPER_ADMIN' && req.user.role !== 'ADMIN') {
                return res.status(403).json({ error: 'Unauthorized' });
            }

            res.json(ticket);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async createTicket(req, res) {
        try {
            const { title, description, category, priority, isPrivate, vendorId } = req.body;
            const isAdminEscalation = (req.user.role === 'ADMIN' || req.user.role === 'COMMITTEE');
            const ticket = await prisma.complaint.create({
                data: {
                    title,
                    description,
                    category,
                    priority: priority?.toUpperCase() || 'MEDIUM',
                    reportedById: req.user.id,
                    societyId: req.user.societyId,
                    status: 'OPEN',
                    isPrivate: isAdminEscalation ? true : (isPrivate ?? false),
                    escalatedToSuperAdmin: isAdminEscalation,
                    vendorId: isAdminEscalation ? null : (vendorId != null ? parseInt(vendorId, 10) : null)
                }
            });
            res.json(ticket);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // --- Marketplace ---
    static async getMarketItems(req, res) {
        try {
            const items = await prisma.marketplaceItem.findMany({
                where: { societyId: req.user.societyId },
                include: {
                    owner: {
                        select: {
                            id: true,
                            name: true,
                            ownedUnits: {
                                select: { block: true, number: true },
                                take: 1
                            }
                        }
                    }
                },
                orderBy: { createdAt: 'desc' }
            });
            res.json(items);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async createMarketItem(req, res) {
        try {
            const { title, description, price, originalPrice, condition, category, type, priceType } = req.body;
            let images = [];

            // Handle image upload if file exists
            if (req.file) {
                try {
                    const result = await new Promise((resolve, reject) => {
                        const uploadStream = cloudinary.uploader.upload_stream(
                            {
                                folder: 'marketplace_items',
                                resource_type: 'image'
                            },
                            (error, result) => {
                                if (error) reject(error);
                                else resolve(result);
                            }
                        );
                        uploadStream.end(req.file.buffer);
                    });
                    images.push(result.secure_url);
                } catch (uploadError) {
                    console.error('Cloudinary upload error:', uploadError);
                    return res.status(500).json({ error: 'Failed to upload image' });
                }
            }

            const item = await prisma.marketplaceItem.create({
                data: {
                    ownerId: req.user.id,
                    societyId: req.user.societyId,
                    title,
                    description,
                    price: parseFloat(price),
                    originalPrice: originalPrice ? parseFloat(originalPrice) : null,
                    condition: condition || 'Good',
                    category: category || 'Others',
                    type: type || 'SELL',
                    priceType: priceType || 'fixed',
                    status: 'AVAILABLE',
                    images: images.length > 0 ? images : null
                }
            });
            res.json(item);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async updateMarketItemStatus(req, res) {
        try {
            const { id } = req.params;
            const { status } = req.body;

            const item = await prisma.marketplaceItem.findUnique({ where: { id: parseInt(id) } });
            if (!item) {
                return res.status(404).json({ error: 'Item not found' });
            }
            if (item.ownerId !== req.user.id) {
                return res.status(403).json({ error: 'Unauthorized' });
            }

            const updated = await prisma.marketplaceItem.update({
                where: { id: parseInt(id) },
                data: { status }
            });
            res.json(updated);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async deleteMarketItem(req, res) {
        try {
            const { id } = req.params;
            const item = await prisma.marketplaceItem.findUnique({ where: { id: parseInt(id) } });

            if (!item) {
                return res.status(404).json({ error: 'Item not found' });
            }
            if (item.ownerId !== req.user.id && req.user.role !== 'ADMIN' && req.user.role !== 'SUPER_ADMIN') {
                return res.status(403).json({ error: 'Unauthorized' });
            }

            await prisma.marketplaceItem.delete({ where: { id: parseInt(id) } });
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // --- Services --- (Resident + Individual: own inquiries; Individual has societyId null)
    static async getServices(req, res) {
        try {
            const categories = await prisma.serviceCategory.findMany({ include: { variants: true } });
            const where = { residentId: req.user.id };
            if (req.user.societyId != null) where.societyId = req.user.societyId;
            else where.societyId = null;
            const myRequests = await prisma.serviceInquiry.findMany({
                where,
                orderBy: { createdAt: 'desc' }
            });
            res.json({ categories, myRequests });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async createServiceInquiry(req, res) {
        try {
            const { serviceId, serviceName, type, preferredDate, preferredTime, notes, phone, pincode } = req.body;
            const role = (req.user.role || '').toUpperCase();
            const isIndividual = role === 'INDIVIDUAL';

            // Individual: pincode is mandatory for vendor assignment
            if (isIndividual) {
                const pin = (pincode ?? '').toString().trim();
                if (!pin || pin.length < 5 || pin.length > 10) {
                    return res.status(400).json({ error: 'PIN Code is required for service requests. Please enter a valid PIN Code (e.g. 6 digits).' });
                }
            }

            const inquiry = await prisma.serviceInquiry.create({
                data: {
                    residentId: req.user.id,
                    societyId: req.user.societyId,
                    serviceId: serviceId || null,
                    serviceName,
                    type,
                    preferredDate,
                    preferredTime,
                    notes,
                    phone: phone || req.user.phone,
                    pincode: isIndividual ? (pincode ?? '').toString().trim() : null,
                    status: 'PENDING'
                }
            });

            // Notification Logic (Self-excluded)
            try {
                const superAdmins = await prisma.user.findMany({
                    where: { role: 'SUPER_ADMIN' },
                    select: { id: true }
                });

                let adminIds = superAdmins.map(a => a.id);

                if (req.user.societyId) {
                    const societyAdmins = await prisma.user.findMany({
                        where: {
                            societyId: req.user.societyId,
                            role: { in: ['ADMIN', 'COMMITTEE'] }
                        },
                        select: { id: true }
                    });
                    adminIds = [...adminIds, ...societyAdmins.map(a => a.id)];
                }

                // Filter out the creator (User/Admin who made the request)
                adminIds = adminIds.filter(id => id !== req.user.id);
                // Remove duplicates
                adminIds = [...new Set(adminIds)];

                if (adminIds.length > 0) {
                    await prisma.notification.createMany({
                        data: adminIds.map(id => ({
                            userId: id,
                            title: type === "CALLBACK" ? "New Callback Request" : "New Service Booking",
                            description: `${req.user.name} ${type === "CALLBACK" ? 'requested callback' : 'booked'} for ${serviceName}`,
                            type: type === "CALLBACK" ? "callback_request" : "service_booking",
                            metadata: {
                                inquiryId: inquiry.id,
                                serviceName,
                                residentName: req.user.name,
                                type
                            }
                        }))
                    });
                }
            } catch (notifError) {
                console.error('Notification Error:', notifError);
                // Don't fail the request if notification fails
            }

            res.json(inquiry);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // --- Amenities ---
    static async getAmenities(req, res) {
        try {
            const societyId = parseInt(req.user.societyId);
            const amenities = await prisma.amenity.findMany({ where: { societyId } });

            const bookingWhere = req.user.role === 'ADMIN' ? {
                amenity: { societyId }
            } : {
                userId: req.user.id
            };

            const myBookings = await prisma.amenityBooking.findMany({
                where: bookingWhere,
                include: {
                    amenity: true,
                    user: {
                        select: {
                            id: true,
                            name: true,
                            ownedUnits: { select: { block: true, number: true }, take: 1 },
                            rentedUnits: { select: { block: true, number: true }, take: 1 }
                        }
                    }
                },
                orderBy: { date: 'desc' }
            });
            res.json({ amenities, myBookings });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async bookAmenity(req, res) {
        try {
            const { amenityId, date, startTime, endTime, purpose, amount } = req.body;
            const booking = await prisma.amenityBooking.create({
                data: {
                    userId: req.user.id,
                    amenityId: parseInt(amenityId),
                    date: new Date(date),
                    startTime,
                    endTime,
                    purpose,
                    amountPaid: parseFloat(amount) || 0,
                    status: 'PENDING'
                }
            });
            res.json(booking);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // --- Community ---
    static async getCommunityFeed(req, res) {
        try {
            const posts = await prisma.communityBuzz.findMany({
                where: { societyId: parseInt(req.user.societyId) },
                include: {
                    author: {
                        select: {
                            name: true,
                            role: true,
                            profileImg: true,
                            ownedUnits: {
                                select: {
                                    block: true,
                                    number: true
                                },
                                take: 1
                            }
                        }
                    },
                    comments: {
                        include: {
                            author: {
                                select: {
                                    name: true,
                                    profileImg: true
                                }
                            }
                        },
                        orderBy: { createdAt: 'desc' }
                    },
                    likedBy: {
                        where: { userId: parseInt(req.user.id) },
                        select: { userId: true }
                    }
                },
                orderBy: { createdAt: 'desc' }
            });

            const formattedPosts = posts.map(post => ({
                ...post,
                isLiked: post.likedBy.length > 0
            }));

            res.json(formattedPosts);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async createPost(req, res) {
        try {
            const { title, content, type } = req.body;
            let imageUrls = [];

            console.log('Create Post Request:', { title, content, type, hasFile: !!req.file });

            // Handle image upload if file exists
            if (req.file) {
                console.log('File received:', { filename: req.file.originalname, size: req.file.size });
                try {
                    const result = await new Promise((resolve, reject) => {
                        const uploadStream = cloudinary.uploader.upload_stream(
                            {
                                folder: 'community_posts',
                                resource_type: 'image'
                            },
                            (error, result) => {
                                if (error) reject(error);
                                else resolve(result);
                            }
                        );
                        uploadStream.end(req.file.buffer);
                    });
                    imageUrls.push(result.secure_url);
                    console.log('Cloudinary upload success:', result.secure_url);
                } catch (uploadError) {
                    console.error('Cloudinary upload error:', uploadError);
                    return res.status(500).json({ error: 'Failed to upload image' });
                }
            } else {
                console.log('No file in request');
            }

            const post = await prisma.communityBuzz.create({
                data: {
                    societyId: parseInt(req.user.societyId),
                    authorId: parseInt(req.user.id),
                    title: title || content?.substring(0, 50) || type || 'Post',
                    content,
                    type: type || 'POST',
                    imageUrls: imageUrls.length > 0 ? imageUrls : null
                },
                include: {
                    author: {
                        select: {
                            name: true,
                            role: true,
                            profileImg: true,
                            ownedUnits: {
                                select: {
                                    block: true,
                                    number: true
                                },
                                take: 1
                            }
                        }
                    }
                }
            });
            res.json(post);
        } catch (error) {
            console.error('Error creating post:', error);
            res.status(500).json({ error: error.message });
        }
    }

    static async createCommunityComment(req, res) {
        try {
            const { buzzId, content } = req.body;
            const comment = await prisma.communityComment.create({
                data: {
                    buzzId: parseInt(buzzId),
                    authorId: parseInt(req.user.id),
                    content
                },
                include: {
                    author: {
                        select: {
                            name: true,
                            profileImg: true
                        }
                    }
                }
            });
            res.json(comment);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async updatePost(req, res) {
        try {
            const { id } = req.params;
            const { title, content, type } = req.body;

            // Check if post exists and user is the author
            const existingPost = await prisma.communityBuzz.findUnique({
                where: { id: parseInt(id) }
            });

            if (!existingPost) {
                return res.status(404).json({ error: 'Post not found' });
            }

            if (existingPost.authorId !== req.user.id) {
                return res.status(403).json({ error: 'Unauthorized to edit this post' });
            }

            const updatedPost = await prisma.communityBuzz.update({
                where: { id: parseInt(id) },
                data: {
                    title: title || content?.substring(0, 50) || type || 'Post',
                    content,
                    type: type || 'POST'
                },
                include: {
                    author: {
                        select: {
                            name: true,
                            role: true,
                            profileImg: true,
                            ownedUnits: {
                                select: {
                                    block: true,
                                    number: true
                                },
                                take: 1
                            }
                        }
                    }
                }
            });
            res.json(updatedPost);
        } catch (error) {
            console.error('Update post error:', error);
            res.status(500).json({ error: error.message });
        }
    }

    static async deletePost(req, res) {
        try {
            const { id } = req.params;

            // Check if post exists and user is the author
            const existingPost = await prisma.communityBuzz.findUnique({
                where: { id: parseInt(id) }
            });

            if (!existingPost) {
                return res.status(404).json({ error: 'Post not found' });
            }

            if (existingPost.authorId !== req.user.id && req.user.role !== 'ADMIN' && req.user.role !== 'SUPER_ADMIN') {
                return res.status(403).json({ error: 'Unauthorized to delete this post' });
            }

            // Delete related likes and comments first
            await prisma.buzzLike.deleteMany({ where: { buzzId: parseInt(id) } });
            await prisma.communityComment.deleteMany({ where: { buzzId: parseInt(id) } });

            // Delete the post
            await prisma.communityBuzz.delete({
                where: { id: parseInt(id) }
            });

            res.json({ success: true, message: 'Post deleted successfully' });
        } catch (error) {
            console.error('Delete post error:', error);
            res.status(500).json({ error: error.message });
        }
    }

    static async toggleLike(req, res) {
        try {
            const { buzzId } = req.body;
            const userId = req.user.id;

            const existingLike = await prisma.buzzLike.findUnique({
                where: {
                    buzzId_userId: {
                        buzzId: parseInt(buzzId),
                        userId: parseInt(userId)
                    }
                }
            });

            if (existingLike) {
                // Unlike
                await prisma.buzzLike.delete({
                    where: {
                        buzzId_userId: {
                            buzzId: parseInt(buzzId),
                            userId: parseInt(userId)
                        }
                    }
                });
                await prisma.communityBuzz.update({
                    where: { id: parseInt(buzzId) },
                    data: { likes: { decrement: 1 } }
                });
                res.json({ liked: false });
            } else {
                // Like
                await prisma.buzzLike.create({
                    data: {
                        buzzId: parseInt(buzzId),
                        userId: parseInt(userId)
                    }
                });
                await prisma.communityBuzz.update({
                    where: { id: parseInt(buzzId) },
                    data: { likes: { increment: 1 } }
                });
                res.json({ liked: true });
            }
        } catch (error) {
            console.error('Like toggle error:', error);
            res.status(500).json({ error: error.message });
        }
    }

    // --- Guidelines ---
    static async getGuidelines(req, res) {
        try {
            const guidelines = await prisma.communityGuideline.findMany({
                where: { societyId: req.user.societyId }
            });
            res.json(guidelines);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = ResidentController;
