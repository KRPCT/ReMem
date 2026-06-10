"use server";
import { AuthError } from "next-auth";
import { signIn } from "../../../../auth";
import { signInSchema } from "@/lib/validation";

export type LoginState = { error?: string } | null;

export async function loginAction(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "邮箱或密码错误" }; // D-07
  }
  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: "/decks",
    });
    return null;
  } catch (e) {
    if (e instanceof AuthError) {
      return { error: "邮箱或密码错误" }; // D-07 — never disclose which field failed
    }
    throw e; // re-throw NEXT_REDIRECT
  }
}
