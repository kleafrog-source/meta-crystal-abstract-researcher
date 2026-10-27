import { cn } from "@/lib/utils";

export type AMIconName = "engine" | "vocal" | "settings" | "single" | "transition" | "search" | "copy" | "generate" | "export" | "macro" | "dashboard" | "genesis" | "synthesis" | "clap" | "audioToParameter" | "morpho";
const paths: Record<AMIconName, React.ReactNode> = {
  engine: <><circle cx="32" cy="32" r="18"/><circle cx="32" cy="32" r="7"/><circle cx="32" cy="32" r="2.3" fill="currentColor"/><circle cx="32" cy="14" r="2.5"/><circle cx="48" cy="40" r="2.5"/><circle cx="16" cy="40" r="2.5"/></>,
  vocal: <><rect x="12" y="12" width="17" height="17"/><rect x="35" y="12" width="17" height="17"/><rect x="12" y="35" width="17" height="17"/><rect x="35" y="35" width="17" height="17"/><circle cx="20.5" cy="20.5" r="2.8"/><circle cx="43.5" cy="20.5" r="2.8"/><circle cx="20.5" cy="43.5" r="2.8"/><circle cx="43.5" cy="43.5" r="2.8"/></>,
  settings: <><rect x="15" y="15" width="13" height="13"/><rect x="36" y="15" width="13" height="13"/><rect x="15" y="36" width="13" height="13"/><rect x="36" y="36" width="13" height="13"/><circle cx="32" cy="32" r="3.8"/><circle cx="32" cy="32" r="1.5" fill="currentColor"/></>,
  single: <><circle cx="32" cy="32" r="18"/><circle cx="32" cy="32" r="2.4" fill="currentColor"/></>,
  transition: <><circle cx="18" cy="32" r="11.5"/><circle cx="46" cy="32" r="11.5"/><path d="M27 32h10"/><circle cx="18" cy="32" r="2.3" fill="currentColor"/><circle cx="46" cy="32" r="2.3" fill="currentColor"/></>,
  search: <><circle cx="32" cy="32" r="17"/><path d="M20 32c4-8 8 8 12 0s8 8 12 0"/><circle cx="32" cy="32" r="2.2" fill="currentColor"/></>,
  copy: <><circle cx="24" cy="32" r="12.5"/><circle cx="40" cy="32" r="12.5"/><path d="M24 32h16"/></>,
  generate: <><circle cx="16" cy="20" r="4.5"/><circle cx="48" cy="20" r="4.5"/><circle cx="16" cy="44" r="4.5"/><circle cx="48" cy="44" r="4.5"/><path d="m20.5 23 6.5 5.5m16.5-5.5L37 28.5m-16.5 12 6.5-5.5m16.5 5.5L37 35.5"/><circle cx="32" cy="32" r="7.5"/><circle cx="32" cy="32" r="2.3" fill="currentColor"/></>,
  export: <><circle cx="24" cy="32" r="9"/><circle cx="24" cy="32" r="2.4" fill="currentColor"/><path d="M38 20a16 16 0 0 1 0 24m7-30a23 23 0 0 1 0 36M50 32h8"/></>,
  macro: <><rect x="13" y="10" width="38" height="44" rx="2"/><path d="M21 23h22M21 32h18M21 41h14"/></>,
  dashboard: <><rect x="12" y="14" width="18" height="14" rx="1.5"/><rect x="34" y="14" width="18" height="22" rx="1.5"/><rect x="12" y="32" width="18" height="18" rx="1.5"/><rect x="34" y="40" width="18" height="10" rx="1.5"/></>,
  genesis: <><circle cx="32" cy="20" r="7.5"/><circle cx="21" cy="40" r="7.5"/><circle cx="43" cy="40" r="7.5"/><path d="m32 27.5-7.5 6.5m11-6.5 7.5 6.5M28 40h8" strokeWidth="1.5"/><circle cx="32" cy="20" r="2" fill="currentColor"/><circle cx="21" cy="40" r="2" fill="currentColor"/><circle cx="43" cy="40" r="2" fill="currentColor"/></>,
  synthesis: <><circle cx="25" cy="32" r="14"/><circle cx="39" cy="32" r="14"/><circle cx="32" cy="32" r="5.5" strokeWidth="1.55"/><circle cx="32" cy="32" r="2" fill="currentColor"/></>,
  clap: <><path d="M12 33c4-11 8 11 12 0s8 11 12 0" strokeWidth="1.8" strokeLinecap="round"/><circle cx="48" cy="32" r="10"/><path d="M37 32h1.5" strokeWidth="1.6" strokeLinecap="round"/><circle cx="48" cy="32" r="2.5" fill="currentColor"/></>,
  audioToParameter: <><path d="M8 42h48" strokeWidth="1.6"/><circle cx="16" cy="42" r="3.8" strokeWidth="1.5"/><circle cx="32" cy="42" r="3.8" strokeWidth="1.5"/><circle cx="48" cy="42" r="3.8" strokeWidth="1.5"/><path d="M12 28c5-10 10 10 15 0s10 10 15 0" strokeWidth="1.65" strokeLinecap="round"/></>,
  morpho: <><rect x="12" y="14" width="40" height="30" rx="2"/><path d="M19 23v12m7-15v18m7-20v22m7-19v16m7-13v10" strokeWidth="1.5"/><circle cx="32" cy="52" r="4.5" strokeWidth="1.55"/></>,
};

export function AMIcon({ name, size = "md", bright = false, className }: { name: AMIconName; size?: "sm" | "md" | "lg" | "xl"; bright?: boolean; className?: string }) {
  return <span className={cn("am-icon", `am-icon-${size}`, `ic-${name}`, bright && "is-bright", className)} aria-hidden="true"><svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg></span>;
}
