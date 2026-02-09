/**
 * One-off script to add escalatedToSuperAdmin column to complaint table.
 * Run: node run_add_escalated_column.js
 * (from backend folder, with .env DATABASE_URL set)
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE `complaint` ADD COLUMN `escalatedToSuperAdmin` BOOLEAN NOT NULL DEFAULT false'
    );
    console.log('Column escalatedToSuperAdmin added to complaint table.');
  } catch (e) {
    const msg = (e.message || '').toLowerCase();
    if (msg.includes('duplicate column') || msg.includes('already exists')) {
      console.log('Column escalatedToSuperAdmin already exists. Nothing to do.');
    } else {
      console.error('Error:', e.message);
      process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main();
