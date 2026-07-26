"use client";

import { Sidebar, type PageId } from "./Sidebar";
import { useState, useEffect } from "react";

interface AppShellProps {
  children: (props: { activePage: PageId; setActivePage: (p: PageId) => void }) => React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [activePage, setActivePage] = useState<PageId>("dashboard");
  const [activeRuns, setActiveRuns] = useState(0);

  useEffect(() => {
    const update = () => {
      fetch("/api/tasks")
        .then((r) => r.json())
        .then((d) => {
          if (d?.ok) setActiveRuns(d.running ?? 0);
        })
        .catch(() => {});
    };
    update();
    const handleRefresh = () => update();
    window.addEventListener("tasks:refresh", handleRefresh as EventListener);
    return () => window.removeEventListener("tasks:refresh", handleRefresh as EventListener);
  }, []);

  return (
    <div className="min-h-screen flex">
      <Sidebar active={activePage} onNavigate={setActivePage} activeRuns={activeRuns} />
      <main className="flex-1 min-w-0 flex flex-col">
        {children({ activePage, setActivePage })}
      </main>
    </div>
  );
}
