import { cn } from "@/lib/utils";

export type AMIconName = "engine" | "vocal" | "settings" | "single" | "transition" | "search" | "copy" | "generate" | "export" | "macro" | "dashboard" | "genesis" | "synthesis" | "clap" | "audioToParameter" | "morpho" | "amStage" | "layerVocal" | "layerSynthesis" | "layerSpectral" | "layerSpatial" | "layerDynamics" | "layerTemporal" | "layerChaos" | "layerVector" | "layerModulation" | "whiteSpace" | "knowledgeGraph" | "crossModal";
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
  amStage: <><path d="M32 12 52 48H12L32 12Z" strokeWidth="1.9"/><path d="M32 12v24m20 12L32 36 12 48" strokeWidth="1.5"/><circle cx="32" cy="36" r="2.8" fill="currentColor"/><circle cx="32" cy="20" r="1.6" fill="currentColor"/><circle cx="42" cy="42" r="1.6" fill="currentColor"/><circle cx="22" cy="42" r="1.6" fill="currentColor"/></>,
  layerVocal: <><rect x="10" y="10" width="44" height="44" rx="5" opacity=".32"/><ellipse cx="32" cy="28" rx="12" ry="14"/><path d="M24 40c0 8 16 8 16 0M20 32c-4 0-6-4-4-6m24 6c4 0 6-4 4-6"/><circle cx="32" cy="26" r="2.2" fill="currentColor"/></>,
  layerSynthesis: <><rect x="10" y="10" width="44" height="44" rx="5" opacity=".32"/><circle cx="32" cy="32" r="8"/><circle cx="32" cy="32" r="2.8" fill="currentColor"/><ellipse cx="32" cy="32" rx="24" ry="8" transform="rotate(60 32 32)"/><ellipse cx="32" cy="32" rx="24" ry="8" transform="rotate(-60 32 32)"/><ellipse cx="32" cy="32" rx="24" ry="8"/></>,
  layerSpectral: <><rect x="10" y="10" width="44" height="44" rx="5" opacity=".32"/><path d="M14 54V28m10 26V14m10 40V22m10 32V10m10 44V32" strokeWidth="3.4"/></>,
  layerSpatial: <><rect x="10" y="10" width="44" height="44" rx="5" opacity=".32"/><circle cx="32" cy="32" r="3" fill="currentColor"/><path d="M24 22c-6 4-6 16 0 20m16-20c6 4 6 16 0 20M18 14c-10 8-10 28 0 36m28-36c10 8 10 28 0 36" strokeWidth="2.1"/></>,
  layerDynamics: <><rect x="10" y="10" width="44" height="44" rx="5" opacity=".32"/><path d="M8 50h8l8-40 12 26 10-12 12 26M8 50h50" strokeWidth="2.2"/></>,
  layerTemporal: <><rect x="10" y="10" width="44" height="44" rx="5" opacity=".32"/><ellipse cx="32" cy="32" rx="26" ry="11" strokeWidth="2"/><path d="M32 6a11 26 0 0 0 0 52m0-52a11 26 0 0 1 11 26" strokeWidth="2"/></>,
  layerChaos: <><rect x="10" y="10" width="44" height="44" rx="5" opacity=".32"/><path d="M32 32V6m0 26v26M32 32H6m26 0h26M32 32 13.5 13.5m18.5 18.5 18.5 18.5M32 32l18.5-18.5M32 32 13.5 50.5" strokeWidth="2"/><circle cx="32" cy="6" r="2.2" fill="currentColor"/><circle cx="32" cy="58" r="2.2" fill="currentColor"/><circle cx="6" cy="32" r="2.2" fill="currentColor"/><circle cx="58" cy="32" r="2.2" fill="currentColor"/><circle cx="32" cy="32" r="3" fill="currentColor"/></>,
  layerVector: <><rect x="10" y="10" width="44" height="44" rx="5" opacity=".32"/><circle cx="12" cy="52" r="4"/><path d="m12 52 40-40m-10 0h10v10" strokeWidth="2.2"/><circle cx="32" cy="32" r="2.8" fill="currentColor"/></>,
  layerModulation: <><rect x="10" y="10" width="44" height="44" rx="5" opacity=".32"/><circle cx="32" cy="32" r="18"/><circle cx="32" cy="32" r="10" opacity=".7"/><path d="M32 32V14m0 18 14 8" strokeWidth="2"/><circle cx="32" cy="32" r="3" fill="currentColor"/><circle cx="32" cy="14" r="2.2" fill="currentColor"/><circle cx="46" cy="40" r="1.8" fill="currentColor"/></>,
  whiteSpace: <><circle cx="16" cy="16" r="3"/><circle cx="32" cy="16" r="3"/><circle cx="48" cy="16" r="3"/><circle cx="16" cy="32" r="3"/><circle cx="48" cy="32" r="3"/><circle cx="16" cy="48" r="3"/><circle cx="32" cy="48" r="3"/><circle cx="48" cy="48" r="3"/><path d="M19 16h10m6 0h10M16 19v10m32-10v10M22 22h6m8 0h6m-20 20h6m8 0h6M22 22v6m0 8v6m20-20v6m0 8v6" strokeWidth="1.6"/></>,
  knowledgeGraph: <><circle cx="16" cy="18" r="5"/><circle cx="48" cy="18" r="5"/><circle cx="32" cy="34" r="5.5"/><circle cx="18" cy="50" r="4.5"/><circle cx="46" cy="50" r="4.5"/><path d="m20 21 8 9m16-9-8 9m-8 8-7 8m15-8 7 8M21 18h22" strokeWidth="1.45"/><circle cx="32" cy="34" r="2" fill="currentColor"/></>,
  crossModal: <><circle cx="16" cy="16" r="10" strokeWidth="2.4"/><circle cx="16" cy="16" r="3.5" fill="currentColor"/><rect x="38" y="6" width="20" height="20" rx="2.5" strokeWidth="2.4"/><path d="M32 58 18 40h28L32 58Z" strokeWidth="2.4" strokeLinejoin="round"/><path d="m24 22 6 8m10-6-6 6m-2 10v-6" strokeWidth="1.35"/><circle cx="32" cy="32" r="3.5" fill="currentColor"/></>,
};

const iconColorClass: Partial<Record<AMIconName, string>> = {
  whiteSpace: "ic-whitespace",
  knowledgeGraph: "ic-graph",
  crossModal: "ic-crossmodal",
};

export function AMIcon({ name, size = "md", bright = false, className }: { name: AMIconName; size?: "sm" | "md" | "lg" | "xl"; bright?: boolean; className?: string }) {
  return <span className={cn("am-icon", `am-icon-${size}`, iconColorClass[name] ?? `ic-${name}`, bright && "is-bright", className)} aria-hidden="true"><svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg></span>;
}
