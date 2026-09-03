"use client";

import { Dashboard } from "@/components/pages/Dashboard";
import { Chat } from "@/components/pages/Chat";
import { Crystals } from "@/components/pages/Crystals";
import { Enrichment } from "@/components/pages/Enrichment";
import { Generation } from "@/components/pages/Generation";
import { GWCollapser } from "@/components/pages/GWCollapser";
import { GWCollapserCrystalPool } from "@/components/pages/GWCollapserCrystalPool";
import { Import } from "@/components/pages/Import";
import { MMSS } from "@/components/pages/MMSS";
import { Map } from "@/components/pages/Map";
import { MetisLab } from "@/components/pages/MetisLab";
import { MetisResearchLab } from "@/components/pages/MetisResearchLab";
import { Pipelines } from "@/components/pages/Pipelines";
import { RagParametersPage } from "@/components/pages/RagParametersPage";
import { RagParametersV2Page } from "@/components/pages/RagParametersV2Page";
import { SemanticPlane } from "@/components/pages/SemanticPlane";
import { Settings } from "@/components/pages/Settings";
import { StrudelFlowEditor } from "@/components/pages/StrudelFlowEditor";
import { StrudelLab } from "@/components/pages/StrudelLab";
import { TorusAtlas } from "@/components/pages/TorusAtlas";
import type { PageId } from "@/components/layout/Sidebar";

export function PageRenderer(props: {
  activePage: PageId;
  setActivePage: (page: PageId) => void;
}) {
  switch (props.activePage) {
    case "dashboard":
      return <Dashboard onNavigate={props.setActivePage} />;
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
    case "strudel":
      return <StrudelLab />;
    case "strudelflow":
      return <StrudelFlowEditor />;
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
    case "ragparameters":
      return <RagParametersPage />;
    case "ragparametersv2":
      return <RagParametersV2Page />;
    case "settings":
      return <Settings />;
    default:
      return <Dashboard onNavigate={props.setActivePage} />;
  }
}
