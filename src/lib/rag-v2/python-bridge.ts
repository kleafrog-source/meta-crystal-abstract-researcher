import { spawn } from "node:child_process";

export async function runAnchoringBridge(payload: {
  query: string;
  scoped_params: Array<Record<string, unknown>>;
  current_values: Record<string, number | string>;
}): Promise<Record<string, { value: number | string; before: number | string; source: "numeric" | "lexical" | "axis" | "default" | "neutral"; detail: string }>> {
  return new Promise((resolve, reject) => {
    const child = spawn("python", ["python_engine/anchoring_v2/bridge.py"], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `bridge exited with code ${code}`));
        return;
      }

      try {
        resolve(JSON.parse(stdout) as Record<string, { value: number | string; before: number | string; source: "numeric" | "lexical" | "axis" | "default" | "neutral"; detail: string }>);
      } catch (error) {
        reject(
          new Error(
            `Failed to parse anchoring bridge output: ${
              error instanceof Error ? error.message : String(error)
            }`,
          ),
        );
      }
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}
