const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkUser() {
    try {
        const user = await prisma.user.findUnique({
            where: { email: 'individual@example.com' }
        });
        if (user) {
            console.log('User found:', {
                id: user.id,
                email: user.email,
                role: user.role,
                name: user.name
            });
        } else {
            console.log('User not found: individual@example.com');

            const allUsers = await prisma.user.findMany({
                take: 10,
                select: { email: true, role: true }
            });
            console.log('Sample users in DB:', allUsers);
        }
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkUser();
