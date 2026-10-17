"use client";

import dynamic from "next/dynamic";

import { AMCoreDashboard } from "@/components/pages/AMCoreDashboard";
import { RagParametersV3Page } from "@/components/pages/RagParametersV3Page";
import { CombinatorialGenesisPage } from "@/components/pages/CombinatorialGenesisPage";
import { CombinatorialSynthesisPage } from "@/components/pages/CombinatorialSynthesisPage";
import { AudioClapRagPage } from "@/components/pages/AudioClapRagPage";
import { AudioToParameterPage } from "@/components/pages/AudioToParameterPage";
import { MetaCrystalV3LabPage } from "@/components/pages/MetaCrystalV3LabPage";
import { WhiteSpaceDiscoveryPage } from "@/components/pages/WhiteSpaceDiscoveryPage";
import { KnowledgeGraphPage } from "@/components/pages/KnowledgeGraphPage";
import { MorphoAcousticRagPage } from "@/components/pages/MorphoAcousticRagPage";
import { CrossModalConsensusPage } from "@/components/pages/CrossModalConsensusPage";
import { VocalAllocationMatrixPage } from "@/components/pages/VocalAllocationMatrixPage";
import { Settings } from "@/components/pages/Settings";
import type { PageId } from "@/components/layout/Sidebar";

const SemanticPlane = dynamic(() => import("@/components/pages/SemanticPlane").then((module) => module.SemanticPlane));
const Generation = dynamic(() => import("@/components/pages/Generation").then((module) => module.Generation));
const Pipelines = dynamic(() => import("@/components/pages/Pipelines").then((module) => module.Pipelines));
const Crystals = dynamic(() => import("@/components/pages/Crystals").then((module) => module.Crystals));
const Import = dynamic(() => import("@/components/pages/Import").then((module) => module.Import));
const Enrichment = dynamic(() => import("@/components/pages/Enrichment").then((module) => module.Enrichment));
const Chat = dynamic(() => import("@/components/pages/Chat").then((module) => module.Chat));
const MMSS = dynamic(() => import("@/components/pages/MMSS").then((module) => module.MMSS));
const MetisLab = dynamic(() => import("@/components/pages/MetisLab").then((module) => module.MetisLab));
const MetisResearchLab = dynamic(() => import("@/components/pages/MetisResearchLab").then((module) => module.MetisResearchLab));
const GWCollapser = dynamic(() => import("@/components/pages/GWCollapser").then((module) => module.GWCollapser));
const GWCollapserCrystalPool = dynamic(() => import("@/components/pages/GWCollapserCrystalPool").then((module) => module.GWCollapserCrystalPool));
const TorusAtlas = dynamic(() => import("@/components/pages/TorusAtlas").then((module) => module.TorusAtlas));
const Map = dynamic(() => import("@/components/pages/Map").then((module) => module.Map));

export function PageRenderer(props: {
  activePage: PageId;
  setActivePage: (page: PageId) => void;
}) {
  switch (props.activePage) {
    case "dashboard":
      return <AMCoreDashboard onNavigate={props.setActivePage} />;
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
    case "ragparametersv3":
      return <RagParametersV3Page />;
    case "combinatorialgenesis":
      return <CombinatorialGenesisPage />;
    case "combinatorialsynthesis":
      return <CombinatorialSynthesisPage />;
    case "audioclaprag":
      return <AudioClapRagPage />;
    case "audiotoparameter":
      return <AudioToParameterPage />;
    case "metacrystalv3lab":
      return <MetaCrystalV3LabPage />;
    case "whitespacediscovery":
      return <WhiteSpaceDiscoveryPage />;
    case "knowledgegraph":
      return <KnowledgeGraphPage />;
    case "morphoacousticrag":
      return <MorphoAcousticRagPage />;
    case "crossmodalconsensus":
      return <CrossModalConsensusPage />;
    case "vocalallocationmatrix":
      return <VocalAllocationMatrixPage />;
    case "settings":
      return <Settings />;
    default:
      return <AMCoreDashboard onNavigate={props.setActivePage} />;
  }
}
