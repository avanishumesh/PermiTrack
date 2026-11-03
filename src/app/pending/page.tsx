import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Clock3, LogOut } from "lucide-react";
import { getViewer } from "@/lib/auth";
import { Brand } from "@/components/brand";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/app/actions/auth";

export const metadata: Metadata = { title: "Account pending" };

export default async function PendingPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.profile.is_active) redirect("/dashboard");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <Brand />
        <form action={logoutAction}>
          <Button variant="ghost" size="sm" type="submit">
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </form>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
              <Clock3 className="h-5 w-5" />
            </span>
            <CardTitle className="mt-2">Your account is pending activation</CardTitle>
            <CardDescription>
              {viewer.profile.name}, your sign-in worked, but an administrator has deactivated this
              account. Permissions and documents remain protected until access is restored.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Ask your department administrator to reactivate your account. If you believe this is a
              mistake, include your registered email: <strong>{viewer.profile.email}</strong>.
            </p>
            <form action={logoutAction}>
              <Button variant="outline" type="submit">
                Sign out
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
