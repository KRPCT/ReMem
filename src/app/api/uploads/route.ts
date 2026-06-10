import { NextResponse } from "next/server";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { auth } from "../../../../auth";

const ALLOWED = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(req: Request) {
  // Defense-in-depth: middleware already protects /api/* via the
  // matcher in src/middleware.ts, but every route handler still
  // re-checks auth per CLAUDE.md (CLAUDE.md Hard rules §5).
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  // Pre-check Content-Length BEFORE calling req.formData() — the
  // latter buffers the entire multipart body into memory, so without
  // this check an attacker could POST a 10 GB file with
  // Content-Type: image/png and exhaust server memory before the
  // per-file size cap on line 60 ever runs. (WR-01)
  //
  // Content-Length can be missing for chunked transfers; the inner
  // `file.size > MAX_BYTES` check on line ~60 is the backstop for
  // that case.
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BYTES) {
    return NextResponse.json(
      { error: "文件超过 5 MB" },
      { status: 413 }
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "缺少文件" }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json(
      { error: "仅支持 png / jpg / gif / webp" },
      { status: 415 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "文件超过 5 MB" },
      { status: 413 }
    );
  }

  const ext = EXT[file.type];
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dir = join(process.cwd(), "public", "uploads", yyyy, mm);
  await mkdir(dir, { recursive: true });

  const name = `${randomUUID()}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(join(dir, name), buf);

  return NextResponse.json({ url: `/uploads/${yyyy}/${mm}/${name}` });
}
