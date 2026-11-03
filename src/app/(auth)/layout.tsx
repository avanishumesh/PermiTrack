import { Brand } from "@/components/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <Brand />
        <span className="text-xs text-muted-foreground">University permission management</span>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">{children}</div>
      </main>
      <footer className="px-6 py-6 text-center text-xs text-muted-foreground">
        Access is limited to authorized university members. All approval decisions are audited.
      </footer>
    </div>
  );
}
