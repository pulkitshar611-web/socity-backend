const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const societies = await prisma.society.findMany()
  console.log('Societies in DB:', societies.length)
  console.log(JSON.stringify(societies, null, 2))
}

main().finally(() => prisma.$disconnect())
