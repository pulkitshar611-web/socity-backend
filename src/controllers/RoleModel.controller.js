const prisma = require('../lib/prisma');

class RoleController {
  static async listRoles(req, res) {
    try {
      console.log('Fetching roles for user:', req.user.role);
      const roles = await prisma.roleModel.findMany({
        include: {
          permissions: {
            select: {
              permissionId: true
            }
          },
          _count: {
            select: { users: true }
          }
        }
      });

      const formattedRoles = roles.map(role => ({
        id: role.id,
        name: role.name,
        description: role.description,
        users: role._count.users,
        permissions: role.permissions.map(p => p.permissionId)
      }));

      console.log('Formatted roles count:', formattedRoles.length);
      res.json(formattedRoles);
    } catch (error) {
      console.error('Error in listRoles:', error);
      res.status(500).json({ error: error.message });
    }
  }

  static async createRole(req, res) {
    try {
      const { name, description, permissions } = req.body;
      const role = await prisma.roleModel.create({
        data: {
          name,
          description,
          permissions: {
            create: (permissions || []).map(pId => ({
              permission: { connect: { id: pId } }
            }))
          }
        },
        include: {
          permissions: true
        }
      });
      res.status(201).json(role);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async togglePermission(req, res) {
    try {
      const { roleId } = req.params;
      const { permissionId, enabled } = req.body;
      
      console.log(`Toggle Permission: Role ${roleId}, Perm ${permissionId}, Enabled ${enabled}`);

      if (enabled) {
        await prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: parseInt(roleId),
              permissionId
            }
          },
          update: {},
          create: {
            roleId: parseInt(roleId),
            permissionId
          }
        });
      } else {
        // Use deleteMany to avoid error if record not found
        await prisma.rolePermission.deleteMany({
          where: {
            roleId: parseInt(roleId),
            permissionId
          }
        });
      }

      console.log('Permission updated successfully');
      res.json({ message: 'Permission updated successfully' });
    } catch (error) {
      console.error('Error in togglePermission:', error);
      res.status(500).json({ error: error.message });
    }
  }

  static async listPermissions(req, res) {
    try {
      console.log('Fetching permissions...');
      const permissions = await prisma.permission.findMany();
      console.log('Permissions count:', permissions.length);
      res.json(permissions);
    } catch (error) {
      console.error('Error in listPermissions:', error);
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = RoleController;
