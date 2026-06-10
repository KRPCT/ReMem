import Link from "next/link";
import { auth } from "../../../auth";
import { Button } from "@/components/ui/button";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { ThemeToggle } from "./theme-toggle";
import { Wordmark } from "@/components/brand/wordmark";

export async function SiteHeader() {
  const session = await auth();
  const isLoggedIn = !!session?.user;

  return (
    <header className="glass-nav sticky top-0 z-50">
      <div className="mx-auto flex min-h-topnav max-w-content items-center justify-between gap-4 px-4 md:px-8">
        <Wordmark />

        <nav className="hidden items-center gap-1 md:flex">
          {isLoggedIn ? (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/decks">我的牌组</Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link href="/favorites">收藏</Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link href="/settings">设置</Link>
              </Button>
              <SignOutButton />
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">登录</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/register">注册</Link>
              </Button>
            </>
          )}
          <ThemeToggle />
        </nav>

      </div>
    </header>
  );
}
