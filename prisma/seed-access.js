const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const permissions = [
    { id: 'manage_residents', label: 'Manage Residents', description: 'Add, edit, remove residents' },
    { id: 'manage_staff', label: 'Manage Staff', description: 'Manage guards, helpers, vendors' },
    { id: 'manage_billing', label: 'Manage Billing', description: 'Create invoices, track payments' },
    { id: 'manage_security', label: 'Manage Security', description: 'Visitor logs, gate access' },
    { id: 'view_reports', label: 'View Reports', description: 'Access analytics and reports' },
    { id: 'manage_settings', label: 'Manage Settings', description: 'Configure society settings' },
  ]

  console.log('Seeding permissions...')
  for (const p of permissions) {
    await prisma.permission.upsert({
      where: { id: p.id },
      update: p,
      create: p,
    })
  }

  const defaultRoles = [
    {
      name: 'Society Admin',
      description: 'Full access to society management features',
      perms: ['manage_residents', 'manage_staff', 'manage_billing', 'view_reports'],
    },
    {
      name: 'Society Manager',
      description: 'Limited administrative access',
      perms: ['manage_residents', 'manage_staff', 'view_reports'],
    },
    {
      name: 'Accountant',
      description: 'Financial management access only',
      perms: ['manage_billing', 'view_reports'],
    },
    {
      name: 'Security Head',
      description: 'Security and visitor management',
      perms: ['manage_security', 'view_reports'],
    },
  ]

  console.log('Seeding roles...')
  for (const r of defaultRoles) {
    const role = await prisma.roleModel.upsert({
      where: { name: r.name },
      update: { description: r.description },
      create: {
        name: r.name,
        description: r.description,
      },
    })

    // Assign permissions
    for (const pId of r.perms) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: pId,
          },
        },
        update: {},
        create: {
          roleId: role.id,
          permissionId: pId,
        },
      })
    }
  }

  console.log('Seeding completed')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
