import { AppNav } from "@/components/app-nav";

export default function SettingsPage() {
  return <><AppNav /><main className="shell"><section className="panel route-card"><div className="eyebrow">Settings</div><h1>Control your workspace</h1><p className="subtle">Profile, provider, and YouTube connection settings are reserved here. Credentials and OAuth tokens remain server-managed.</p></section></main></>;
}
