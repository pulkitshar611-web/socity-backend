const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const users = await prisma.user.findMany()
  const roleModels = await prisma.roleModel.findMany()

  console.log('Linking users to RoleModels...')

  for (const user of users) {
    // Map existing enum roles to new dynamic roles
    let roleModelName = ''
    if (user.role === 'SUPER_ADMIN') roleModelName = 'Society Admin' // Or whichever matches best
    else if (user.role === 'SOCIETY_ADMIN') roleModelName = 'Society Admin'
    else if (user.role === 'PLATFORM_ADMIN') roleModelName = 'Society Admin'
    else if (user.role === 'ACCOUNTANT') roleModelName = 'Accountant'

    if (roleModelName) {
      const match = roleModels.find(rm => rm.name === roleModelName)
      if (match) {
        await prisma.user.update({
          where: { id: user.id },
          data: { roleId: match.id }
        })
        console.log(`Updated user ${user.email} to RoleModel ${roleModelName}`)
      }
    }
  }
  console.log('Update completed')
}

main().finally(() => prisma.$disconnect())
