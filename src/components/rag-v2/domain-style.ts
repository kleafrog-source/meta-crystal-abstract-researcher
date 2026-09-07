import { cn } from "@/lib/utils";

export interface DomainStyle {
  label: string;
  cardClassName: string;
  badgeClassName: string;
  accentClassName: string;
}

const DOMAIN_STYLES: Array<{
  match: RegExp;
  style: DomainStyle;
}> = [
  {
    match: /(analog|voltage|diode|transistor|amp|resonance|circuit|tube)/i,
    style: {
      label: "Analog",
      cardClassName: "border-rose-500/25 bg-rose-500/[0.05]",
      badgeClassName: "border-rose-500/35 bg-rose-500/15 text-rose-200",
      accentClassName: "text-rose-300",
    },
  },
  {
    match: /(micro|sruti|tonal|pitch|harmony|tuning|meend|gamaka)/i,
    style: {
      label: "Microtonal",
      cardClassName: "border-violet-500/25 bg-violet-500/[0.05]",
      badgeClassName: "border-violet-500/35 bg-violet-500/15 text-violet-200",
      accentClassName: "text-violet-300",
    },
  },
  {
    match: /(spatial|fdn|reverb|delay|stereo|depth|matrix|motion)/i,
    style: {
      label: "Spatial",
      cardClassName: "border-cyan-500/25 bg-cyan-500/[0.05]",
      badgeClassName: "border-cyan-500/35 bg-cyan-500/15 text-cyan-200",
      accentClassName: "text-cyan-300",
    },
  },
  {
    match: /(fluid|hydro|visc|scratch|paulstretch|morph)/i,
    style: {
      label: "Fluid",
      cardClassName: "border-emerald-500/25 bg-emerald-500/[0.05]",
      badgeClassName: "border-emerald-500/35 bg-emerald-500/15 text-emerald-200",
      accentClassName: "text-emerald-300",
    },
  },
  {
    match: /(macro|structure|section|breakdown|arrange|form)/i,
    style: {
      label: "Macro",
      cardClassName: "border-amber-500/25 bg-amber-500/[0.05]",
      badgeClassName: "border-amber-500/35 bg-amber-500/15 text-amber-200",
      accentClassName: "text-amber-300",
    },
  },
  {
    match: /(energy|tempo|rhythm|attack|transient|peak)/i,
    style: {
      label: "Energy",
      cardClassName: "border-orange-500/25 bg-orange-500/[0.05]",
      badgeClassName: "border-orange-500/35 bg-orange-500/15 text-orange-200",
      accentClassName: "text-orange-300",
    },
  },
];

const FALLBACK_STYLE: DomainStyle = {
  label: "General",
  cardClassName: "border-border/60 bg-card/70",
  badgeClassName: "border-border/70 bg-muted/50 text-muted-foreground",
  accentClassName: "text-foreground",
};

export function resolveDomainStyle(domain?: string | null, technicalName?: string): DomainStyle {
  const haystack = `${domain ?? ""} ${technicalName ?? ""}`.trim();
  const match = DOMAIN_STYLES.find((entry) => entry.match.test(haystack));
  return match?.style ?? FALLBACK_STYLE;
}

export function resolveSourceBadgeClass(source: string): string {
  switch (source) {
    case "axis":
      return "border-fuchsia-500/35 bg-fuchsia-500/15 text-fuchsia-200";
    case "lexical":
      return "border-cyan-500/35 bg-cyan-500/15 text-cyan-200";
    case "numeric":
      return "border-emerald-500/35 bg-emerald-500/15 text-emerald-200";
    case "neutral":
      return "border-amber-500/35 bg-amber-500/15 text-amber-200";
    default:
      return "border-border/70 bg-muted/50 text-muted-foreground";
  }
}

export function compactBadgeClassName(base?: string): string {
  return cn("h-5 rounded-md border px-1.5 text-[10px] font-medium", base);
}
