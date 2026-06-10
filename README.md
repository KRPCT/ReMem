# ReMem-Reborn

基于 FSRS 改进的间隔重复算法的 Markdown 闪卡 Web 应用，支持多题型练习、Anki 风格模板、可安装为 PWA。

## 技术栈

- Next.js 15 (App Router) + React 19 + TypeScript 5
- Tailwind CSS v3.4 + shadcn/ui
- Prisma 6 + SQLite
- NextAuth v5 + bcryptjs
- ts-fsrs（在 FSRS 基础上改进的间隔重复 / 进度算法）
- CodeMirror 6 + react-markdown + KaTeX + Mermaid

## 快速开始

```bash
pnpm install
cp .env.example .env.local
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"  # 生成 NEXTAUTH_SECRET
pnpm prisma migrate dev
pnpm dev
```

访问 http://localhost:3000

## 目录结构

```
src/
├── app/         # Next.js App Router 页面与 API
├── components/  # React 组件
├── lib/         # 工具与配置
├── stores/      # Zustand 状态
├── hooks/       # 自定义 hooks
└── types/       # TypeScript 类型
prisma/          # 数据库 schema 与迁移
public/          # 静态资源
```

## 部署

单服务器 Node.js + SQLite。

## License

PolyForm Noncommercial 1.0.0 — 见 [LICENSE](./LICENSE)。**禁止任何商业用途**；允许个人 / 研究 / 教学 / 非营利使用、修改与再分发。
