// Reset command for the stub (TEST_ENV_KIND=ephemeral): global setup runs it through E2E_RESET_COMMAND.
const base = process.env.BASE_URL;
if (!base) throw new Error("BASE_URL is not set");
const response = await fetch(new URL("/api/test-support/reset", base), { method: "POST" });
if (!response.ok) throw new Error(`Stub reset failed with ${response.status}`);
