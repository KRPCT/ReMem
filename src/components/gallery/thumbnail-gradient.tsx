import { cn } from "@/lib/utils";

interface ThumbnailGradientProps {
  /**
   * Stable seed for the hue computation. The same seed always
   * returns the same hue, so the gradient feels intentional
   * rather than random. Use the card or deck id.
   */
  seed: string;
  className?: string;
}

/**
 * Deterministic brand-tinted gradient placeholder.
 *
 * Hue range `[120, 219]` deliberately avoids the brand sage at 162°
 * and the azure accent at 217° so the gradient never visually
 * collides with the page's primary accent color. Same seed always
 * yields the same hue (sum of charCode % 100 + 120).
 *
 * Renders a `linear-gradient(135deg, ...)` via inline `style` —
 * dynamic HSL hue numbers can't be picked up by the Tailwind JIT
 * at build time, so an inline gradient is the only honest path.
 *
 * Server-safe. No `"use client"`. No hooks.
 */
function hashToHue(seed: string): number {
  let sum = 0;
  for (let i = 0; i < seed.length; i++) {
    sum = (sum + seed.charCodeAt(i)) % 100;
  }
  // Map [0, 99] to [120, 219]. We start at 120 (sage-green territory)
  // and stop just before 220 (azure accent) so the gradient reads as
  // its own color family, not the brand palette.
  return 120 + sum;
}

export function ThumbnailGradient({ seed, className }: ThumbnailGradientProps) {
  const hue = hashToHue(seed);
  const background = `linear-gradient(135deg, hsl(${hue} 45% 55% / 0.45), hsl(${
    (hue + 20) % 360
  } 35% 45% / 0.30), hsl(${(hue + 40) % 360} 25% 35% / 0.20))`;

  return (
    <div
      aria-hidden
      className={cn("pointer-events-none", className)}
      data-hue={hue}
      style={{ background }}
    />
  );
}

export default ThumbnailGradient;
