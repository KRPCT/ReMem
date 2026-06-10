// scripts/create-admin.mjs — one-off admin seeder for manual testing
// Run: node scripts/create-admin.mjs
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const email = "admin@remem.local";
const name = "Admin";
// 24-char random password (base64url-ish). Easy to copy from terminal.
const password = "Adm1n!reMem-2026-test-9K2p";

const passwordHash = await bcrypt.hash(password, 10);

const existing = await prisma.user.findUnique({ where: { email } });
if (existing) {
  console.log(`[skip] user ${email} already exists (id=${existing.id})`);
  await prisma.$disconnect();
  process.exit(0);
}

const user = await prisma.user.create({
  data: { email, name, passwordHash },
});

console.log(`[ok] created admin user`);
console.log(`  id     : ${user.id}`);
console.log(`  email  : ${user.email}`);
console.log(`  name   : ${user.name}`);
console.log(`  password: ${password}`);

await prisma.$disconnect();
