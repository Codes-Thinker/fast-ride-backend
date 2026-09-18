import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';

dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  // Global validation pipe...
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Seed admin user
  await seedAdminUser(app);

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`✅ Application is running on: http://localhost:${port}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
}

async function seedAdminUser(app: any) {
  try {
    const userRepository = app.get('UserRepository');
    if (!userRepository) {
      console.log('⏭️  UserRepository not available for seeding');
      return;
    }

    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminEmail || !adminPassword) {
      console.log('⏭️  Admin credentials not provided in .env');
      return;
    }

    // Check if admin already exists---
    const existingAdmin = await userRepository.findOne({
      where: { email: adminEmail },
    });

    if (existingAdmin) {
      // Update admin user to ensure proper verification status
      if (!existingAdmin.is_email_verified || !existingAdmin.is_admin || !existingAdmin.is_active) {
        existingAdmin.is_email_verified = true;
        existingAdmin.is_active = true;
        existingAdmin.is_admin = true;
        await userRepository.save(existingAdmin);
        console.log(`✅ Admin user updated: ${adminEmail}`);
      } else {
        console.log('✅ Admin user already exists and is properly configured');
      }
      return;
    }

    // Create admin user
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    const adminUser = userRepository.create({
      name: 'Admin',
      email: adminEmail,
      phone: '1234567890',
      password: hashedPassword,
      is_email_verified: true,
      is_active: true,
      is_admin: true,
    });

    await userRepository.save(adminUser);
    console.log(`✅ Admin user created: ${adminEmail}`);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('⚠️  Error seeding admin user:', errorMessage);
  }
}

bootstrap().catch((err) => {
  console.error('❌ Application failed to start:', err);
  process.exit(1);
});
