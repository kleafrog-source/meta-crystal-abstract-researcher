import { promises as fs } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const packagesRoot = path.join(repoRoot, "node_modules", "@strudel");
const outputPath = path.join(repoRoot, "src", "lib", "strudel", "strudel_catalog.json");

const PACKAGE_ALLOWLIST = new Set(["core", "tonal", "webaudio", "draw", "mini"]);
const FILE_ALLOWLIST = new Set([
  "controls.mjs",
  "pattern.mjs",
  "signal.mjs",
  "euclid.mjs",
  "repl.mjs",
  "tonal.mjs",
  "voicings.mjs",
  "pianoroll.mjs",
  "pitchwheel.mjs",
  "spiral.mjs",
  "mini.mjs",
  "scope.mjs",
]);

const CATEGORY_MAP = {
  "core/controls": "Audio Controls",
  "core/pattern": "Pattern Transform",
  "core/signal": "Signal and Random",
  "core/euclid": "Rhythm",
  "core/repl": "Transport",
  "tonal/tonal": "Harmony and Pitch",
  "tonal/voicings": "Harmony and Pitch",
  "webaudio/scope": "Visual Analysis",
  "draw/pianoroll": "Visual Analysis",
  "draw/pitchwheel": "Visual Analysis",
  "draw/spiral": "Visual Analysis",
  "mini/mini": "Mini Notation",
};

function cleanCommentLine(line) {
  return line.replace(/^\s*\*\s?/, "").trimEnd();
}

function inferCategory(pkgName, moduleName) {
  return CATEGORY_MAP[`${pkgName}/${moduleName}`] ?? "General";
}

function parseBlock(block, meta) {
  const lines = block
    .split("\n")
    .map(cleanCommentLine)
    .filter((line) => line.length > 0);

  const nameLine = lines.find((line) => line.startsWith("@name "));
  if (!nameLine) {
    return null;
  }

  const name = nameLine.slice(6).trim();
  if (!name || name.includes(" ")) {
    return null;
  }

  const descriptionLines = [];
  for (const line of lines) {
    if (line.startsWith("@")) {
      break;
    }
    descriptionLines.push(line);
  }

  const params = [];
  const examples = [];
  const synonyms = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.startsWith("@param ")) {
      const match = line.match(/^@param\s+\{([^}]+)\}\s+(\[?[A-Za-z0-9_.]+\]?)(?:\s+-\s+|\s+)?(.*)$/);
      params.push({
        raw: line,
        type: match?.[1]?.trim() ?? null,
        name: match?.[2]?.replace(/^\[|\]$/g, "") ?? null,
        description: match?.[3]?.trim() ?? "",
      });
      continue;
    }
    if (line.startsWith("@synonyms ")) {
      synonyms.push(
        ...line
          .slice(10)
          .split(/[,\s]+/)
          .map((item) => item.trim())
          .filter(Boolean),
      );
      continue;
    }
    if (line.startsWith("@example")) {
      const next = lines[index + 1];
      if (next && !next.startsWith("@")) {
        examples.push(next.trim());
      }
    }
  }

  return {
    id: name,
    name,
    description: descriptionLines.join(" ").trim() || `${name} from @strudel/${meta.packageName}`,
    category: inferCategory(meta.packageName, meta.moduleName),
    package: `@strudel/${meta.packageName}`,
    module: meta.moduleName,
    sourceFile: meta.relativePath.replace(/\\/g, "/"),
    params,
    examples,
    synonyms: [...new Set(synonyms)],
    tags: [meta.packageName, meta.moduleName],
    vector: [],
  };
}

async function collectCatalog() {
  const entries = [];

  for (const packageName of PACKAGE_ALLOWLIST) {
    const packageDir = path.join(packagesRoot, packageName);
    const dirEntries = await fs.readdir(packageDir, { withFileTypes: true });
    for (const dirEntry of dirEntries) {
      if (!dirEntry.isFile() || !FILE_ALLOWLIST.has(dirEntry.name)) {
        continue;
      }
      const absolutePath = path.join(packageDir, dirEntry.name);
      const relativePath = path.relative(repoRoot, absolutePath);
      const moduleName = dirEntry.name.replace(/\.mjs$/, "");
      const fileContent = await fs.readFile(absolutePath, "utf8");
      const blocks = [...fileContent.matchAll(/\/\*\*([\s\S]*?)\*\//g)];

      for (const block of blocks) {
        const parsed = parseBlock(block[1], {
          packageName,
          moduleName,
          relativePath,
        });
        if (parsed) {
          entries.push(parsed);
        }
      }
    }
  }

  const deduped = new Map();
  for (const entry of entries) {
    const current = deduped.get(entry.id);
    if (!current) {
      deduped.set(entry.id, entry);
      continue;
    }
    const mergedExamples = [...new Set([...(current.examples ?? []), ...(entry.examples ?? [])])];
    const mergedSynonyms = [...new Set([...(current.synonyms ?? []), ...(entry.synonyms ?? [])])];
    deduped.set(entry.id, {
      ...current,
      description: current.description.length >= entry.description.length ? current.description : entry.description,
      examples: mergedExamples,
      synonyms: mergedSynonyms,
    });
  }

  return [...deduped.values()].sort((left, right) => left.id.localeCompare(right.id));
}

async function main() {
  const catalog = await collectCatalog();
  await fs.writeFile(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  const categories = new Set(catalog.map((item) => item.category));
  console.log(`strudel_catalog.json written: ${catalog.length} entries, ${categories.size} categories`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
