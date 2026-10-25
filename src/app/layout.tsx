import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "FixFirst — Clarity before cost",
  description:
    "Agree on the job before agreeing on the price. Clear briefs, transparent quotes, and no unapproved extras.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
