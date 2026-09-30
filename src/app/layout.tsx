import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VideoForge — AI video production",
  description: "An adaptable, free-first video production workspace.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
