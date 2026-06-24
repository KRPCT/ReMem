import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUserId } from "@/lib/auth-helpers";
import { getUserPrefs } from "@/lib/user-settings";
import { ZhTitle } from "@/components/typography/zh-title";
import { ZhCaption } from "@/components/typography/zh-caption";
import { TypeAccentForm } from "./type-accent-form";
import { UserPrefsForm } from "./user-prefs-form";

// Auth-gated read of the account-level prefs makes this dynamic — no
// stale toggle state after a save (the action revalidates /settings).
export default async function SettingsPage() {
  const userId = await requireUserId();
  const prefs = await getUserPrefs(userId);

  return (
    <main className="mx-auto max-w-content space-y-6 px-4 py-8 md:px-8 md:py-12">
      <div className="space-y-2">
        <Link
          href="/decks"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          <span className="ml-1">返回牌组</span>
        </Link>
        <ZhCaption zh="设置" en="/SETTINGS" enFirst />
        <ZhTitle zh="设置" en="SETTINGS" size="h1" />
      </div>

      <UserPrefsForm initial={prefs} />

      <TypeAccentForm />
    </main>
  );
}
