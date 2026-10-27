"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function AMCoreLogo({ className, label = "AM-Core" }: { className?: string; label?: string }) {
  const [colored, setColored] = useState(false);
  const [rotation, setRotation] = useState(23.44);
  useEffect(() => {
    if (!colored) return;
    const timer = window.setTimeout(() => setColored(false), 4000);
    return () => window.clearTimeout(timer);
  }, [colored, rotation]);
  return <button type="button" aria-label={`${label} logo`} onClick={() => { setRotation((value) => value + 36); setColored(true); }} onPointerEnter={() => setColored(true)} onPointerLeave={() => setColored(false)} onFocus={() => setColored(true)} onBlur={() => setColored(false)} className={cn("am-logo", colored && "is-colored", className)}>
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <circle cx="32" cy="32" r="30" fill="hsl(var(--background))" />
      <circle className="logo-ring" cx="32" cy="32" r="30" strokeWidth="1.15" opacity=".6" />
      <g className="logo-rosette" style={{ transform: `rotate(${rotation}deg)` }}>
        <circle className="logo-petal p1" cx="32" cy="32" r="13.1" strokeWidth="1.25" />
        <circle className="logo-petal p2" cx="32" cy="20.4" r="13.1" strokeWidth=".95" />
        <circle className="logo-petal p3" cx="32" cy="43.6" r="13.1" strokeWidth="1.35" />
        <circle className="logo-petal p4" cx="21.9" cy="26.2" r="13.1" strokeWidth=".95" />
        <circle className="logo-petal p5" cx="42.1" cy="26.2" r="13.1" strokeWidth=".85" />
        <circle className="logo-petal p6" cx="21.9" cy="37.8" r="13.1" strokeWidth="1.5" />
        <circle className="logo-petal p7" cx="42.1" cy="37.8" r="13.1" strokeWidth="1.05" />
        <circle className="logo-center" cx="32" cy="32" r="6.55" />
      </g>
    </svg>
  </button>;
}
