"use client";

import { useEffect, useState } from "react";
import { DEFAULT_CAPABILITY_REGISTRY, capabilityIsEnabled, type CapabilityRegistry } from "@/lib/capability-registry";

export function useCapabilityEnabled(capability: string): boolean | null {
  const [registry, setRegistry] = useState<CapabilityRegistry | null>(null);
  useEffect(() => {
    let active = true;
    void fetch("/api/settings", { cache: "no-store" }).then((response) => response.json()).then((payload) => {
      if (active) setRegistry(payload.llm?.capabilityRegistry ?? DEFAULT_CAPABILITY_REGISTRY);
    }).catch(() => { if (active) setRegistry(DEFAULT_CAPABILITY_REGISTRY); });
    return () => { active = false; };
  }, []);
  return registry ? capabilityIsEnabled(registry, capability) : null;
}
