"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction, type LoginState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    loginAction,
    null
  );
  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">邮箱</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          aria-required="true"
          autoComplete="email"
          placeholder="you@example.com"
        />
      </div>
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="password">密码</Label>
          <a
            href="#"
            className="text-xs text-muted-foreground hover:text-brand hover:underline"
            aria-disabled
            title="v2 暂未实现"
          >
            忘记密码？
          </a>
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          required
          aria-required="true"
          autoComplete="current-password"
          placeholder="••••••••"
        />
      </div>
      {state?.error && (
        <p
          role="alert"
          aria-live="polite"
          className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="h-11 w-full">
        {pending ? "登录中…" : "登录"}
      </Button>
    </form>
  );
}
