import Link from "next/link";
import { Brand } from "@/components/brand";

export function SiteNav() {
  return <header className="shell"><nav className="nav"><Brand /><div className="nav-links"><Link href="/templates">Templates</Link><Link href="/login">Sign in</Link><Link className="button" href="/signup">Start creating</Link></div></nav></header>;
}
