"use client";

import { AppShell } from "@/components/layout/AppShell";
import { Dashboard } from "@/components/pages/Dashboard";
import { Generation } from "@/components/pages/Generation";
import { Pipelines } from "@/components/pages/Pipelines";
import { Crystals } from "@/components/pages/Crystals";
import { Import } from "@/components/pages/Import";
import { Enrichment } from "@/components/pages/Enrichment";
import { Chat } from "@/components/pages/Chat";
import { Settings } from "@/components/pages/Settings";

export default function Home() {
  return (
    <AppShell>
      {({ activePage, setActivePage }) => {
        switch (activePage) {
          case "dashboard":
            return <Dashboard onNavigate={setActivePage} />;
          case "generation":
            return <Generation />;
          case "pipelines":
            return <Pipelines />;
          case "crystals":
            return <Crystals />;
          case "import":
            return <Import />;
          case "enrichment":
            return <Enrichment />;
          case "chat":
            return <Chat />;
          case "settings":
            return <Settings />;
          default:
            return <Dashboard onNavigate={setActivePage} />;
        }
      }}
    </AppShell>
  );
}
