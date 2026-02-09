const prisma = require('../lib/prisma');

class RolePermissionController {
  static async assign(req, res) {
    try {
      const { roleId, permissionId } = req.body;
      const rolePermission = await prisma.rolePermission.create({
        data: {
          roleId: parseInt(roleId),
          permissionId
        }
      });
      res.status(201).json(rolePermission);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async revoke(req, res) {
    try {
      const { roleId, permissionId } = req.body;
      await prisma.rolePermission.delete({
        where: {
          roleId_permissionId: {
            roleId: parseInt(roleId),
            permissionId
          }
        }
      });
      res.json({ message: 'Permission revoked' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = RolePermissionController;
