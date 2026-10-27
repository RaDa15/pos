import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import crypto from 'node:crypto';

const prisma = new PrismaClient();

interface CliArgs {
  email?: string;
  name?: string;
  password?: string;
  reset?: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--email' && args[i + 1]) {
      result.email = args[++i];
    } else if (arg === '--name' && args[i + 1]) {
      result.name = args[++i];
    } else if (arg === '--password' && args[i + 1]) {
      result.password = args[++i];
    } else if (arg === '--reset') {
      result.reset = true;
    }
  }

  return result;
}

function generateSecurePassword(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()-_=+';
  const bytes = crypto.randomBytes(24);
  let pass = '';
  for (let i = 0; i < 20; i++) {
    pass += alphabet[bytes[i] % alphabet.length];
  }
  return pass;
}

export async function createPlatformAdmin() {
  console.log('=================================================================');
  console.log('POS SYSTEM — Platform Admin Initialization');
  console.log('=================================================================');

  const nodeEnv = process.env.NODE_ENV || 'development';
  const seedDemo = process.env.SEED_DEMO_BUSINESSES;

  console.log(`Environment: ${nodeEnv}`);

  // Safety check: confirm demo seeding is disabled in production
  if (nodeEnv === 'production') {
    if (seedDemo === 'true') {
      console.error(
        'SECURITY ERROR: SEED_DEMO_BUSINESSES is set to true in a production environment!'
      );
      console.error('Refusing to execute until SEED_DEMO_BUSINESSES=false is configured in .env.');
      process.exit(1);
    }
    console.log('✓ Confirmed: SEED_DEMO_BUSINESSES is disabled for production.');
  } else {
    console.log(`Demo seeding config: SEED_DEMO_BUSINESSES=${seedDemo || 'false'}`);
  }

  const cliArgs = parseArgs();
  const email = (
    cliArgs.email ||
    process.env.PLATFORM_ADMIN_EMAIL ||
    'admin@pos.bt'
  ).trim().toLowerCase();
  const name = (cliArgs.name || 'Platform Administrator').trim();

  let plainPassword = cliArgs.password || process.env.PLATFORM_ADMIN_INITIAL_PASSWORD;
  let isGenerated = false;

  if (!plainPassword) {
    plainPassword = generateSecurePassword();
    isGenerated = true;
  }

  if (plainPassword.length < 12) {
    console.error('ERROR: Platform Admin password must be at least 12 characters.');
    process.exit(1);
  }

  const passwordHash = await argon2.hash(plainPassword, {
    type: argon2.argon2id,
  });

  const existingAdmin = await prisma.platformAdmin.findUnique({
    where: { email },
  });

  if (existingAdmin) {
    if (cliArgs.reset) {
      await prisma.platformAdmin.update({
        where: { email },
        data: {
          name,
          passwordHash,
          mustChangePassword: true,
          active: true,
        },
      });

      console.log('-----------------------------------------------------------------');
      console.log(`✓ Platform Admin password RESET successful for: ${email}`);
      console.log(`  Name: ${name}`);
      console.log(`  Must change password on first login: true`);
      if (isGenerated || cliArgs.password) {
        console.log(`  Temporary Password: ${plainPassword}`);
      }
      console.log('-----------------------------------------------------------------');
    } else {
      console.log(`ℹ Platform Admin '${email}' already exists.`);
      console.log('To update or reset password, rerun with:');
      console.log('  pnpm --filter api seed:platform-admin -- --reset');
    }
  } else {
    await prisma.platformAdmin.create({
      data: {
        email,
        name,
        passwordHash,
        mustChangePassword: true,
        active: true,
      },
    });

    console.log('-----------------------------------------------------------------');
    console.log(`✓ Platform Admin CREATED successfully!`);
    console.log(`  Email:    ${email}`);
    console.log(`  Name:     ${name}`);
    console.log(`  Status:   active`);
    console.log(`  Must change password on first login: true`);
    console.log(`  Initial Password: ${plainPassword}`);
    console.log('-----------------------------------------------------------------');
    console.log('IMPORTANT: Record these credentials securely in your password manager.');
    console.log('Platform Admin can configure TOTP Two-Factor Authentication upon sign-in.');
  }

  await prisma.$disconnect();
}

createPlatformAdmin().catch((err) => {
  console.error('Failed to create platform admin:', err);
  process.exit(1);
});
