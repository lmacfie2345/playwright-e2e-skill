import { request, type FullConfig } from "@playwright/test";
import { ApiClient } from "../support/api-client";
import { ADMIN_STATE } from "../support/auth";
import { requireBaseUrl, runPrefix } from "../support/env";

/**
 * Run-level safety net (rule 10): deletes anything this run created that per-test teardown missed, for example
 * after a crashed worker. Scoped to this run's prefix only; never wider. Uses a test-support endpoint here;
 * replace it with your application's mechanism (or a scheduled sweeper) if it has none.
 */
export default async function globalTeardown(config: FullConfig): Promise<void> {
  const context = await request.newContext({ baseURL: requireBaseUrl(config.projects[0]?.use.baseURL), storageState: ADMIN_STATE });
  try {
    const deleted = await new ApiClient(context).deleteByPrefix(runPrefix());
    if (deleted > 0) console.warn(`Safety net removed ${deleted} record(s) left by this run`);
  } finally {
    await context.dispose();
  }
}
