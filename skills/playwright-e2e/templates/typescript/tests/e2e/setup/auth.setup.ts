import { mkdir } from "node:fs/promises";
import { test as setup } from "../fixtures";
import { ADMIN_STATE, AUTH_DIR, NO_SESSION, signInViaApi } from "../support/auth";
import { requireEnv } from "../support/env";

// One API login per shared role per run; every test project depends on this setup project (rule 8).
// Roles whose tests change account state get a per-worker account instead (fixtures/data.ts).
setup.use({ storageState: NO_SESSION });

setup("authenticate as administrator", async ({ request }) => {
  await mkdir(AUTH_DIR, { recursive: true });
  await signInViaApi(request, { email: requireEnv("E2E_ADMIN_EMAIL"), password: requireEnv("E2E_ADMIN_PASSWORD") });
  await request.storageState({ path: ADMIN_STATE });
});
