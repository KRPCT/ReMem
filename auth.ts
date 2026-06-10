import NextAuth from "next-auth";
import { randomUUID } from "node:crypto";
import authConfig from "./auth.config";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { signInSchema } from "@/lib/validation";

// D-07: dummy bcrypt hash to equalize timing when user is missing.
// 60-char salt/hash body is required by bcrypt format; the value just needs to be valid shape.
const DUMMY_HASH = "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvali";
// D-04: 30 days
const SESSION_TTL_MS = 60 * 60 * 24 * 30 * 1000;

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 }, // D-04: 30 days
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (credentials) => {
        const parsed = signInSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.passwordHash) {
          // D-07: equalize timing even when the account does not exist
          await verifyPassword(password, DUMMY_HASH);
          return null;
        }
        const valid = await verifyPassword(password, user.passwordHash);
        if (!valid) return null;
        return { id: user.id, email: user.email, name: user.name ?? null };
      },
    }),
  ],
  callbacks: {
    // D-03: 软反作废 — JWT 续签时查 Session 表是否还有该用户的行；signOut 删行后
    // 下一次续签返回 null 强制重新登录。v1 用 userId 维度（任一 Session 行存在即
    // 视为有效）；多设备维度留 v2（schema 仍允许多行）。
    async jwt({ token, user }) {
      if (user?.id) {
        token.id = user.id;
        return token; // first sign-in: events.signIn 即将写 Session 行，跳过查
      }
      if (token.id) {
        const row = await prisma.session.findFirst({
          where: { userId: token.id as string },
        });
        if (!row) {
          // 行被 signOut 删了 → 强制重新登录
          return null;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token.id && session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
  events: {
    // D-03: 写 Session 行（任一存在即视为有效）
    async signIn({ user }) {
      if (!user?.id) return;
      await prisma.session.create({
        data: {
          sessionToken: randomUUID(),
          userId: user.id,
          expires: new Date(Date.now() + SESSION_TTL_MS),
        },
      });
    },
    // D-03: signOut 删该用户所有 Session 行
    async signOut(message) {
      const userId =
        "token" in message && message.token?.id
          ? (message.token.id as string)
          : undefined;
      if (userId) {
        await prisma.session.deleteMany({ where: { userId } });
      }
    },
  },
});
