import { expect, type APIRequestContext } from "@playwright/test";

export interface Credentials {
  readonly email: string;
  readonly password: string;
}

/** Storage-state files, one per role. Git-ignored: they hold live session tokens. */
export const AUTH_DIR = "playwright/.auth";
export const ADMIN_STATE = `${AUTH_DIR}/admin.json`;

/** Storage state with no session, for tests of signing in, signing up and signing out. */
export const NO_SESSION = { cookies: [], origins: [] };

/**
 * Signs in through the application's login API, never the UI (rule 8). Session cookies land in `request`'s
 * storage: pass `page.context().request` to sign a browser context in, or save them with
 * `request.storageState({ path })`.
 *
 * Replace the endpoint and payload with your application's. If the app keeps its token in localStorage
 * rather than a cookie, store it with an init script instead (see references/typescript.md).
 */
export async function signInViaApi(request: APIRequestContext, credentials: Credentials): Promise<void> {
  const response = await request.post("/api/auth/login", {
    data: { email: credentials.email, password: credentials.password },
  });
  expect(response.ok(), `Login API returned ${response.status()}`).toBe(true);
}
