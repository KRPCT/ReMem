import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mocks must be defined before importing the route module.
const mockAuth = vi.hoisted(() => vi.fn());
const mockMkdir = vi.hoisted(() => vi.fn());
const mockWriteFile = vi.hoisted(() => vi.fn());

vi.mock("../../../../auth", () => ({ auth: mockAuth }));
vi.mock("node:fs/promises", () => ({
  default: { mkdir: mockMkdir, writeFile: mockWriteFile },
  mkdir: mockMkdir,
  writeFile: mockWriteFile,
}));

import { POST } from "./route";

/**
 * Build a minimal Request-like object whose formData() resolves
 * synchronously in microtasks. Avoids the jsdom + undici multipart
 * parser (which can hang on synthetic File objects in unit tests).
 */
function buildStubRequest(file: File | null): Request {
  const stub = {
    headers: new Headers(),
    formData: async () => {
      const fd = new FormData();
      if (file) fd.set("file", file);
      return fd;
    },
  } as unknown as Request;
  return stub;
}

/**
 * Build a stub Request with a controlled Content-Length header.
 * The real Request constructor forbids setting `content-length` (it's
 * a reserved header name), so we have to install a custom Headers
 * object on the stub. This is the path the new WR-01 pre-check uses.
 */
function buildStubRequestWithContentLength(
  contentLength: number,
  file: File | null = null
): Request {
  const headers = new Headers();
  headers.set("content-length", String(contentLength));
  const stub = {
    headers,
    formData: async () => {
      const fd = new FormData();
      if (file) fd.set("file", file);
      return fd;
    },
  } as unknown as Request;
  return stub;
}

beforeEach(() => {
  mockAuth.mockReset();
  mockMkdir.mockClear();
  mockWriteFile.mockClear();
});

describe("POST /api/uploads", () => {
  it("returns 401 when no session", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(
      buildStubRequest(new File([new Uint8Array(10)], "test.png"))
    );
    expect(res.status).toBe(401);
  });

  it("returns 415 when file type is SVG (allowlist)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    const res = await POST(
      buildStubRequest(
        new File([new Uint8Array(10)], "evil.svg", {
          type: "image/svg+xml",
        })
      )
    );
    expect(res.status).toBe(415);
  });

  it("returns 413 when file exceeds 5 MB", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    // 6 MB > 5 MB cap
    const big = new File([new Uint8Array(6 * 1024 * 1024)], "big.png", {
      type: "image/png",
    });
    const res = await POST(buildStubRequest(big));
    expect(res.status).toBe(413);
  });

  it("rejects requests with Content-Length > 5 MB before parsing the body (WR-01)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    // 6 MB > 5 MB cap. The file body itself is small (formData() would
    // return a 1 KB File), but the Content-Length header advertises 6 MB —
    // the pre-check is designed to catch oversized bodies BEFORE the
    // multipart parser buffers them. No writeFile / mkdir should be
    // called because the handler short-circuits at the Content-Length
    // check.
    const small = new File([new Uint8Array(1024)], "small.png", {
      type: "image/png",
    });
    const res = await POST(
      buildStubRequestWithContentLength(6 * 1024 * 1024, small)
    );
    expect(res.status).toBe(413);
    expect(mockWriteFile).not.toHaveBeenCalled();
    expect(mockMkdir).not.toHaveBeenCalled();
  });

  it("allows requests at exactly the 5 MB cap", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    // Exactly 5 MB — should pass the pre-check (the `>` comparison is
    // strict), then proceed to the inner formData parse.
    const res = await POST(buildStubRequestWithContentLength(5 * 1024 * 1024));
    // The pre-check passes; the inner cap check also passes for an
    // empty FormData (no file.size > MAX_BYTES), so the handler
    // returns 400 "缺少文件" — that means the pre-check did NOT 413.
    expect(res.status).not.toBe(413);
  });

  it("happy path: writes to public/uploads/yyyy/mm/<uuid>.<ext> and returns url", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    const file = new File([new Uint8Array(100)], "ok.png", {
      type: "image/png",
    });
    // jsdom's File shim lacks arrayBuffer(); provide a minimal polyfill.
    (file as unknown as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer =
      async () => new ArrayBuffer(100);
    const res = await POST(buildStubRequest(file));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { url: string };
    expect(json.url).toMatch(
      /^\/uploads\/\d{4}\/\d{2}\/[a-f0-9-]+\.png$/
    );
    expect(mockMkdir).toHaveBeenCalledTimes(1);
    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    const writeArg = mockWriteFile.mock.calls[0]?.[0] as unknown as string;
    expect(writeArg).toMatch(
      /public[\\/]+uploads[\\/]+\d{4}[\\/]+\d{2}[\\/]+[a-f0-9-]+\.png$/
    );
  });
});
