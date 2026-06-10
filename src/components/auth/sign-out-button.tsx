"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { signOutAction } from "./actions";

export function SignOutButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await signOutAction();
          router.push("/login");
          router.refresh();
        })
      }
    >
      {pending ? "退出中..." : "退出登录"}
    </Button>
  );
}
