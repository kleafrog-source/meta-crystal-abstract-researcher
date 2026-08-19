import { useEffect, useRef, useCallback, useMemo } from 'react';
import { useStrudelStore } from "@/strudel-editor/store/strudel-store";
import { useAppStore } from "@/strudel-editor/store/app-store";
import { generateOutput } from "@/strudel-editor/lib/strudel";
import { getStrudelRuntime } from "@/lib/strudel-runtime";

export function useWorkflowRunner() {
  const isRunning = useRef(false);
  const lastEvaluatedPattern = useRef<string>('');
  const debounceTimerId = useRef<number | null>(null);
  const pattern = useStrudelStore((s) => s.pattern);
  const setPattern = useStrudelStore((s) => s.setPattern);
  const cpm = useStrudelStore((s) => s.cpm);
  const bpc = useStrudelStore((s) => s.bpc);

  const nodes = useAppStore((state) => state.nodes);
  const edges = useAppStore((state) => state.edges);

  const generatedPattern = useMemo(
    () => generateOutput(nodes, edges, cpm, bpc),
    [nodes, edges, cpm, bpc],
  );

  useEffect(() => {
    setPattern(generatedPattern);
  }, [generatedPattern, setPattern]);

  const getActivePattern = useCallback((p: string) => {
    return p
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
  }, []);

  const evaluatePattern = useCallback(
    async (patternToEvaluate: string) => {
      const activePattern = getActivePattern(patternToEvaluate);
      const hasContent = activePattern
        .replace(/setcpm\([^)]+\)\s*/g, '')
        .trim();

      if (!hasContent) {
        if (isRunning.current) {
          const runtime = await getStrudelRuntime();
          runtime.hush();
          isRunning.current = false;
        }
        lastEvaluatedPattern.current = '';
        return;
      }

      if (activePattern === lastEvaluatedPattern.current) return;

      isRunning.current = true;
      lastEvaluatedPattern.current = activePattern;

      try {
        const runtime = await getStrudelRuntime();
        runtime.evaluate(activePattern);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        const isKnownWarning =
          errorMessage.includes('got "undefined" instead of pattern') ||
          errorMessage.includes('Cannot read properties of undefined');

        if (isKnownWarning) {
          console.warn('Strudel pattern warning (suppressed):', errorMessage);
        } else {
          console.error('Strudel evaluation error:', err);
        }
      }
    },
    [getActivePattern],
  );

  const debouncedEvaluate = useCallback(
    (patternToEvaluate: string) => {
      if (debounceTimerId.current !== null) {
        window.clearTimeout(debounceTimerId.current);
      }

      // Tempo and scale changes evaluate immediately; everything else is debounced
      if (
        patternToEvaluate.includes('setcpm(') ||
        patternToEvaluate.includes('scale(')
      ) {
        void evaluatePattern(patternToEvaluate);
        return;
      }

      debounceTimerId.current = window.setTimeout(() => {
        void evaluatePattern(patternToEvaluate);
        debounceTimerId.current = null;
      }, 50);
    },
    [evaluatePattern],
  );

  useEffect(() => {
    if (!pattern?.trim()) {
      if (debounceTimerId.current !== null) {
        window.clearTimeout(debounceTimerId.current);
        debounceTimerId.current = null;
      }
      if (isRunning.current) {
        void getStrudelRuntime().then((runtime) => runtime.hush());
        isRunning.current = false;
      }
      lastEvaluatedPattern.current = '';
      return;
    }

    debouncedEvaluate(pattern);
  }, [pattern, debouncedEvaluate]);

  const forceEvaluate = useCallback(() => {
    const { nodes: currentNodes, edges: currentEdges } = useAppStore.getState();
    const { cpm: currentCpm, bpc: currentBpc } = useStrudelStore.getState();
    const freshPattern = generateOutput(
      currentNodes,
      currentEdges,
      currentCpm,
      currentBpc,
    );
    evaluatePattern(freshPattern);
  }, [evaluatePattern]);

  return {
    runWorkflow: () => debouncedEvaluate(pattern),
    forceEvaluate,
    stopWorkflow: () => {
      if (debounceTimerId.current !== null) {
        window.clearTimeout(debounceTimerId.current);
        debounceTimerId.current = null;
      }
      isRunning.current = false;
      lastEvaluatedPattern.current = '';
      void getStrudelRuntime().then((runtime) => runtime.hush());
    },
    isRunning: () => isRunning.current,
  };
}
