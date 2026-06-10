import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUserId } from "@/lib/auth-helpers";
import { ZhTitle } from "@/components/typography/zh-title";
import { ZhCaption } from "@/components/typography/zh-caption";
import { TypeAccentForm } from "./type-accent-form";

export default async function SettingsPage() {
  await requireUserId();

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

      <TypeAccentForm />
    </main>
  );
}
