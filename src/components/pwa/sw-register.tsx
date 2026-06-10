"use client";
import { useEffect } from "react";

/**
 * Service-worker lifecycle for the PWA.
 *
 * PROD: register `/sw.js` (network-first navigations — see public/sw.js).
 *
 * DEV: do the OPPOSITE of register. A service worker is actively harmful
 * in development — it serves cached HTML / RSC / JS chunks that no longer
 * match the live build, which shows up as "old version" pages, cache
 * bleed between builds, ChunkLoadError / hydration errors, and edits that
 * never appear. So in dev we tear down any SW + caches a previous (or a
 * production) build left installed, healing the browser so testing works.
 *
 * The dev cleanup is also what rescues a browser that already has the old
 * stale-while-revalidate SW registered: loading any page runs this effect,
 * unregisters the SW, deletes its caches, and — if the page was still
 * being served by that SW — does ONE reload so the next paint comes
 * straight from the dev server. It is self-terminating: after unregister,
 * `serviceWorker.controller` is null, so the reload never loops.
 */
export function SwRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      const hadController = !!navigator.serviceWorker.controller;
      void (async () => {
        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
          if ("caches" in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
          }
          if (hadController) window.location.reload();
        } catch {
          /* best-effort cleanup — never block the page */
        }
      })();
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  return null;
}
