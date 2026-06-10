import { AuthShell } from "@/components/layout/auth-shell";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <AuthShell
      titleZh="登录 ReMem"
      titleEn="SIGN IN"
      subtitle="使用邮箱继续"
      footerPrompt="还没有账号？"
      footerLinkText="立即注册"
      footerLinkHref="/register"
    >
      <LoginForm />
    </AuthShell>
  );
}
