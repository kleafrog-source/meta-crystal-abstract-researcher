"use client";

import dynamic from "next/dynamic";

import { AMCoreDashboard } from "@/components/pages/AMCoreDashboard";
import { AMStagePage } from "@/components/pages/AMStagePage";
import type { PageId } from "@/components/layout/Sidebar";
import { useEffect, useState } from "react";

const SESSION_PAGES = new Set<PageId>([
  "amparameterscatalogue",
  "ragparametersv3",
  "combinatorialgenesis",
  "combinatorialsynthesis",
  "audioclaprag",
  "audiotoparameter",
  "amstage",
  "morphoacousticrag",
]);

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
const RagParametersV3Page = dynamic(() => import("@/components/pages/RagParametersV3Page").then((module) => module.RagParametersV3Page));
const AMParametersCataloguePage = dynamic(() => import("@/components/pages/AMParametersCataloguePage").then((module) => module.AMParametersCataloguePage));
const CombinatorialGenesisPage = dynamic(() => import("@/components/pages/CombinatorialGenesisPage").then((module) => module.CombinatorialGenesisPage));
const CombinatorialSynthesisPage = dynamic(() => import("@/components/pages/CombinatorialSynthesisPage").then((module) => module.CombinatorialSynthesisPage));
const AudioClapRagPage = dynamic(() => import("@/components/pages/AudioClapRagPage").then((module) => module.AudioClapRagPage));
const AudioToParameterPage = dynamic(() => import("@/components/pages/AudioToParameterPage").then((module) => module.AudioToParameterPage));
const MorphoAcousticRagPage = dynamic(() => import("@/components/pages/MorphoAcousticRagPage").then((module) => module.MorphoAcousticRagPage));
const VocalAllocationMatrixPage = dynamic(() => import("@/components/pages/VocalAllocationMatrixPage").then((module) => module.VocalAllocationMatrixPage));
const ServiceBayPage = dynamic(() => import("@/components/pages/ServiceBayPage").then((module) => module.ServiceBayPage));
const AutomationPage = dynamic(() => import("@/components/pages/AutomationPage").then((module) => module.AutomationPage));
const LexiconStatusPage = dynamic(() => import("@/app/lexicon-status/page").then((module) => module.default));
const Settings = dynamic(() => import("@/components/pages/Settings").then((module) => module.Settings));

export function PageRenderer(props: {
  activePage: PageId;
  setActivePage: (page: PageId) => void;
}) {
  const [visited, setVisited] = useState<PageId[]>([props.activePage]);
  useEffect(() => {
    if (SESSION_PAGES.has(props.activePage)) {
      setVisited((current) => current.includes(props.activePage) ? current : [...current, props.activePage]);
    }
  }, [props.activePage]);

  const renderPage = (page: PageId) => {
  switch (page) {
    case "amparameterscatalogue":
      return <AMParametersCataloguePage />;
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
      return <AudioToParameterPage active={page === props.activePage} />;
    case "amstage":
      return <AMStagePage active={page === props.activePage} />;
    case "automation":
      return <AutomationPage />;
    case "metacrystalv3lab":
      return <MetaCrystalV3LabPage />;
    case "whitespacediscovery":
      return <WhiteSpaceDiscoveryPage />;
    case "knowledgegraph":
      return <KnowledgeGraphPage />;
    case "morphoacousticrag":
      return <MorphoAcousticRagPage active={page === props.activePage} />;
    case "crossmodalconsensus":
      return <CrossModalConsensusPage />;
    case "vocalallocationmatrix":
      return <VocalAllocationMatrixPage />;
    case "settings":
      return <Settings />;
    case "servicebay":
      return <ServiceBayPage />;
    case "lexiconstatus":
      return <LexiconStatusPage />;
    default:
      return <AMCoreDashboard onNavigate={props.setActivePage} />;
  }
  };

  const pagesToRender = visited.includes(props.activePage) ? visited : [...visited, props.activePage];
  return <>
    {pagesToRender.map((page) => (
      <div key={page} className="flex-1 min-w-0" hidden={page !== props.activePage} aria-hidden={page !== props.activePage}>
        {renderPage(page)}
      </div>
    ))}
  </>;
}
