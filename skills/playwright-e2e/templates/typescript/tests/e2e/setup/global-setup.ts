import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { request, type FullConfig } from "@playwright/test";
import { requireBaseUrl, requireEnv, testEnvKind } from "../support/env";

/**
 * Runs once, before any worker starts (rule 10).
 * - ephemeral: reset and re-seed the environment the suite owns, so the run starts from a known baseline.
 * - shared: never reset or seed; only verify the baseline exists and stop early if it doesn't.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  process.env.TEST_RUN_ID ??= randomUUID().slice(0, 8); // inherited by every worker

  if (testEnvKind() === "ephemeral") {
    // Your project's reset-and-seed command, e.g. "npm run db:reset:test". It must refuse a non-test database.
    execSync(requireEnv("E2E_RESET_COMMAND"), { stdio: "inherit", env: process.env });
  }

  await verifyBaseline(requireBaseUrl(config.projects[0]?.use.baseURL));
}

/** Baseline reference data every environment must hold. Replace the paths with your application's. */
const BASELINE_ENDPOINTS = ["/api/health", "/api/categories"] as const;

async function verifyBaseline(baseURL: string): Promise<void> {
  const api = await request.newContext({ baseURL });
  try {
    for (const path of BASELINE_ENDPOINTS) {
      const response = await api.get(path);
      if (!response.ok()) throw new Error(`Baseline check ${path} returned ${response.status()}. Seed the environment first.`);
    }
  } finally {
    await api.dispose();
  }
}
