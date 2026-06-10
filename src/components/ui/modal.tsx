"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Optional secondary line under the title (e.g. a sub-eyebrow). */
  description?: string;
  children: React.ReactNode;
  /**
   * Tailwind `max-w-*` class for the modal panel. Defaults to
   * `max-w-reading` (720px) per the project design system.
   */
  size?: "sm" | "md" | "lg" | "reading";
  /**
   * Hide the default close button. Useful for confirmation flows.
   * ESC + backdrop click still work.
   */
  hideCloseButton?: boolean;
  className?: string;
}

const SIZE: Record<NonNullable<ModalProps["size"]>, string> = {
  sm: "max-w-form",
  md: "max-w-auth",
  lg: "max-w-content",
  reading: "max-w-reading",
};

/**
 * Centered frosted-glass modal.
 *
 * Uses the project's `glass-modal` utility from `globals.css` for
 * the panel surface (backdrop-blur 20px + alpha 0.85 over the page
 * bg). The page underneath dims via an 80% black overlay per the
 * DialogModal contract.
 *
 * - Focus is moved into the modal on open and restored on close.
 * - `Escape` key closes the modal.
 * - Click on the backdrop closes the modal; click on the panel
 *   does NOT (so users can drag-select text inside the modal).
 * - Scroll on the body is locked while the modal is open.
 *
 * Server-safe shell (this file declares `"use client"`; the
 * `createPortal` target is `document.body` so the modal renders
 * outside any ancestor stacking context).
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  size = "reading",
  hideCloseButton = false,
  className,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Focus + body-scroll management. The effect only runs in the
  // browser, so SSR is unaffected.
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";

    // Move focus into the panel on the next frame.
    const id = requestAnimationFrame(() => {
      panelRef.current?.focus();
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      cancelAnimationFrame(id);
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused.current?.focus();
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
    >
      {/* Backdrop — click closes. Solid dim layer (not glass) so the
          dialog reads as "above" the page per the glassmorphism
          contract. */}
      <button
        type="button"
        aria-label="关闭"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm"
        tabIndex={-1}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          "glass-modal relative z-10 max-h-[90dvh] w-full overflow-y-auto rounded-xl p-6 outline-none",
          SIZE[size],
          className
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-s">
          <div className="space-y-1">
            <h2
              id="modal-title"
              className="font-display text-fluid-h2 font-semibold leading-tight tracking-tight"
            >
              {title}
            </h2>
            {description ? (
              <p className="text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {hideCloseButton ? null : (
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭"
              className="rounded-xl p-1 text-muted-foreground transition-colors hover:bg-card/60 hover:text-foreground"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

export default Modal;
