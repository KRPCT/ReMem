// prisma/seed-demo.mjs - idempotent demo seed for the Vercel/Supabase demo.
// Run once after `prisma db push`:  node prisma/seed-demo.mjs
//   Optional env: DEMO_EMAIL, DEMO_PASSWORD (defaults below).
// Creates a demo login + one sample deck with a few QA cards so visitors
// see real content immediately. Safe to run repeatedly (no duplicates).
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const email = process.env.DEMO_EMAIL ?? "demo@remem.app";
const password = process.env.DEMO_PASSWORD ?? "remem-demo-2026";
const DECK_TITLE = "ReMem 演示牌组";

const CARDS = [
  { frontContent: "什么是间隔重复 (Spaced Repetition)?", backContent: "一种按遗忘曲线安排复习时间的记忆方法:在你快要忘记时复习,用最少的次数记住最多的内容。" },
  { frontContent: "ReMem 的调度算法基于什么?", backContent: "基于 FSRS 改进的间隔重复 / 进度算法,比传统 SM-2 更贴合真实记忆曲线。" },
  { frontContent: "FSRS 里的 stability(稳定性)是什么?", backContent: "记忆的「保持时长」:稳定性越高,两次复习之间可以间隔越久。" },
  { frontContent: "ReMem 支持哪几种题型?", backContent: "问答 / 选择 / 多选 / 填空 / 判断,共五种;同一字段可绑定不同模板。" },
  { frontContent: "如何把 ReMem 安装到手机主屏?", backContent: "用浏览器打开站点,点击安装横幅(Android Chrome)或「分享 -> 添加到主屏幕」(iOS Safari),即可作为 PWA 全屏启动。" },
];

const passwordHash = await bcrypt.hash(password, 10);

const user = await prisma.user.upsert({
  where: { email },
  update: {},
  create: { email, name: "Demo", passwordHash },
});

const existing = await prisma.deck.findFirst({
  where: { userId: user.id, title: DECK_TITLE },
});

if (existing) {
  console.log(`[skip] demo deck already exists (id=${existing.id})`);
} else {
  const deck = await prisma.deck.create({
    data: {
      userId: user.id,
      title: DECK_TITLE,
      description: "ReMem 在线演示。登录后可直接开始学习,体验 FSRS 改进调度与多题型。",
      settingsMode: "simple",
      cards: {
        create: CARDS.map((c) => ({ type: "qa", frontContent: c.frontContent, backContent: c.backContent })),
      },
      studyPlan: {
        create: { userId: user.id },
      },
    },
    include: { cards: true },
  });
  console.log(`[ok] created demo deck "${deck.title}" with ${deck.cards.length} cards (id=${deck.id})`);
}

console.log(`[ok] demo login -> email: ${email}  password: ${password}`);
await prisma.$disconnect();
