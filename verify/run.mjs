#!/usr/bin/env node
// Verifies the playwright-e2e skill against the tool versions pinned in package.json and requirements.txt.
//
//   cd verify   # from the repository root
//   npm ci && npx playwright install chromium && pip install -r requirements.txt
//   node run.mjs            # all checks; exit code 1 if any fails
//   node run.mjs --record   # also writes the "Verified against" line in the root README.md when every check passes
//
// Checks: templates compile (strictest TypeScript), pass ESLint and the skill's Semgrep rules; the Semgrep rules
// pass their own tests; the post-edit hook flags a bad file and passes a clean one; the templates run UNCHANGED
// against the stub app (3 workers x 3 repeats, ephemeral mode) and each test passes alone (shared mode).
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const VERIFY = dirname(fileURLToPath(import.meta.url));
const REPO = join(VERIFY, "..");
const SKILL = join(REPO, "skills", "playwright-e2e");
const WORK = join(VERIFY, ".work");
const RECORD = process.argv.includes("--record");
const results = [];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  return { code: result.status ?? 1, stdout: result.stdout ?? "", output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim(), error: result.error };
}

function check(name, fn) {
  process.stdout.write(`- ${name} ... `);
  try {
    const detail = fn();
    results.push({ name, ok: true, detail });
    console.log(`ok${detail ? ` (${detail})` : ""}`);
  } catch (error) {
    results.push({ name, ok: false, detail: error.message });
    console.log("FAILED");
    console.log(error.message.split("\n").map((l) => `    ${l}`).join("\n"));
  }
}

function expectZero(name, { code, output, stdout, error }) {
  if (error) throw new Error(`${name} could not start: ${error.message}`);
  if (code !== 0) throw new Error(`${name} exited ${code}\n${output.slice(-4000)}`);
  return { output, stdout };
}

const node = (script, args, options) => run(process.execPath, [join(VERIFY, "node_modules", ...script), ...args], options);
const playwright = (args, env) => node(["@playwright", "test", "cli.js"], ["test", ...args], { cwd: WORK, env: { ...process.env, ...env } });

function version(pkg) {
  return JSON.parse(readFileSync(join(VERIFY, "node_modules", pkg, "package.json"), "utf8")).version;
}

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolvePort(port));
    });
  });
}

async function waitFor(url, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200)); // polling a local process start-up, not a test wait
  }
  throw new Error(`Stub app did not start at ${url}`);
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── Prepare a scratch project holding the templates exactly as shipped ───────────────────────────────────────
if (!existsSync(join(VERIFY, "node_modules", "@playwright", "test"))) {
  console.error("Run `npm ci` in the verify folder first.");
  process.exit(1);
}
rmSync(WORK, { recursive: true, force: true });
cpSync(join(SKILL, "templates", "typescript"), WORK, { recursive: true });
cpSync(join(SKILL, "templates", "typescript", "semgrepignore"), join(WORK, ".semgrepignore"));
cpSync(join(VERIFY, "tsconfig.template.json"), join(WORK, "tsconfig.json"));
// The excerpt is copied (not imported in place) so its packages resolve from verify/node_modules.
cpSync(join(SKILL, "enforcement", "eslint.config.excerpt.mjs"), join(WORK, "eslint.playwright.mjs"));
writeFileSync(
  join(WORK, "eslint.config.mjs"),
  'import { playwrightE2e } from "./eslint.playwright.mjs";\nexport default [{ ignores: ["test-results/**", "playwright-report/**"] }, playwrightE2e];\n',
);

console.log(`Verifying playwright-e2e templates in ${WORK}\n`);

// ── Static checks ───────────────────────────────────────────────────────────────────────────────────────────
check("TypeScript (strict, exactOptionalPropertyTypes, noUncheckedIndexedAccess)", () => {
  expectZero("tsc", node(["typescript", "bin", "tsc"], ["-p", WORK]));
});

check("ESLint with the skill's excerpt", () => {
  expectZero("eslint", node(["eslint", "bin", "eslint.js"], ["--max-warnings=0", "."], { cwd: WORK }));
});

const semgrepEnv = { ...process.env, SEMGREP_ENABLE_VERSION_CHECK: "0" };
const semgrepRules = join(SKILL, "enforcement", "semgrep");
check("Semgrep rules pass their own tests (semgrep --test)", () => {
  expectZero("semgrep --test", run("semgrep", ["--test", "--metrics=off", semgrepRules], { env: semgrepEnv }));
});

check("Templates have no Semgrep findings", () => {
  // --project-root: inside a git checkout Semgrep reads .semgrepignore only from the git root, so without it the
  // .work copy falls back to the default ignores (which skip tests/) and nothing is scanned.
  const { stdout } = expectZero(
    "semgrep",
    run("semgrep", ["--config", semgrepRules, "--metrics=off", "--error", "--json", "--project-root", ".", "tests"], { cwd: WORK, env: semgrepEnv }),
  );
  const scanned = JSON.parse(stdout).paths.scanned.length;
  if (scanned === 0) throw new Error("Semgrep scanned 0 files: is .semgrepignore missing or not at the project root?");
  return `${scanned} files scanned`;
});

check("Post-edit hook flags a bad spec and passes a clean one", () => {
  const hook = join(SKILL, "enforcement", "hooks", "lint-e2e.mjs");
  const bad = join(WORK, "tests", "e2e", "specs", "_hook-check.spec.ts");
  writeFileSync(bad, 'import { test } from "../fixtures";\n\ntest("bad", async ({ page }) => {\n  await page.waitForTimeout(500);\n});\n');
  const call = (file) =>
    run(process.execPath, [hook], {
      cwd: WORK,
      input: JSON.stringify({ tool_name: "Write", tool_input: { file_path: file } }),
      env: { ...semgrepEnv, CLAUDE_PROJECT_DIR: WORK },
    });
  try {
    const flagged = call(bad);
    if (flagged.code !== 2) throw new Error(`expected exit 2 for the bad spec, got ${flagged.code}\n${flagged.output}`);
    const clean = call(join(WORK, "tests", "e2e", "specs", "cart", "add-to-cart.spec.ts"));
    if (clean.code !== 0) throw new Error(`expected exit 0 for a clean spec, got ${clean.code}\n${clean.output}`);
  } finally {
    rmSync(bad, { force: true });
  }
});

// ── Run the templates unchanged against the stub app ────────────────────────────────────────────────────────
const port = await freePort();
const baseURL = `http://127.0.0.1:${port}`;
const env = {
  BASE_URL: baseURL,
  E2E_ADMIN_EMAIL: "admin@example.test",
  E2E_ADMIN_PASSWORD: randomBytes(18).toString("base64url"),
  E2E_RESET_COMMAND: `"${process.execPath}" "${join(VERIFY, "stub", "reset.mjs")}"`,
};
const stub = spawn(process.execPath, [join(VERIFY, "stub", "server.mjs")], { env: { ...process.env, ...env, PORT: String(port) }, stdio: "ignore" });
try {
  await waitFor(`${baseURL}/api/health`);

  check("Test discovery (playwright test --list)", () => {
    const { output } = expectZero("playwright --list", playwright(["--list"], env));
    return output.split("\n").find((l) => l.startsWith("Total:")) ?? "";
  });

  check("All tests, 3 workers x 3 repeats, TEST_ENV_KIND=ephemeral", () => {
    const { output } = expectZero("playwright", playwright(["--workers=3", "--repeat-each=3", "--reporter=line"], { ...env, TEST_ENV_KIND: "ephemeral" }));
    return output.match(/\d+ passed/)?.[0] ?? "";
  });

  check("Each test alone, TEST_ENV_KIND=shared", () => {
    const { stdout } = expectZero("playwright --list", playwright(["--list", "--reporter=json"], env));
    const report = JSON.parse(stdout);
    const titles = [];
    // --grep matches the test's own title; spec titles in the templates are unique.
    const walk = (suite) => {
      for (const spec of suite.specs ?? []) if (!spec.file.endsWith(".setup.ts")) titles.push(spec.title);
      for (const child of suite.suites ?? []) walk(child);
    };
    for (const suite of report.suites) walk(suite);
    for (const title of titles) {
      expectZero(`"${title}" alone`, playwright(["--grep", escapeRegExp(title), "--reporter=line"], { ...env, TEST_ENV_KIND: "shared" }));
    }
    return `${titles.length} tests`;
  });
} finally {
  stub.kill();
}

// ── Summary ─────────────────────────────────────────────────────────────────────────────────────────────────
const semgrepVersion = run("semgrep", ["--version"], { env: semgrepEnv }).output.split("\n").pop() || "not installed";
const versions = [
  `@playwright/test ${version("@playwright/test")}`,
  `eslint-plugin-playwright ${version("eslint-plugin-playwright")}`,
  `ESLint ${version("eslint")}`,
  `typescript-eslint ${version("typescript-eslint")}`,
  `TypeScript ${version("typescript")}`,
  `Semgrep ${semgrepVersion}`,
  `Node ${process.versions.node}`,
];
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
console.log(`Tools: ${versions.join(", ")}`);

if (failed.length === 0 && RECORD) {
  const readme = join(REPO, "README.md");
  const date = new Date().toISOString().slice(0, 10);
  const line = `<!-- verified:start -->\n**Verified against:** ${versions.join(", ")} on ${date} (\`verify/run.mjs\`).\n<!-- verified:end -->`;
  const text = readFileSync(readme, "utf8");
  if (!/<!-- verified:start -->[\s\S]*<!-- verified:end -->/.test(text)) throw new Error("README.md has no verified:start/end markers");
  writeFileSync(readme, text.replace(/<!-- verified:start -->[\s\S]*<!-- verified:end -->/, line));
  console.log("Recorded the verified-against line in README.md");
}
rmSync(WORK, { recursive: true, force: true });
process.exit(failed.length === 0 ? 0 : 1);
