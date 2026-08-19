import { useEffect, useRef, useCallback, useState } from 'react';
import { useAppStore } from "@/strudel-editor/store/app-store";
import { useWorkflowRunner } from './use-workflow-runner';
import { getStrudelRuntime } from "@/lib/strudel-runtime";

async function hushRuntime() {
  const runtime = await getStrudelRuntime();
  runtime.hush();
}

export function useGlobalPlayback() {
  const { runWorkflow, stopWorkflow } = useWorkflowRunner();
  const nodes = useAppStore((state) => state.nodes);
  const updateNodeData = useAppStore((state) => state.updateNodeData);

  const [isGloballyPaused, setIsGloballyPaused] = useState(false);
  const nodeStatesBeforePause = useRef<
    Record<string, 'running' | 'paused' | 'stopped'>
  >({});

  const globalPause = useCallback(() => {
    if (isGloballyPaused) return;

    nodeStatesBeforePause.current = {};
    nodes.forEach((node) => {
      const currentState = node.data.state || 'paused';
      if (currentState === 'running') {
        nodeStatesBeforePause.current[node.id] = 'running';
        updateNodeData(node.id, { state: 'paused' });
      }
    });

    void hushRuntime();
    stopWorkflow();
    setIsGloballyPaused(true);
  }, [nodes, stopWorkflow, isGloballyPaused, updateNodeData]);

  const globalPlay = useCallback(() => {
    if (!isGloballyPaused) return;

    Object.keys(nodeStatesBeforePause.current).forEach((nodeId) => {
      if (nodeStatesBeforePause.current[nodeId] === 'running') {
        updateNodeData(nodeId, { state: 'running' });
      }
    });

    nodeStatesBeforePause.current = {};
    setIsGloballyPaused(false);
    runWorkflow();
  }, [updateNodeData, runWorkflow, isGloballyPaused]);

  const toggleGlobalPlayback = useCallback(() => {
    if (isGloballyPaused) {
      globalPlay();
    } else {
      globalPause();
    }
  }, [globalPlay, globalPause, isGloballyPaused]);

  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (
        event.code === 'Space' &&
        !['INPUT', 'TEXTAREA'].includes((event.target as HTMLElement)?.tagName)
      ) {
        event.preventDefault();
        toggleGlobalPlayback();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [toggleGlobalPlayback]);

  return {
    isGloballyPaused,
    globalPause,
    globalPlay,
    toggleGlobalPlayback,
  };
}
