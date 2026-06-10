"use server";
import { AuthError } from "next-auth";
import { signIn } from "../../../../auth";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { signUpSchema } from "@/lib/validation";

export type RegisterState = { error?: string } | null;

export async function registerAction(
  _prev: RegisterState,
  formData: FormData
): Promise<RegisterState> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: issue?.message ?? "邮箱或密码错误" };
  }
  const { email, password } = parsed.data;
  const passwordHash = await hashPassword(password);
  try {
    await prisma.user.create({ data: { email, passwordHash } });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === "P2002") {
      return { error: "邮箱或密码错误" }; // D-07: do not disclose email-exists
    }
    return { error: "注册失败，请重试" };
  }
  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: "/decks",
    });
    return null;
  } catch (e) {
    if (e instanceof AuthError) {
      return { error: "邮箱或密码错误" };
    }
    throw e; // re-throw NEXT_REDIRECT
  }
}
