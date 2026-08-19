"use client";

import { useEffect, useRef } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import SidebarLayout from "@/strudel-editor/components/layouts/sidebar-layout";
import Workflow from "@/strudel-editor/components/workflow";
import { loadStrudelEditorSeed, clearStrudelEditorSeed } from "@/lib/strudel-editor-bridge";
import { setSchedulerNow } from "@/strudel-editor/lib/strudel-clock";
import { useAppStore } from "@/strudel-editor/store/app-store";
import { useStrudelStore } from "@/strudel-editor/store/strudel-store";
import type { AppNode } from "@/strudel-editor/components/nodes";
import { ensureStrudelInitialized } from "@/lib/strudel-runtime";

function StrudelFlowEditorInner() {
  const setNodes = useAppStore((state) => state.setNodes);
  const setEdges = useAppStore((state) => state.setEdges);
  const setTheme = useAppStore((state) => state.setTheme);
  const setColorMode = useAppStore((state) => state.setColorMode);
  const setCpm = useStrudelStore((state) => state.setCpm);
  const setBpc = useStrudelStore((state) => state.setBpc);
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) {
      return;
    }
    initRef.current = true;

    ensureStrudelInitialized()
      .then(({ repl }) => {
        setSchedulerNow(() => (repl as { scheduler: { now: () => number } }).scheduler.now());
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const seed = loadStrudelEditorSeed();
    if (!seed) {
      return;
    }
    setNodes((seed.nodes as AppNode[]).map((node) => ({
      ...node,
      data: {
        ...node.data,
        state: "paused" as const,
      },
    })));
    setEdges(seed.edges);
    setTheme(seed.theme);
    setColorMode(seed.colorMode);
    setCpm(seed.cpm);
    setBpc(seed.bpc ?? "4");
    clearStrudelEditorSeed();
  }, [setBpc, setColorMode, setCpm, setEdges, setNodes, setTheme]);

  return (
    <SidebarLayout>
      <Workflow />
    </SidebarLayout>
  );
}

export function StrudelFlowEditor() {
  return (
    <ReactFlowProvider>
      <StrudelFlowEditorInner />
    </ReactFlowProvider>
  );
}
