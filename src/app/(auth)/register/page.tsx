import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RegisterForm } from "@/components/auth/register-form";
import { Alert } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Create account" };

export default function RegisterPage() {
  return (
    <div className="space-y-5">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
        <p className="text-sm text-muted-foreground">
          Students can register directly. Staff roles are assigned by an administrator.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Student registration</CardTitle>
          <CardDescription>You will start with the student role.</CardDescription>
        </CardHeader>
        <CardContent>
          <RegisterForm />
        </CardContent>
      </Card>
      <Alert variant="info">
        <p>
          Faculty guides, department heads, lab managers, deans and administrators are created by
          the administration team.{" "}
          <Link href="/login" className="font-medium underline">
            Sign in instead
          </Link>
          .
        </p>
      </Alert>
    </div>
  );
}
