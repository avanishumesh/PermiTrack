import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "PermiTrack — University permission management",
    template: "%s · PermiTrack",
  },
  description:
    "A hierarchical, auditable permission-management platform for universities: dynamic forms, versioned approval workflows and role-based authority routing.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
