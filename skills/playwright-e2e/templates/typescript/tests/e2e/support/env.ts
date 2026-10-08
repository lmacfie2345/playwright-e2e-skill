/**
 * Environment configuration for the end-to-end suite (rule 10). Global setup and data fixtures read these;
 * tests never do, and never branch on them.
 */
export type TestEnvKind = "ephemeral" | "shared";

/** `ephemeral`: the suite owns the environment for this run. `shared`: other people use it. Defaults to `shared`. */
export function testEnvKind(): TestEnvKind {
  const raw = process.env.TEST_ENV_KIND ?? "shared";
  if (raw !== "ephemeral" && raw !== "shared") {
    throw new Error(`TEST_ENV_KIND must be "ephemeral" or "shared", got "${raw}"`);
  }
  return raw;
}

/** Reads a required variable. Never prints its value: it may be a secret. */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} in the test environment (for example, a git-ignored .env file)`);
  return value;
}

/** The project's configured base URL; fails clearly when it is missing instead of requesting a relative URL. */
export function requireBaseUrl(baseURL: string | undefined): string {
  if (!baseURL) throw new Error("Set use.baseURL in playwright.config.ts (from the BASE_URL environment variable)");
  return baseURL;
}

/** Identifies this run's data. Set once by global setup and inherited by every worker. */
export function runId(): string {
  return requireEnv("TEST_RUN_ID");
}

/** Carried by every record this run creates, so the run-level safety net can find it. */
export function runPrefix(): string {
  return `e2e-${runId()}`;
}
