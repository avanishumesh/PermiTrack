import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "@/components/auth/login-form";
import { Alert } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reason?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="space-y-5">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-sm text-muted-foreground">
          Sign in to manage projects, permissions and approvals.
        </p>
      </div>
      {params.reason === "inactive" ? (
        <Alert variant="warning" title="Account inactive">
          <p>Your account has been deactivated. Contact an administrator to restore access.</p>
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Use the email address registered by your university.</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm next={params.next} />
        </CardContent>
      </Card>
    </div>
  );
}
