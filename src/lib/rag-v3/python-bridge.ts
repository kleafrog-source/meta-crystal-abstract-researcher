import { spawn } from "node:child_process";

export interface V3AnchorValue {
  value: number | string;
  before: number | string;
  source: "numeric" | "value_anchor" | "lexical" | "axis" | "default" | "neutral";
  detail: string;
}

export function runV3AnchoringBridge(payload: {
  query: string;
  scoped_params: Array<Record<string, unknown>>;
  current_values: Record<string, number | string>;
}): Promise<Record<string, V3AnchorValue>> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.PYTHON_EXECUTABLE || "python", ["python_engine/anchoring_v3/bridge.py"], {
      cwd: process.cwd(),
      env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(stderr.trim() || `V3 anchoring bridge exited with ${code}`));
      try {
        resolve(JSON.parse(stdout) as Record<string, V3AnchorValue>);
      } catch (error) {
        reject(new Error(`Invalid V3 anchoring response: ${error instanceof Error ? error.message : String(error)}`));
      }
    });
    child.stdin.end(JSON.stringify(payload));
  });
}
