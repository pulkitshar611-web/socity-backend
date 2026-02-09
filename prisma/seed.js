const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')
const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database with 7 users...')

  // Create societies: main demo society + Platform (for Super Admin ↔ Individual chat)
  const society = await prisma.society.upsert({
    where: { code: 'SOC001' },
    update: {},
    create: {
      name: 'Modern Living Society',
      address: '123 Tech Park, Bangalore',
      code: 'SOC001',
      status: 'ACTIVE'
    }
  })

  const platformSociety = await prisma.society.upsert({
    where: { code: 'PLATFORM' },
    update: {},
    create: {
      name: 'Platform',
      address: 'Platform (chat only)',
      code: 'PLATFORM',
      status: 'ACTIVE'
    }
  })
  console.log('Platform society for cross-role chat:', platformSociety.id)

  const users = [
    { email: 'superadmin@society.com', password: 'super123', name: 'Super Admin', role: 'SUPER_ADMIN' },
    { email: 'admin@society.com', password: 'admin123', name: 'Admin User', role: 'ADMIN' },
    { email: 'resident1@society.com', password: 'resident123', name: 'John Doe', role: 'RESIDENT' },
    { email: 'resident2@society.com', password: 'resident123', name: 'Jane Smith', role: 'RESIDENT' },
    { email: 'guard@society.com', password: 'guard123', name: 'Security Guard', role: 'GUARD' },
    { email: 'vendor@society.com', password: 'vendor123', name: 'PestFree Services', role: 'VENDOR' },
    { email: 'individual@example.com', password: 'user123', name: 'Individual User', role: 'INDIVIDUAL' },
  ]

  for (const userData of users) {
    const hashedPassword = await bcrypt.hash(userData.password, 10)
    await prisma.user.upsert({
      where: { email: userData.email },
      update: {
        password: hashedPassword,
        role: userData.role,
        name: userData.name
      },
      create: {
        email: userData.email,
        password: hashedPassword,
        name: userData.name,
        role: userData.role,
        societyId: society.id,
        phone: '1234567890'
      }
    })
    console.log(`Created: ${userData.email} (${userData.role})`)
  }

  // Create some units
  const resident1User = await prisma.user.findUnique({ where: { email: 'resident1@society.com' } });

  await prisma.unit.upsert({
    where: { societyId_block_number: { societyId: society.id, block: 'A', number: '101' } },
    update: {
      ownerId: resident1User ? resident1User.id : undefined,
      status: 'OCCUPIED'
    },
    create: {
      block: 'A',
      number: '101',
      floor: 1,
      type: '3BHK',
      areaSqFt: 1500,
      societyId: society.id,
      ownerId: resident1User ? resident1User.id : undefined,
      status: 'OCCUPIED'
    }
  })

  await prisma.unit.upsert({
    where: { societyId_block_number: { societyId: society.id, block: 'A', number: '102' } },
    update: {},
    create: {
      block: 'A',
      number: '102',
      floor: 1,
      type: '2BHK',
      areaSqFt: 1200,
      societyId: society.id,
      status: 'VACANT'
    }
  })

  await prisma.unit.upsert({
    where: { societyId_block_number: { societyId: society.id, block: 'B', number: '101' } },
    update: {},
    create: {
      block: 'B',
      number: '101',
      floor: 1,
      type: '3BHK',
      areaSqFt: 1800,
      societyId: society.id,
      status: 'VACANT'
    }
  })

  await prisma.unit.upsert({
    where: { societyId_block_number: { societyId: society.id, block: 'C', number: '143' } },
    update: {},
    create: {
      block: 'C',
      number: '143',
      floor: 1,
      type: '3BHK',
      areaSqFt: 1800,
      societyId: society.id,
      status: 'VACANT'
    }
  })

  // Create Service Categories
  await prisma.serviceCategory.createMany({
    data: [
      {
        id: 'pest_control',
        name: 'Pest Control',
        description: 'Professional termite and pest management services',
        icon: 'Shield',
        color: 'blue'
      },
      {
        id: 'cleaning',
        name: 'Deep Cleaning',
        description: 'Home and sofa deep cleaning services',
        icon: 'Wrench',
        color: 'green'
      }
    ],
    skipDuplicates: true
  });

  await prisma.serviceVariant.createMany({
    data: [
      { name: 'General Pest', price: 999, categoryId: 'pest_control' },
      { name: 'Termite Treatment', price: 4999, categoryId: 'pest_control' },
      { name: 'Full Home Clean', price: 2999, categoryId: 'cleaning' }
    ],
    skipDuplicates: true
  });

  await prisma.serviceInquiry.createMany({
    data: [
      {
        serviceName: 'General Pest',
        serviceId: 'pest_control',
        status: 'PENDING',
        type: 'BOOKING',
        societyId: society.id
      },
      {
        serviceName: 'Full Home Clean',
        serviceId: 'cleaning',
        status: 'CONFIRMED',
        vendorName: 'Premium Cleaners',
        type: 'BOOKING',
        societyId: society.id
      }
    ],
    skipDuplicates: true
  });

  // Create some marketplace items
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (admin) {
    await prisma.marketplaceItem.createMany({
      data: [
        {
          title: 'Wooden Dining Table',
          description: 'Solid teak wood 6-seater dining table in excellent condition.',
          price: 15000,
          originalPrice: 25000,
          condition: 'like_new',
          type: 'SELL',
          category: 'furniture',
          status: 'AVAILABLE',
          ownerId: admin.id,
          societyId: society.id,
        },
        {
          title: 'Mountain Bike',
          description: 'Hero Sprint mountain bike, 21 gears, sparingly used.',
          price: 8000,
          originalPrice: 12000,
          condition: 'good',
          type: 'SELL',
          category: 'vehicles',
          status: 'AVAILABLE',
          ownerId: admin.id,
          societyId: society.id,
        }
      ],
      skipDuplicates: true
    });
  }

  await prisma.emergencyLog.createMany({
    data: [
      {
        visitorName: 'Unknown Delivery',
        visitorPhone: '9876543210',
        residentName: 'John Doe',
        unit: 'A-101',
        isEmergency: true,
        reason: 'Unauthorized entry attempt',
        barcodeId: 'EB-12345',
        societyId: society.id
      }
    ],
    skipDuplicates: true
  });

  // Create Societies
  await prisma.society.upsert({
    where: { code: 'PALM1234' },
    update: {},
    create: {
      name: 'Palm Gardens',
      city: 'Chennai',
      state: 'Tamil Nadu',
      code: 'PALM1234',
      status: 'PENDING',
      subscriptionPlan: 'PROFESSIONAL',
      address: 'Old Mahabalipuram Rd, Chennai'
    }
  });

  // Create Amenities
  const clubHouse = await prisma.amenity.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      name: 'Clubhouse',
      type: 'hall',
      description: 'Perfect for parties and social gatherings.',
      capacity: 100,
      chargesPerHour: 500,
      availableDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      timings: { start: '09:00', end: '22:00' },
      status: 'available',
      societyId: society.id
    }
  });

  const pool = await prisma.amenity.upsert({
    where: { id: 2 },
    update: {},
    create: {
      id: 2,
      name: 'Swimming Pool',
      type: 'pool',
      description: 'Olympic size pool.',
      capacity: 50,
      chargesPerHour: 0,
      availableDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      timings: { start: '06:00', end: '20:00' },
      status: 'available',
      societyId: society.id
    }
  });

  // Create Amenity Booking for Resident 1
  const resident1 = await prisma.user.findFirst({ where: { email: 'resident1@society.com' } });
  if (resident1) {
    await prisma.amenityBooking.create({
      data: {
        userId: resident1.id,
        amenityId: clubHouse.id,
        date: new Date(),
        startTime: '18:00',
        endTime: '21:00',
        purpose: 'Birthday Party',
        amountPaid: 1500,
        status: 'CONFIRMED'
      }
    });

    // Create Emergency Contact
    await prisma.emergencyContact.create({
      data: {
        residentId: resident1.id,
        name: 'Jane Doe',
        phone: '9876543211',
        category: 'Family'
      }
    });
  }

  // Create Vehicles
  await prisma.unitVehicle.createMany({
    data: [
      {
        societyId: society.id,
        unitId: (await prisma.unit.findFirst({ where: { societyId: society.id } })).id,
        type: 'Car',
        number: 'KA-01-AB-1234',
        make: 'Honda City',
        color: 'Silver',
        ownerName: 'John Doe',
        parkingSlot: 'P-A-101',
        status: 'verified'
      },
      {
        societyId: society.id,
        unitId: (await prisma.unit.findFirst({ where: { societyId: society.id } })).id,
        type: 'Two Wheeler',
        number: 'KA-01-XY-9876',
        make: 'Activa 6G',
        color: 'White',
        ownerName: 'John Doe',
        parkingSlot: 'P-A-101-B',
        status: 'verified'
      }
    ],
    skipDuplicates: true
  });

  // Create Visitors
  await prisma.visitor.createMany({
    data: [
      {
        name: 'Michael Scott',
        phone: '9988776655',
        purpose: 'Delivery',
        vehicleNo: 'KA-05-ZZ-1111',
        status: 'CHECKED_OUT',
        entryTime: new Date(new Date().setHours(10, 0, 0, 0)),
        exitTime: new Date(new Date().setHours(10, 15, 0, 0)),
        societyId: society.id,
        visitingUnitId: (await prisma.unit.findFirst({ where: { societyId: society.id } })).id,
        residentId: resident1.id
      },
      {
        name: 'Dwight Schrute',
        phone: '9988776644',
        purpose: 'Guest',
        status: 'CHECKED_IN',
        entryTime: new Date(),
        societyId: society.id,
        visitingUnitId: (await prisma.unit.findFirst({ where: { societyId: society.id } })).id,
        residentId: resident1.id
      }
    ],
    skipDuplicates: true
  });

  // Create Complaints
  await prisma.complaint.createMany({
    data: [
      {
        title: 'Street Light Not Working',
        description: 'The street light near Block A entrance is flickering.',
        category: 'electrical',
        priority: 'MEDIUM',
        status: 'OPEN',
        societyId: society.id,
        reportedById: resident1.id
      },
      {
        title: 'Water Leakage in Basement',
        description: 'Heavy leakage observed near pillar B4.',
        category: 'plumbing',
        priority: 'HIGH',
        status: 'IN_PROGRESS',
        societyId: society.id,
        reportedById: resident1.id,
        assignedToId: (await prisma.user.findFirst({ where: { role: 'GUARD' } })).id
      }
    ],
    skipDuplicates: true
  });

  // Create Notices
  await prisma.notice.createMany({
    data: [
      {
        title: 'Annual General Meeting',
        content: 'The AGM will be held on 25th of this month at the Clubhouse. All members are requested to attend.',
        audience: 'ALL',
        societyId: society.id,
        expiresAt: new Date(new Date().setDate(new Date().getDate() + 10))
      },
      {
        title: 'Pool Maintenance',
        content: 'Swimming pool will be closed for maintenance on Monday.',
        audience: 'ALL',
        societyId: society.id,
        expiresAt: new Date(new Date().setDate(new Date().getDate() + 2))
      }
    ],
    skipDuplicates: true
  });

  // Create Events
  const existingEvents = await prisma.event.findMany({
    where: { societyId: society.id }
  });

  if (existingEvents.length === 0) {
    await prisma.event.createMany({
      data: [
        {
          title: 'Diwali Celebration',
          description: 'Grand celebration with fireworks and dinner.',
          date: new Date(new Date().setDate(new Date().getDate() + 30)),
          location: 'Central Park',
          status: 'UPCOMING',
          societyId: society.id,
          category: 'festival',
          organizer: 'Cultural Committee',
          maxAttendees: 500
        }
      ],
      skipDuplicates: true
    });
  }

  // Create Parcels
  await prisma.parcel.createMany({
    data: [
      {
        courierName: 'Amazon',
        trackingNumber: 'AMZ123456789',
        status: 'PENDING',
        unitId: (await prisma.unit.findFirst({ where: { societyId: society.id } })).id,
        societyId: society.id
      }
    ],
    skipDuplicates: true
  });

  // Create Vendors (Model)
  await prisma.vendor.createMany({
    data: [
      {
        name: 'CleanMax Services',
        serviceType: 'Housekeeping',
        contact: '9876543210',
        email: 'contact@cleanmax.com',
        status: 'ACTIVE',
        societyId: society.id
      },
      {
        name: 'SecureGuard Pvt Ltd',
        serviceType: 'Security',
        contact: '9876543211',
        email: 'info@secureguard.com',
        status: 'ACTIVE',
        societyId: society.id
      }
    ],
    skipDuplicates: true
  });

  // Create Community Buzz
  await prisma.communityBuzz.createMany({
    data: [
      {
        type: 'POST',
        title: 'Lost Keys Found',
        content: 'Found a set of keys near the main gate. Please collect from security.',
        authorId: resident1.id,
        societyId: society.id
      }
    ],
    skipDuplicates: true
  });

  // Assets
  await prisma.asset.createMany({
    data: [
      {
        name: 'Generator 500kVA',
        category: 'Electrical',
        value: 500000,
        purchaseDate: new Date('2023-01-01'),
        status: 'ACTIVE',
        societyId: society.id
      }
    ],
    skipDuplicates: true
  });

  // Documents
  await prisma.document.createMany({
    data: [
      {
        title: 'Society By-Laws',
        category: 'Legal',
        fileUrl: '#',
        societyId: society.id
      }
    ],
    skipDuplicates: true
  });

  // Incidents
  const guard = await prisma.user.findFirst({ where: { role: 'GUARD' } });

  if (guard && resident1) {
    await prisma.incident.createMany({
      data: [
        {
          title: 'Unauthorized Entry Attempt',
          description: 'A person tried to enter the gate by tailgating a resident vehicle.',
          location: 'Gate 2',
          severity: 'high',
          status: 'resolved',
          societyId: society.id,
          reportedById: guard.id
        },
        {
          title: 'Water Leakage in Block B',
          description: 'Main pipe burst reported near basement parking.',
          location: 'Block B Basement',
          severity: 'medium',
          status: 'in-progress',
          societyId: society.id,
          reportedById: resident1.id
        },
        {
          title: 'Suspicious Package',
          description: 'Unclaimed bag found near the clubhouse main entrance.',
          location: 'Clubhouse',
          severity: 'critical',
          status: 'open',
          societyId: society.id,
          reportedById: guard.id
        }
      ],
      skipDuplicates: true
    });

    // Patrol Logs
    await prisma.patrolLog.createMany({
      data: [
        {
          area: 'Block A & B',
          notes: 'All clear. Checkpoints scanned.',
          status: 'completed',
          societyId: society.id,
          guardId: guard.id,
          startTime: new Date(new Date().setHours(11, 0, 0, 0))
        },
        {
          area: 'Society Perimeter',
          notes: 'South fence check complete. Minor foliage clearing required.',
          status: 'completed',
          societyId: society.id,
          guardId: guard.id,
          startTime: new Date(new Date().setHours(10, 0, 0, 0))
        },
        {
          area: 'Parking Area',
          notes: 'Vehicle KA-05-ZZ-1111 parked in wrong slot.',
          status: 'issue-found',
          societyId: society.id,
          guardId: guard.id,
          startTime: new Date(new Date().setHours(9, 0, 0, 0))
        }
      ],
      skipDuplicates: true
    });
  }

  // System Settings (super-admin) – defaults so System Settings page shows backend data
  const defaultSettings = [
    { key: 'platformName', value: 'Societly Platform' },
    { key: 'supportEmail', value: 'support@societly.com' },
    { key: 'maintenanceMode', value: 'false' },
    { key: 'newRegistrations', value: 'true' },
    { key: 'emailNotifications', value: 'true' },
    { key: 'smsNotifications', value: 'true' },
    { key: 'pushNotifications', value: 'true' },
    { key: 'twoFactorRequired', value: 'false' },
    { key: 'sessionTimeout', value: '30' },
    { key: 'maxLoginAttempts', value: '5' }
  ]
  for (const s of defaultSettings) {
    await prisma.systemSetting.upsert({
      where: { key: s.key },
      update: {},
      create: s
    })
  }
  console.log('System settings seeded')

  console.log('Seeding completed');
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
