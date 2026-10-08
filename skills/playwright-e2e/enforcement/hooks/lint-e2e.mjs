#!/usr/bin/env node
// playwright-e2e skill: Claude Code PostToolUse hook. After Claude edits a Playwright test, page object or fixture
// file, runs the skill's Semgrep rules and the repository's ESLint on that one file. Violations go to stderr with
// exit code 2, which Claude Code shows to Claude so it fixes them straight away. Node, so it runs on any OS.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const E2E_DIRS = (process.env.E2E_TEST_DIRS ?? "tests/e2e").split(",").map((d) => d.trim()).filter(Boolean);
const projectDir = resolve(process.env.CLAUDE_PROJECT_DIR ?? process.cwd());
const semgrepRules = join(dirname(fileURLToPath(import.meta.url)), "..", "semgrep");

let input;
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0); // not a hook payload; nothing to check
}
const filePath = input?.tool_input?.file_path;
if (typeof filePath !== "string" || !/\.(ts|tsx|js|mjs)$/.test(filePath) || !existsSync(filePath)) process.exit(0);

const rel = relative(projectDir, resolve(filePath)).split("\\").join("/");
if (!E2E_DIRS.some((dir) => rel === dir || rel.startsWith(`${dir}/`))) process.exit(0);

const problems = [];
const run = (label, command, args) => {
  try {
    execFileSync(command, args, { cwd: projectDir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32" });
  } catch (error) {
    if (error.code === "ENOENT") return; // tool not installed: the definition of done still runs it
    problems.push(`${label}:\n${(error.stdout || error.stderr || error.message).trim()}`);
  }
};

run("Semgrep (playwright-e2e rules)", "semgrep", ["--config", semgrepRules, "--metrics=off", "--error", "--quiet", rel]);
run("ESLint", "npx", ["--no-install", "eslint", "--max-warnings=0", rel]);

if (problems.length > 0) {
  process.stderr.write(`playwright-e2e checks failed for ${rel}. Fix these before continuing (see references/principles.md):\n\n${problems.join("\n\n")}\n`);
  process.exit(2);
}
