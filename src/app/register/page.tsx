import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Регистрация" };

export default function RegisterPage() {
  return (
    <AuthShell
      title="Регистрация"
      subtitle="Первый аккаунт становится владельцем. Остальные — после активации владельцем."
    >
      <RegisterForm />
    </AuthShell>
  );
}
