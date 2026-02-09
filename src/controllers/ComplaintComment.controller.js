const prisma = require('../lib/prisma');

class ComplaintCommentController {
  static async create(req, res) {
    try {
      const { complaintId, message } = req.body;
      const comment = await prisma.complaintComment.create({
        data: {
          complaintId: parseInt(complaintId),
          userId: req.user.id,
          message
        },
        include: { user: true }
      });
      res.status(201).json(comment);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async listByComplaint(req, res) {
      try {
          const { complaintId } = req.params;
          const comments = await prisma.complaintComment.findMany({
              where: { complaintId: parseInt(complaintId) },
              include: { user: true },
              orderBy: { createdAt: 'asc' }
          });
          res.json(comments);
      } catch (error) {
          res.status(500).json({ error: error.message });
      }
  }
}

module.exports = ComplaintCommentController;
