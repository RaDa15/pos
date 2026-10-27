import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PrismaClient, EmployeeRole, TaxMode, TaxCategory, CustomerType, MovementType } from '@prisma/client';
import argon2 from 'argon2';
import { PrototypeImportSchema } from '@pos/shared';

const prisma = new PrismaClient();

interface CliArgs {
  file?: string;
  businessCode?: string;
  outputPath?: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--file' && args[i + 1]) {
      result.file = args[++i];
    } else if (arg === '--businessCode' && args[i + 1]) {
      result.businessCode = args[++i];
    } else if (arg === '--output' && args[i + 1]) {
      result.outputPath = args[++i];
    }
  }

  return result;
}

function generateTempPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  const bytes = crypto.randomBytes(12);
  let pass = 'P@ss';
  for (let i = 0; i < 8; i++) {
    pass += alphabet[bytes[i] % alphabet.length];
  }
  return pass;
}

async function generateUniqueBarcode(businessId: string): Promise<string> {
  const prefix = '20';
  for (let attempt = 0; attempt < 50; attempt++) {
    const randomDigits = Math.floor(1000000000 + Math.random() * 9000000000).toString();
    const barcode = `${prefix}${randomDigits.slice(0, 10)}`;
    const existing = await prisma.product.findFirst({
      where: { businessId, barcode },
    });
    if (!existing) return barcode;
  }
  return `20${Date.now().toString().slice(-10)}`;
}

export async function migratePilot() {
  console.log('=================================================================');
  console.log('POS SYSTEM — Pilot Business Migration Tool');
  console.log('=================================================================');

  const args = parseArgs();

  if (!args.file) {
    console.error('ERROR: Missing required --file parameter.');
    console.log('Usage:');
    console.log('  pnpm --filter api migrate:pilot -- --file <path-to-prototype.json> --businessCode <BIZ-CODE>');
    process.exit(1);
  }

  const filePath = path.resolve(process.cwd(), args.file);
  if (!fs.existsSync(filePath)) {
    console.error(`ERROR: Prototype backup file not found at: ${filePath}`);
    process.exit(1);
  }

  console.log(`Reading prototype backup from: ${filePath}...`);
  const rawContent = fs.readFileSync(filePath, 'utf-8');
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawContent);
  } catch (err) {
    console.error('ERROR: Failed to parse JSON file:', err);
    process.exit(1);
  }

  const validation = PrototypeImportSchema.safeParse(parsedJson);
  if (!validation.success) {
    console.error('ERROR: Invalid prototype backup structure:');
    console.error(JSON.stringify(validation.error.format(), null, 2));
    process.exit(1);
  }

  const payload = validation.data;
  const collections = payload.collections || {};

  // Find business
  let business;
  if (args.businessCode) {
    business = await prisma.business.findUnique({
      where: { businessCode: args.businessCode },
    });
  } else if (payload.business?.name) {
    business = await prisma.business.findFirst({
      where: { name: payload.business.name },
    });
  }

  if (!business) {
    console.error(
      `ERROR: Target business not found. Please provide an existing --businessCode (e.g. BIZ-PEMA1).`
    );
    const existing = await prisma.business.findMany({
      select: { businessCode: true, name: true, type: true },
      take: 10,
    });
    console.log('Available businesses:');
    existing.forEach((b) => console.log(`  - [${b.businessCode}] ${b.name} (${b.type})`));
    process.exit(1);
  }

  const businessId = business.id;
  console.log(`Target business: [${business.businessCode}] ${business.name}`);

  // Safety Precondition: check if sales already exist (AC-54)
  const existingSales = await prisma.sale.count({ where: { businessId } });
  if (existingSales > 0) {
    console.error(
      `ABORT: Business already has ${existingSales} existing sales recorded. Per AC-54, pilot migration is only permitted on fresh businesses before live sales commence.`
    );
    process.exit(1);
  }

  // Check if prototype was already imported
  const alreadyImported = await prisma.auditLog.findFirst({
    where: { businessId, action: 'prototype_imported' },
  });
  if (alreadyImported) {
    console.error('ABORT: This business has already completed a prototype migration.');
    process.exit(1);
  }

  console.log('Starting migration transaction...');

  interface StaffCredential {
    username: string;
    fullName: string;
    role: string;
    tempPassword: string;
  }

  const staffCredentials: StaffCredential[] = [];
  const counts = {
    products: 0,
    customers: 0,
    suppliers: 0,
    expenses: 0,
  };

  await prisma.$transaction(async (tx) => {
    // 1. Update business profile
    if (payload.business) {
      const b = payload.business;
      await tx.business.update({
        where: { id: businessId },
        data: {
          ...(b.ownerName ? { ownerName: String(b.ownerName) } : {}),
          ...(b.phone ? { phone: String(b.phone) } : {}),
          ...(b.email ? { email: String(b.email) } : {}),
          ...(b.address !== undefined ? { address: b.address ? String(b.address) : null } : {}),
          ...(b.gstNo !== undefined ? { gstNo: b.gstNo ? String(b.gstNo) : null } : {}),
          ...(b.gstNo ? { gstRegistered: true } : {}),
        },
      });
    }

    // 2. Tax Rates mapping
    const taxRateMap = new Map<string, string>();
    const existingTaxRates = await tx.taxRate.findMany({ where: { businessId } });
    const defaultTaxRate = existingTaxRates.find((t) => t.isDefault) || existingTaxRates[0];

    for (const rawTR of collections.taxrates || []) {
      const oldId = String(rawTR.id || '');
      const rateNum = Number(rawTR.rate ?? 0);
      const name = String(rawTR.name || `GST ${rateNum}%`);
      const mode = (String(rawTR.mode || 'exclusive').toLowerCase() === 'inclusive'
        ? TaxMode.inclusive
        : TaxMode.exclusive) as TaxMode;
      const category = rateNum === 0 ? TaxCategory.zero_rated : TaxCategory.standard;

      const matched = existingTaxRates.find((t) => Number(t.rate) === rateNum && t.mode === mode);
      if (matched) {
        taxRateMap.set(oldId, matched.id);
      } else {
        const createdTR = await tx.taxRate.create({
          data: {
            businessId,
            name,
            rate: rateNum,
            mode,
            category,
            effectiveDate: new Date(),
            isDefault: Boolean(rawTR.isDefault),
            active: rawTR.active !== false,
          },
        });
        taxRateMap.set(oldId, createdTR.id);
      }
    }

    // 3. Employees / Users mapping
    const employeeMap = new Map<string, string>();
    const existingEmployees = await tx.employee.findMany({ where: { businessId } });
    const existingUsernames = new Set(existingEmployees.map((e) => e.username.toLowerCase()));

    const mapRole = (roleStr: string): EmployeeRole => {
      const lower = String(roleStr || '').toLowerCase().trim();
      if (lower.includes('admin')) return EmployeeRole.admin;
      if (lower.includes('manager')) return EmployeeRole.manager;
      if (lower.includes('inventory')) return EmployeeRole.inventory_officer;
      if (lower.includes('store')) return EmployeeRole.storekeeper;
      if (lower.includes('waiter')) return EmployeeRole.waiter;
      if (lower.includes('kitchen')) return EmployeeRole.kitchen_staff;
      if (lower.includes('accountant')) return EmployeeRole.accountant;
      return EmployeeRole.cashier;
    };

    for (const rawUser of collections.users || []) {
      const oldId = String(rawUser.id || '');
      const originalUsername = String(rawUser.username || `user_${oldId}`).trim();
      const fullName = String(rawUser.fullName || originalUsername);
      const role = mapRole(String(rawUser.role || ''));

      let finalUsername = originalUsername;
      let suffix = 2;
      while (existingUsernames.has(finalUsername.toLowerCase())) {
        const matched = existingEmployees.find(
          (e) => e.username.toLowerCase() === finalUsername.toLowerCase()
        );
        if (matched && matched.role === EmployeeRole.admin && role === EmployeeRole.admin) {
          employeeMap.set(oldId, matched.id);
          finalUsername = '';
          break;
        }
        finalUsername = `${originalUsername}-${suffix}`;
        suffix++;
      }

      if (!finalUsername) continue;
      existingUsernames.add(finalUsername.toLowerCase());

      const tempPassword = generateTempPassword();
      const passwordHash = await argon2.hash(tempPassword, { type: argon2.argon2id });

      const newEmp = await tx.employee.create({
        data: {
          businessId,
          username: finalUsername,
          usernameKey: finalUsername.toLowerCase(),
          name: fullName,
          role,
          passwordHash,
          mustChangePassword: true,
          active: rawUser.active !== false,
        },
      });

      employeeMap.set(oldId, newEmp.id);
      staffCredentials.push({
        username: finalUsername,
        fullName,
        role,
        tempPassword,
      });
    }

    const defaultEmpId = existingEmployees[0]?.id || staffCredentials[0]?.username;

    // 4. Products mapping
    const productMap = new Map<string, string>();
    for (const rawProd of collections.products || []) {
      const oldId = String(rawProd.id || '');
      let barcode = rawProd.barcode ? String(rawProd.barcode).trim() : '';
      if (!barcode) {
        barcode = await generateUniqueBarcode(businessId);
      }

      const assignedTaxRateId =
        (rawProd.taxRateId ? taxRateMap.get(String(rawProd.taxRateId)) : null) ||
        defaultTaxRate?.id ||
        null;

      const createdProd = await tx.product.create({
        data: {
          businessId,
          barcode,
          name: String(rawProd.name || 'Unnamed Product'),
          sellPrice: Number(rawProd.price ?? rawProd.sellPrice ?? 0),
          purchasePrice: rawProd.costPrice !== undefined ? Number(rawProd.costPrice) : (rawProd.purchasePrice !== undefined ? Number(rawProd.purchasePrice) : null),
          stock: Number(rawProd.currentStock ?? rawProd.stock ?? 0),
          trackStock: rawProd.trackStock !== false,
          category: rawProd.category ? String(rawProd.category) : null,
          unit: 'pc',
          taxRateId: assignedTaxRateId,
          active: rawProd.active !== false,
        },
      });

      productMap.set(oldId, createdProd.id);
      counts.products++;

      if (createdProd.trackStock && createdProd.stock > 0) {
        await tx.stockMovement.create({
          data: {
            businessId,
            productId: createdProd.id,
            type: MovementType.opening_balance,
            qty: createdProd.stock,
            stockAfter: createdProd.stock,
            reason: 'Opening stock balance from prototype migration',
            actorEmployeeId: defaultEmpId,
          },
        });
      }
    }

    // 5. Customers mapping
    for (const rawCust of collections.customers || []) {
      const name = String(rawCust.name || 'Customer').trim();
      if (name.toLowerCase() === 'walk-in customer') continue;

      await tx.customer.create({
        data: {
          businessId,
          name,
          phone: rawCust.phone ? String(rawCust.phone) : null,
          type: CustomerType.retail,
          creditLimit: rawCust.creditLimit ? Number(rawCust.creditLimit) : 0,
          outstandingBalance: rawCust.currentBalance ? Number(rawCust.currentBalance) : (rawCust.outstandingBalance ? Number(rawCust.outstandingBalance) : 0),
          active: rawCust.active !== false,
        },
      });
      counts.customers++;
    }

    // 6. Suppliers mapping
    for (const rawSupp of collections.suppliers || []) {
      await tx.supplier.create({
        data: {
          businessId,
          name: String(rawSupp.name || 'Supplier'),
          contactPerson: rawSupp.contactPerson ? String(rawSupp.contactPerson) : null,
          phone: rawSupp.phone ? String(rawSupp.phone) : null,
          email: rawSupp.email ? String(rawSupp.email) : null,
          address: rawSupp.address ? String(rawSupp.address) : null,
          active: rawSupp.active !== false,
        },
      });
      counts.suppliers++;
    }

    // 7. Record audit log
    await tx.auditLog.create({
      data: {
        businessId,
        actorEmployeeId: defaultEmpId,
        actorName: 'Pilot Migration Script',
        action: 'prototype_imported',
        detail: `Migrated ${counts.products} products, ${counts.customers} customers, ${counts.suppliers} suppliers, ${staffCredentials.length} staff accounts.`,
      },
    });
  });

  console.log('-----------------------------------------------------------------');
  console.log('✓ Pilot Business Migration Successful!');
  console.log(`  • Products Imported:  ${counts.products}`);
  console.log(`  • Customers Imported: ${counts.customers}`);
  console.log(`  • Suppliers Imported: ${counts.suppliers}`);
  console.log(`  • Staff Initialized:  ${staffCredentials.length}`);
  console.log('-----------------------------------------------------------------');

  // Generate Staff Credential Handoff Markdown
  const reportFilename = args.outputPath || `PILOT-HANDOFF-${business.businessCode}.md`;
  const reportPath = path.resolve(process.cwd(), reportFilename);

  let md = `# Pilot Credential Handoff Sheet\n\n`;
  md += `**Business:** ${business.name} (\`${business.businessCode}\`)\n`;
  md += `**Migration Date:** ${new Date().toISOString().slice(0, 10)}\n`;
  md += `**Security Rule:** Every employee must change their temporary password upon their first sign-in.\n\n`;
  md += `## Staff Accounts\n\n`;
  md += `| Username | Full Name | Role | Temporary Password | Status |\n`;
  md += `|---|---|---|---|---|\n`;

  for (const s of staffCredentials) {
    md += `| \`${s.username}\` | ${s.fullName} | ${s.role} | \`${s.tempPassword}\` | Must change on 1st login |\n`;
  }

  md += `\n## Quick Start Instructions for Staff\n\n`;
  md += `1. **Access Link**: Open the POS application in your browser (Chrome or Edge recommended).\n`;
  md += `2. **Company Code**: Enter \`${business.businessCode}\` on the Company Sign-in screen.\n`;
  md += `3. **Employee Sign-in**: Enter your assigned Username and Temporary Password from the table above.\n`;
  md += `4. **Update Password**: You will be immediately prompted to set your new private password (minimum 8 characters).\n`;
  md += `5. **Barcode Scanner**: Connect your USB/Bluetooth barcode scanner or use search to find products.\n`;
  md += `6. **Support**: For any assistance or questions, contact Yuevaan IT Technologies support.\n`;

  fs.writeFileSync(reportPath, md, 'utf-8');
  console.log(`✓ Staff Credential Handoff Sheet written to: ${reportPath}`);
  console.log('=================================================================');

  await prisma.$disconnect();
}

migratePilot().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
