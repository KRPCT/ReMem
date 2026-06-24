/**
 * Client-side image -> base64 data-URI conversion for inline markdown images.
 *
 * Chosen over a file / object-store upload so embedded images survive the
 * Vercel demo's read-only serverless filesystem (the existing public/uploads
 * route is local-dev only). The cost is DB / RSC-payload bloat, bounded by
 * IMAGE_MAX_BYTES per image and the raised frontContent / backContent caps in
 * validation.ts.
 *
 * SVG is intentionally excluded (Phase 04 XSS decision); the markdown renderer
 * additionally refuses to DISPLAY any non-(png|jpe?g|gif|webp) data URI, so a
 * stray svg data URI never reaches an <img>.
 */
export const IMAGE_MAX_BYTES = 2 * 1024 * 1024; // 2 MB

const ALLOWED_IMAGE_TYPE = /^image\/(png|jpe?g|gif|webp)$/i;

export function isInlineImage(file: File): boolean {
  return ALLOWED_IMAGE_TYPE.test(file.type);
}

/**
 * Resolve to a `data:image/...;base64,...` URI for an allowed image file.
 * Rejects unsupported types and files over IMAGE_MAX_BYTES with a Chinese
 * message suitable for surfacing to the user.
 */
export async function fileToDataUri(file: File): Promise<string> {
  if (!isInlineImage(file)) {
    throw new Error("仅支持 PNG / JPG / GIF / WebP 图片");
  }
  if (file.size > IMAGE_MAX_BYTES) {
    throw new Error("图片需小于 2MB");
  }
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("读取图片失败"));
    reader.readAsDataURL(file);
  });
}
