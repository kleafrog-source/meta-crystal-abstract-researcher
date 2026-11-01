"use client";

import { Sidebar, type PageId } from "./Sidebar";
import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronRight } from "@/components/icons";
import { PageRenderer } from "./PageRenderer";
import { UiLocaleProvider } from "@/lib/ui-i18n";

function pathnameToPage(pathname: string): PageId {
  if (pathname === "/am-parameters-catalogue") return "amparameterscatalogue";
  if (pathname === "/rag-parameters-v3" || pathname === "/am-core") {
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

  if (pathname === "/am-stage") return "amstage";
  if (pathname === "/lexicon-status") return "lexiconstatus";

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
  if (pathname === "/vocal-allocation-matrix" || pathname === "/am-vocal-morphology-matrix") return "vocalallocationmatrix";

  return "dashboard";
}

export function AppShell({ initialLanguage }: { initialLanguage: "en" | "ru" | "de" }) {
  return <UiLocaleProvider initialLanguage={initialLanguage}><AppShellContent /></UiLocaleProvider>;
}

function AppShellContent() {
  const pathname = usePathname();
  const router = useRouter();
  const [activePage, setActivePage] = useState<PageId>("dashboard");
  const [activeRuns, setActiveRuns] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    if (pathname !== "/") return;
    const page = new URLSearchParams(window.location.search).get("page") as PageId | null;
    if (!page) return;
    const timer = window.setTimeout(() => setActivePage(page), 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);

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
      router.push("/am-core");
      return;
    }

    if (page === "amparameterscatalogue") {
      router.push("/am-parameters-catalogue");
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

    if (page === "amstage") {
      router.push("/am-stage");
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
    if (page === "vocalallocationmatrix") { router.push("/am-vocal-morphology-matrix"); return; }

    if (page === "dashboard") router.push("/");
    else router.push(`/?page=${encodeURIComponent(page)}`);
  };

  return (
    <div className="min-h-screen flex">
      {sidebarOpen ? (
        <Sidebar active={pathnameToPage(pathname) === "dashboard" ? activePage : pathnameToPage(pathname)} onNavigate={handleNavigate} activeRuns={activeRuns} onClose={() => setSidebarOpen(false)} />
      ) : (
        <button type="button" onClick={() => setSidebarOpen(true)} className="fixed left-3 top-3 z-50 flex h-9 items-center gap-1 rounded-md border border-border bg-background/90 px-2 text-xs text-muted-foreground shadow-lg backdrop-blur hover:bg-accent" title="Показать боковую панель">
          <ChevronRight className="h-4 w-4" /><span className="hidden sm:inline">Меню</span>
        </button>
      )}
      <main className={`flex-1 min-w-0 flex flex-col app-shell-main ${sidebarOpen ? "" : "sidebar-collapsed"}`}>
        <PageRenderer
          activePage={pathnameToPage(pathname) === "dashboard" ? activePage : pathnameToPage(pathname)}
          setActivePage={setActivePage}
        />
      </main>
    </div>
  );
}
