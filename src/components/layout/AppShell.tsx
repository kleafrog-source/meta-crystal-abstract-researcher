"use client";

import { Sidebar, type PageId } from "./Sidebar";
import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

interface AppShellProps {
  children: (props: {
    activePage: PageId;
    setActivePage: (p: PageId) => void;
  }) => React.ReactNode;
}

function pathnameToPage(pathname: string): PageId {
  if (pathname === "/rag-parameters-v3") {
    return "ragparametersv3";
  }

  if (pathname === "/combinatorial-genesis") {
    return "combinatorialgenesis";
  }

  if (pathname === "/combinatorial-synthesis") {
    return "combinatorialsynthesis";
  }

  if (pathname === "/audio-clap-rag") {
    return "audioclaprag";
  }

  if (
    pathname === "/audio-to-parameter" ||
    pathname === "/audio-to-parameter-rag-segments"
  ) {
    return "audiotoparameter";
  }

  if (pathname === "/meta-crystal-v3-lab") {
    return "metacrystalv3lab";
  }

  if (pathname === "/white-space-discovery") {
    return "whitespacediscovery";
  }
  if (pathname === "/knowledge-graph") {
    return "knowledgegraph";
  }
  if (pathname === "/morpho-acoustic-rag") {
    return "morphoacousticrag";
  }
  if (pathname === "/cross-modal-consensus") {
    return "crossmodalconsensus";
  }
  if (pathname === "/vocal-allocation-matrix") return "vocalallocationmatrix";

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
    return () =>
      window.removeEventListener(
        "tasks:refresh",
        handleRefresh as EventListener,
      );
  }, []);

  const handleNavigate = (page: PageId) => {
    setActivePage(page);

    if (page === "ragparametersv3") {
      router.push("/rag-parameters-v3");
      return;
    }

    if (page === "combinatorialgenesis") {
      router.push("/combinatorial-genesis");
      return;
    }

    if (page === "combinatorialsynthesis") {
      router.push("/combinatorial-synthesis");
      return;
    }

    if (page === "audioclaprag") {
      router.push("/audio-clap-rag");
      return;
    }

    if (page === "audiotoparameter") {
      router.push("/audio-to-parameter-rag-segments");
      return;
    }

    if (page === "metacrystalv3lab") {
      router.push("/meta-crystal-v3-lab");
      return;
    }

    if (page === "whitespacediscovery") {
      router.push("/white-space-discovery");
      return;
    }
    if (page === "knowledgegraph") {
      router.push("/knowledge-graph");
      return;
    }
    if (page === "morphoacousticrag") {
      router.push("/morpho-acoustic-rag");
      return;
    }
    if (page === "crossmodalconsensus") {
      router.push("/cross-modal-consensus");
      return;
    }
    if (page === "vocalallocationmatrix") { router.push("/vocal-allocation-matrix"); return; }

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
          activePage:
            pathnameToPage(pathname) === "dashboard"
              ? activePage
              : pathnameToPage(pathname),
          setActivePage,
        })}
      </main>
    </div>
  );
}
