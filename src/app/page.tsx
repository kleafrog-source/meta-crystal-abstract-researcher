"use client";

import { AppShell } from "@/components/layout/AppShell";
import { Dashboard } from "@/components/pages/Dashboard";
import { Generation } from "@/components/pages/Generation";
import { Pipelines } from "@/components/pages/Pipelines";
import { Crystals } from "@/components/pages/Crystals";
import { Import } from "@/components/pages/Import";
import { Enrichment } from "@/components/pages/Enrichment";
import { Chat } from "@/components/pages/Chat";
import { SemanticPlane } from "@/components/pages/SemanticPlane";
import { MMSS } from "@/components/pages/MMSS";
import { MetisLab } from "@/components/pages/MetisLab";
import { MetisResearchLab } from "@/components/pages/MetisResearchLab";
import { GWCollapser } from "@/components/pages/GWCollapser";
import { GWCollapserCrystalPool } from "@/components/pages/GWCollapserCrystalPool";
import { Map } from "@/components/pages/Map";
import { TorusAtlas } from "@/components/pages/TorusAtlas";
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
          case "semanticplane":
            return <SemanticPlane />;
          case "mmss":
            return <MMSS />;
          case "metis":
            return <MetisLab />;
          case "metisresearch":
            return <MetisResearchLab />;
          case "gwcollapser":
            return <GWCollapser />;
          case "crystalpool":
            return <GWCollapserCrystalPool />;
          case "torusatlas":
            return <TorusAtlas />;
          case "map":
            return <Map />;
          case "settings":
            return <Settings />;
          default:
            return <Dashboard onNavigate={setActivePage} />;
        }
      }}
    </AppShell>
  );
}
