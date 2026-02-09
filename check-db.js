const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const roles = await prisma.roleModel.count()
  const permissions = await prisma.permission.count()
  const sessions = await prisma.userSession.count()
  const users = await prisma.user.findMany({ include: { roleModel: true } })

  console.log('Database Stats:')
  console.log('Roles:', roles)
  console.log('Permissions:', permissions)
  console.log('Sessions:', sessions)
  console.log('Users Roles:', users.map(u => ({ name: u.name, role: u.role, roleModel: u.roleModel?.name })))
}

main().finally(() => prisma.$disconnect())
