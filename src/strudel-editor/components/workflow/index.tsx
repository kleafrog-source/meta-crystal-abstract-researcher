import { Background, ReactFlow } from '@xyflow/react';
import { useShallow } from 'zustand/react/shallow';

import { nodeTypes } from "@/strudel-editor/components/nodes";
import deleteEdge from "@/strudel-editor/components/delete-edge";
import { useAppStore } from "@/strudel-editor/store/app-store";
import { WorkflowControls } from './controls';
import { useDragAndDrop } from "@/strudel-editor/hooks/use-drag-and-drop";
import { useUrlStateLoader } from "@/strudel-editor/hooks/use-url-state";
import { useGlobalPlayback } from "@/strudel-editor/hooks/use-global-playback";
import { useThemeCss } from "@/strudel-editor/hooks/use-theme-css";

export default function Workflow() {
  useUrlStateLoader();
  useGlobalPlayback();

  const edgeTypes = {
    default: deleteEdge,
  };

  const {
    nodes,
    edges,
    colorMode,
    theme,
    onNodesChange,
    onEdgesChange,
    onConnect,
  } = useAppStore(
    useShallow((state) => ({
      nodes: state.nodes,
      edges: state.edges,
      colorMode: state.colorMode,
      theme: state.theme,
      onNodesChange: state.onNodesChange,
      onEdgesChange: state.onEdgesChange,
      onConnect: state.onConnect,
    })),
  );

  // Load theme CSS at the app level - fixes mobile color loading
  useThemeCss(theme);

  const { onDragOver, onDrop } = useDragAndDrop();

  return (
    <div className="reactflow-wrapper h-full w-full min-h-0 flex-1">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onDragOver={onDragOver}
        onDrop={onDrop}
        nodeDragThreshold={30}
        colorMode={colorMode}
        fitView
      >
        <Background />
        <WorkflowControls />
      </ReactFlow>
    </div>
  );
}
