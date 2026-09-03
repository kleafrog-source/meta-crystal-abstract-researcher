"use client";

import { Sidebar, type PageId } from "./Sidebar";
import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

interface AppShellProps {
  children: (props: { activePage: PageId; setActivePage: (p: PageId) => void }) => React.ReactNode;
}

function pathnameToPage(pathname: string): PageId {
  if (pathname === "/rag-parameters") {
    return "ragparameters";
  }

  if (pathname === "/rag-parameters-v2") {
    return "ragparametersv2";
  }

  return "dashboard";
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
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

  const handleNavigate = (page: PageId) => {
    setActivePage(page);

    if (page === "ragparameters") {
      router.push("/rag-parameters");
      return;
    }

    if (page === "ragparametersv2") {
      router.push("/rag-parameters-v2");
      return;
    }

    if (pathname !== "/") {
      router.push("/");
    }
  };

  return (
    <div className="min-h-screen flex">
      <Sidebar
        active={pathnameToPage(pathname)}
        onNavigate={handleNavigate}
        activeRuns={activeRuns}
      />
      <main className="flex-1 min-w-0 flex flex-col">
        {children({
          activePage: pathnameToPage(pathname) === "dashboard" ? activePage : pathnameToPage(pathname),
          setActivePage,
        })}
      </main>
    </div>
  );
}
