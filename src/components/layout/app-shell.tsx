import type { ReactNode } from "react";
import { AppNav } from "@/components/app-nav";

export function AppShell({ children }: { children: ReactNode }) {
  return <><AppNav /><main className="shell dash">{children}</main></>;
}
