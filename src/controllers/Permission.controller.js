const prisma = require('../lib/prisma');

class PermissionController {
  static async list(req, res) {
    try {
      const permissions = await prisma.permission.findMany();
      res.json(permissions);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async create(req, res) {
    try {
      const { id, label, description } = req.body;
      const permission = await prisma.permission.create({
        data: { id, label, description }
      });
      res.status(201).json(permission);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = PermissionController;
