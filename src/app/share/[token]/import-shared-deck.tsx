"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { importSharedDeckAction } from "./actions";

/**
 * Import CTA for the public share-preview page. Logged-in users get a
 * one-click deep-clone-into-my-account button; logged-out visitors get
 * a login link that round-trips back to this same preview (callbackUrl)
 * so they can import right after authenticating.
 */
export function ImportSharedDeck({
  token,
  isLoggedIn,
}: {
  token: string;
  isLoggedIn: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!isLoggedIn) {
    return (
      <Button asChild size="lg">
        <Link href={`/login?callbackUrl=/share/${token}`}>
          <LogIn className="h-4 w-4" aria-hidden />
          <span className="ml-1">登录后导入</span>
        </Link>
      </Button>
    );
  }

  const handleImport = () => {
    setError(null);
    const fd = new FormData();
    fd.set("token", token);
    startTransition(async () => {
      const result = await importSharedDeckAction(null, fd);
      if (result?.error) {
        setError(result.error);
        return;
      }
      if (result?.deckId) {
        // Land the user on their fresh copy.
        router.push(`/decks/${result.deckId}`);
      }
    });
  };

  return (
    <div className="space-y-2">
      <Button type="button" size="lg" onClick={handleImport} disabled={pending}>
        <Download className="h-4 w-4" aria-hidden />
        <span className="ml-1">{pending ? "导入中..." : "导入到我的账户"}</span>
      </Button>
      {error ? (
        <p
          className="text-sm"
          role="alert"
          style={{ color: "hsl(var(--destructive))" }}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
