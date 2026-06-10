// scripts/create-admin.mjs — one-off user seeder for manual testing.
// Run: node scripts/create-admin.mjs
//   Optional env: ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD
//   No credential is committed: when ADMIN_PASSWORD is unset a random
//   password is generated and printed once. Copy it from the terminal.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

const prisma = new PrismaClient();

const email = process.env.ADMIN_EMAIL ?? "admin@remem.local";
const name = process.env.ADMIN_NAME ?? "Admin";
const password = process.env.ADMIN_PASSWORD ?? randomBytes(12).toString("base64url");

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
console.log(`  id      : ${user.id}`);
console.log(`  email   : ${user.email}`);
console.log(`  name    : ${user.name}`);
console.log(`  password: ${password}`);

await prisma.$disconnect();
