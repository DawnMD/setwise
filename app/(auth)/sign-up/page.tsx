import type { Metadata } from "next";

import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Create an account · Setwise" };

export default function SignUpPage() {
  return <AuthForm mode="sign-up" />;
}
