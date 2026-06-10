# ReMem 在线 Demo 部署指南 (Supabase + Vercel + Cloudflare)

本指南把 `demo` 分支部署为一个真实可用的在线 demo。架构:

```
访客  ->  Cloudflare (CDN 加速 + WAF/DDoS, 反代)  ->  Vercel (Next.js 服务端)  ->  Supabase (Postgres, 连接池)
```

`demo` 分支与 `main` 唯一的区别:数据库由本地 SQLite 改为 Supabase Postgres
(`prisma/schema.prisma` 的 `provider` + `directUrl`,并移除了 SQLite migrations,
改用 `prisma db push`)。应用代码、账户系统、算法均与 `main` 一致。

> 三个云服务都需要你自己的账号。本仓库已把代码与配置准备好;下面的步骤需要你
> 在各自控制台完成(我无法代你登录第三方服务)。

## 前置条件

- [Supabase](https://supabase.com) 账号(免费档即可)
- [Vercel](https://vercel.com) 账号(免费档即可),并已连接 GitHub
- [Cloudflare](https://cloudflare.com) 账号 + 一个你拥有的域名(域名的 NS 已托管到 Cloudflare)
- 本机已安装 Node.js >= 20 与 pnpm 10(用于一次性建表与种子)

---

## 第 1 步: Supabase (Postgres 数据库)

1. 新建项目(New project),记下你设置的数据库密码,选一个离用户近的 Region。
2. 等待项目就绪后,进入 **Project Settings -> Database -> Connection string**:
   - 选 **Connection pooling**(Transaction 模式,端口 **6543**)作为 `DATABASE_URL`。
     在结尾追加 `?pgbouncer=true&connection_limit=1`。
   - 选 **Direct connection**(端口 **5432**)作为 `DIRECT_URL`(仅建表/迁移用)。
3. 在本机一次性建表 + 灌入演示数据:
   ```bash
   git clone -b demo https://github.com/KRPCT/ReMem.git ReMem-demo
   cd ReMem-demo
   cp .env.example .env.local
   # 编辑 .env.local,填入上面两个连接串与一个 NEXTAUTH_SECRET
   pnpm install
   pnpm db:push        # 按 schema 在 Supabase 建表
   pnpm seed:demo      # 创建演示账号 + 示例牌组(脚本会打印登录账号密码)
   ```
   `pnpm db:push` 用 `DIRECT_URL` 连接,直接把 schema 同步到 Supabase(无需 migrations)。

> 默认演示登录:`demo@remem.app` / `remem-demo-2026`(可用 `DEMO_EMAIL` /
> `DEMO_PASSWORD` 环境变量覆盖后再跑 `pnpm seed:demo`)。

---

## 第 2 步: Vercel (部署 Next.js 服务端)

1. **Add New -> Project**,导入 GitHub 仓库 `KRPCT/ReMem`。
2. **Production Branch** 选 **`demo`**(Settings -> Git -> Production Branch),
   这样 `demo` 分支的推送会触发生产部署,不影响 `main`。
3. 框架会被识别为 Next.js,**Build/Install 命令保持默认**:
   `pnpm install` 会触发 `postinstall: prisma generate`,随后 `next build`。
4. 在 **Settings -> Environment Variables** 添加(Production):
   | Key | Value |
   |---|---|
   | `DATABASE_URL` | Supabase 池化连接串(6543,带 `?pgbouncer=true&connection_limit=1`) |
   | `DIRECT_URL` | Supabase 直连串(5432) |
   | `NEXTAUTH_SECRET` | 一个 32 字节随机串 |
   | `NEXTAUTH_URL` | 你的 Cloudflare 域名,如 `https://demo.yourdomain.com` |
   | `NEXT_PUBLIC_APP_NAME` | `ReMem` |
5. **Deploy**。完成后先用 Vercel 分配的 `*.vercel.app` 地址验证能打开、能登录。

> 注意:Supabase 的池化连接(PgBouncer / Transaction 模式)是 serverless 必需的;
> 用直连串(5432)做运行时会很快耗尽连接数。`db push` / 迁移才用直连。

---

## 第 3 步: Cloudflare (CDN 加速 + DDoS 防护)

Cloudflare 的代理(橙云)无法直接套在 `*.vercel.app` 上,需要用你自己的域名 CNAME 到 Vercel。

1. 在 Vercel 项目 **Settings -> Domains** 添加你的子域名(如 `demo.yourdomain.com`),
   Vercel 会给出一条 CNAME 目标(通常是 `cname.vercel-dns.com`)。
2. 在 Cloudflare 该域名的 **DNS** 里加一条记录:
   - Type `CNAME`,Name `demo`,Target `cname.vercel-dns.com`,**Proxy status: Proxied(橙云)**。
   - 橙云开启即启用 Cloudflare 的 CDN 缓存、WAF 与 **DDoS 防护**(默认对代理流量自动生效)。
3. **SSL/TLS -> Overview** 设为 **Full (strict)**(Vercel 自带有效证书)。
4. **缓存规则**(Caching -> Cache Rules),避免缓存动态/鉴权响应导致串号:
   - 默认让 Cloudflare **Respect existing headers**(尊重源站 Cache-Control):
     Vercel 会把 `/_next/static/*` 标为长效不可变(可缓存),动态页与 RSC 标为不缓存。
   - 再加一条 **Bypass cache** 规则,匹配 `/api/*`、含 Cookie 的请求、以及 `/_next/data/*`,
     确保鉴权与 Server Action 永不被缓存。
5.(可选)开启 **Brotli 压缩**、**Always Use HTTPS**、**Bot Fight Mode**。

---

## 验证

- 打开 `https://demo.yourdomain.com`,用演示账号登录,能看到示例牌组并进入学习。
- 浏览器 DevTools -> Network:静态资源命中 Cloudflare 缓存(`cf-cache-status: HIT`),
  而 `/api/*`、登录、学习提交为 `BYPASS/DYNAMIC`。
- 在 Supabase **Table editor** 能看到 `User` / `Deck` / `Card` 等表有数据。

## 注意事项

- **不影响主项目**:`main` 仍是 SQLite 本地版;本 demo 只活在 `demo` 分支 + 你的云账号里。
- **NEXTAUTH_URL 必填**:Cloudflare 反代会改写 Host,不设它会导致登录跳转到错误域名。
- **连接池**:务必用 6543 池化串做 `DATABASE_URL`,否则 serverless 冷启动会打爆连接数。
- **演示数据**:重新 `pnpm seed:demo` 是幂等的;要清库就在 Supabase 里 drop 后重新 `db push`。
- **成本**:Supabase / Vercel / Cloudflare 免费档足够跑一个 demo;高流量再升档。
