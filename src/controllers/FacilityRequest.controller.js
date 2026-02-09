const prisma = require('../lib/prisma');

class FacilityRequestController {
    static async list(req, res) {
        try {
            const { status, category, search } = req.query;
            const where = { societyId: req.user.societyId };

            if (status) where.status = status;
            if (category && category !== 'all') where.category = category;
            if (search) {
                where.OR = [
                    { title: { contains: search } },
                    { description: { contains: search } }
                ];
            }

            const requests = await prisma.facilityRequest.findMany({
                where,
                include: {
                    user: { select: { name: true } }
                },
                orderBy: { createdAt: 'desc' }
            });
            res.json(requests);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async create(req, res) {
        try {
            const { title, description, category } = req.body;
            const request = await prisma.facilityRequest.create({
                data: {
                    title,
                    description,
                    category,
                    societyId: req.user.societyId,
                    userId: req.user.id
                }
            });
            res.status(201).json(request);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async updateStatus(req, res) {
        try {
            const { id } = req.params;
            const { status } = req.body;
            const existing = await prisma.facilityRequest.findUnique({ where: { id: parseInt(id) } });
            if (!existing) return res.status(404).json({ error: 'Request not found' });
            if (req.user.role !== 'SUPER_ADMIN' && existing.societyId !== req.user.societyId) {
                return res.status(403).json({ error: 'Access denied: request belongs to another society' });
            }
            const request = await prisma.facilityRequest.update({
                where: { id: parseInt(id) },
                data: { status }
            });
            res.json(request);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async vote(req, res) {
        try {
            const { id } = req.params;
            const { type } = req.body; // 'UP' or 'DOWN'
            const userId = req.user.id;

            const request = await prisma.facilityRequest.findUnique({
                where: { id: parseInt(id) }
            });

            if (!request) return res.status(404).json({ error: 'Request not found' });
            if (req.user.role !== 'SUPER_ADMIN' && request.societyId !== req.user.societyId) {
                return res.status(403).json({ error: 'Access denied: request belongs to another society' });
            }

            let votes = request.votes || [];
            const existingVoteIndex = votes.findIndex(v => v.userId === userId);

            if (existingVoteIndex > -1) {
                // Handle changing vote or removing vote (not strictly required by UI but good practice)
                const existingVote = votes[existingVoteIndex];
                if (existingVote.type === type) {
                    // Remove vote if same type (toggle off)
                    votes.splice(existingVoteIndex, 1);
                } else {
                    // Switch vote type
                    votes[existingVoteIndex].type = type;
                }
            } else {
                votes.push({ userId, type });
            }

            // Re-calculate counts
            const upvotes = votes.filter(v => v.type === 'UP').length;
            const downvotes = votes.filter(v => v.type === 'DOWN').length;

            const updatedRequest = await prisma.facilityRequest.update({
                where: { id: parseInt(id) },
                data: {
                    votes,
                    upvotes,
                    downvotes
                }
            });

            res.json(updatedRequest);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async getStats(req, res) {
        try {
            const societyId = req.user.societyId;
            const stats = await prisma.facilityRequest.groupBy({
                by: ['status'],
                where: { societyId },
                _count: true
            });

            const totalRequests = await prisma.facilityRequest.count({ where: { societyId } });

            res.json({
                total: totalRequests,
                byStatus: stats
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = FacilityRequestController;
