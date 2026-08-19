import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const root = process.cwd();
const sourceRoot = resolve(root, ".tmp/xyflow-strudel-flow/src");
const targetRoot = resolve(root, "src/strudel-editor");

const includeTopLevel = new Set(["components", "data", "hooks", "lib", "store"]);
const passthroughImports = [
  "@/components/ui/",
  "@/hooks/use-mobile",
  "@/lib/utils",
];

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function shouldPassthrough(importPath) {
  return passthroughImports.some((prefix) => importPath === prefix || importPath.startsWith(prefix));
}

function remapAliasImport(importPath) {
  if (shouldPassthrough(importPath)) {
    return importPath;
  }
  if (!importPath.startsWith("@/")) {
    return importPath;
  }
  return `@/strudel-editor/${importPath.slice(2)}`;
}

function transformContent(content) {
  return content.replace(/from\s+['"](@\/[^'"]+)['"]/g, (_match, importPath) => {
    return `from "${remapAliasImport(importPath)}"`;
  }).replace(/import\s+['"](@\/[^'"]+)['"]/g, (_match, importPath) => {
    return `import "${remapAliasImport(importPath)}"`;
  });
}

function walk(currentSourceDir) {
  for (const entry of readdirSync(currentSourceDir)) {
    const sourcePath = join(currentSourceDir, entry);
    const stats = statSync(sourcePath);
    if (stats.isDirectory()) {
      walk(sourcePath);
      continue;
    }
    if (!entry.endsWith(".ts") && !entry.endsWith(".tsx") && !entry.endsWith(".css")) {
      continue;
    }
    const relativePath = relative(sourceRoot, sourcePath);
    const topLevel = relativePath.split(/[\\/]/)[0];
    if (!includeTopLevel.has(topLevel)) {
      continue;
    }
    const targetPath = join(targetRoot, relativePath);
    ensureDir(dirname(targetPath));
    const sourceText = readFileSync(sourcePath, "utf8");
    const output = entry.endsWith(".css") ? sourceText : transformContent(sourceText);
    writeFileSync(targetPath, output, "utf8");
  }
}

ensureDir(targetRoot);
walk(sourceRoot);

console.log(`Imported upstream Strudel Flow sources into ${relative(root, targetRoot)}`);
