import { AuthShell } from "@/components/layout/auth-shell";
import { RegisterForm } from "./register-form";

export default function RegisterPage() {
  return (
    <AuthShell
      titleZh="创建 ReMem 账户"
      titleEn="CREATE ACCOUNT"
      subtitle="几秒钟即可开始你的学习旅程"
      footerPrompt="已有账号？"
      footerLinkText="直接登录"
      footerLinkHref="/login"
    >
      <RegisterForm />
    </AuthShell>
  );
}
