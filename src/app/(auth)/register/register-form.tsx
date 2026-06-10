"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registerAction, type RegisterState } from "./actions";

export function RegisterForm() {
  const [state, action, pending] = useActionState<RegisterState, FormData>(
    registerAction,
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
        <Label htmlFor="password">密码</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          aria-required="true"
          autoComplete="new-password"
          minLength={8}
          maxLength={72}
          placeholder="至少 8 个字符"
        />
        <p className="text-xs text-muted-foreground">8-72 字符；建议使用密码管理器。</p>
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
        {pending ? "注册中…" : "创建账户"}
      </Button>
    </form>
  );
}
