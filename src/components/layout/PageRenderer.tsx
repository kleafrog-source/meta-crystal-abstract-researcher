"use client";

import dynamic from "next/dynamic";

import { AMCoreDashboard } from "@/components/pages/AMCoreDashboard";
import { RagParametersV3Page } from "@/components/pages/RagParametersV3Page";
import { CombinatorialGenesisPage } from "@/components/pages/CombinatorialGenesisPage";
import { CombinatorialSynthesisPage } from "@/components/pages/CombinatorialSynthesisPage";
import { AudioClapRagPage } from "@/components/pages/AudioClapRagPage";
import { AudioToParameterPage } from "@/components/pages/AudioToParameterPage";
import { MorphoAcousticRagPage } from "@/components/pages/MorphoAcousticRagPage";
import { VocalAllocationMatrixPage } from "@/components/pages/VocalAllocationMatrixPage";
import { Settings } from "@/components/pages/Settings";
import type { PageId } from "@/components/layout/Sidebar";

const SemanticPlane = dynamic(() => import("@/components/pages/SemanticPlane").then((module) => module.SemanticPlane));
const Generation = dynamic(() => import("@/components/pages/Generation").then((module) => module.Generation));
const Pipelines = dynamic(() => import("@/components/pages/Pipelines").then((module) => module.Pipelines));
const AMCrystalHub = dynamic(() => import("@/components/pages/AMCrystalHub").then((module) => module.AMCrystalHub));
const Import = dynamic(() => import("@/components/pages/Import").then((module) => module.Import));
const Enrichment = dynamic(() => import("@/components/pages/Enrichment").then((module) => module.Enrichment));
const Chat = dynamic(() => import("@/components/pages/Chat").then((module) => module.Chat));
const IRE = dynamic(() => import("@/components/pages/MMSS").then((module) => module.IRE));
const MetisLab = dynamic(() => import("@/components/pages/MetisLab").then((module) => module.MetisLab));
const MetisResearchLab = dynamic(() => import("@/components/pages/MetisResearchLab").then((module) => module.MetisResearchLab));
const GWCollapser = dynamic(() => import("@/components/pages/GWCollapser").then((module) => module.GWCollapser));
const GWCollapserCrystalPool = dynamic(() => import("@/components/pages/GWCollapserCrystalPool").then((module) => module.GWCollapserCrystalPool));
const TorusAtlas = dynamic(() => import("@/components/pages/TorusAtlas").then((module) => module.TorusAtlas));
const Map = dynamic(() => import("@/components/pages/Map").then((module) => module.Map));
const MetaCrystalV3LabPage = dynamic(() => import("@/components/pages/MetaCrystalV3LabPage").then((module) => module.MetaCrystalV3LabPage));
const WhiteSpaceDiscoveryPage = dynamic(() => import("@/components/pages/WhiteSpaceDiscoveryPage").then((module) => module.WhiteSpaceDiscoveryPage));
const KnowledgeGraphPage = dynamic(() => import("@/components/pages/KnowledgeGraphPage").then((module) => module.KnowledgeGraphPage));
const CrossModalConsensusPage = dynamic(() => import("@/components/pages/CrossModalConsensusPage").then((module) => module.CrossModalConsensusPage));

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
      return <AMCrystalHub onNavigate={props.setActivePage} />;
    case "import":
      return <Import />;
    case "enrichment":
      return <Enrichment />;
    case "chat":
      return <Chat />;
    case "semanticplane":
      return <SemanticPlane />;
    case "mmss":
      return <IRE />;
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
