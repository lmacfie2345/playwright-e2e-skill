# TypeScript / JavaScript binding (`@playwright/test`)

How each rule in `principles.md` is implemented with Playwright Test. Copy code from
`templates/typescript/`, which compiles under `strict` (plus `exactOptionalPropertyTypes`
and `noUncheckedIndexedAccess`), passes the skill's ESLint and Semgrep rules, and runs.
Snippets here are excerpts of those templates or were compiled against
`@playwright/test` 1.63.

Follow the repository's existing paths and names (discovery). The paths below are the
template defaults, used only where the repository has none.

## Layout (template default)

```
playwright.config.ts
.semgrepignore                      # from templates/typescript/semgrepignore (see Enforcement)
tests/e2e/
├── fixtures/
│   ├── index.ts                    # the single entry point: export test (mergeTests) and expect
│   ├── pages.ts                    # page-object fixtures
│   └── data.ts                     # data, accounts, sign-in fixtures
├── components/header.component.ts  # component objects
├── pages/product.page.ts           # page objects (compose components)
├── setup/
│   ├── auth.setup.ts               # one API login per shared role → storage state
│   ├── global-setup.ts             # TEST_ENV_KIND: reset (ephemeral) or verify baseline (shared)
│   └── global-teardown.ts          # run-level cleanup safety net
├── support/                        # env, auth helpers, API client, TestData (pure helpers, no page)
└── specs/<feature>/<behaviour>.spec.ts
```

## Rule → mechanics

| Rule | Mechanics |
|---|---|
| 1 Tests never touch the page | Specs receive page objects as fixtures and call their methods. Navigation is `pageObject.open()`. `page` itself is not used in specs, except `expect(page).toHaveURL(...)` |
| 2 Expose locators, web-first | `readonly x: Locator` fields; `await expect(po.x).toBeVisible()` / `toHaveText()` / `toHaveValue()`; field errors with `toHaveAccessibleDescription()` or `toHaveAccessibleErrorMessage()` |
| 3 Intent methods | `async addToCart(quantity: number): Promise<void>`; single-step methods (`setQuantity`) only when the step is the behaviour under test |
| 4 Components | A class taking `page` and scoping to a root (`page.getByRole("banner")`), held as a `readonly` field of each page that shows it |
| 5 Locators | `getByRole` → `getByLabel` → `getByText` → `getByPlaceholder` → `getByTestId` → `getByAltText` → `getByTitle` → `locator(css)` → `locator("xpath=…")`; CSS/XPath with a comment |
| 6 Readiness | `open()` ends with `await this.heading.waitFor()`; intent methods wait for the app's confirmation (`await this.addedNotice.waitFor()`) |
| 7 Fixtures | `base.extend<PageFixtures>()` per concern, combined with `mergeTests()` in `fixtures/index.ts`; specs import `{ test, expect }` from there |
| 8 Auth | A `setup` project + `dependencies`; `request.storageState({ path })`; `test.use({ storageState })` per file; per-worker accounts through worker fixtures |
| 9 Independence | `fullyParallel: true`; no `test.describe.serial` or `describe.configure({ mode: "serial" })`; journey tests use `test.step` |
| 10 Data | A test-scoped `data` fixture wrapping a `TestData` class; cleanup in the fixture's `finally`; `TEST_ENV_KIND` read in global setup and fixtures only |
| 11 Hygiene | Never `waitForTimeout`, `{ force: true }`, or `if`/`try` on page state in a spec |
| 12 Organisation | `specs/<feature>/`, `{ tag: ["@smoke"] }` details, `use.baseURL` from `process.env.BASE_URL`, credentials from env |

## Fixtures (rule 7)

Page objects, one fixture each, created lazily:

```ts
export const test = base.extend<PageFixtures>({
  productPage: async ({ page }, use) => {
    await use(new ProductPage(page));
  },
});
```

One entry point that every spec imports from:

```ts
// tests/e2e/fixtures/index.ts
export const test = mergeTests(pagesTest, dataTest);
export { expect } from "@playwright/test";
```

- **Scope:** expensive, read-only things (an admin API client, a database client, a
  per-worker account) are worker fixtures: `[async ({}, use, workerInfo) => { … }, { scope: "worker" }]`.
  Anything a test mutates is test-scoped.
- **Teardown:** code after `await use(…)` is teardown. Put cleanup in `try { await use(x) } finally { … }`
  so it runs when the test fails.
- **Default role:** override the built-in `storageState` option fixture to give every
  test the per-worker account by default (templates `fixtures/data.ts`); a spec file
  changes role with `test.use({ storageState: ADMIN_STATE })`.
- **Worker index:** use `workerInfo.parallelIndex` (stable across worker restarts,
  0…workers-1) for per-worker file names and accounts, not `workerIndex`.

## Authentication (rule 8)

```ts
// playwright.config.ts
projects: [
  { name: "setup", testMatch: /.*\.setup\.ts/ },
  { name: "chromium", testMatch: /.*\.spec\.ts/, use: { ...devices["Desktop Chrome"] }, dependencies: ["setup"] },
],
```

`setup/auth.setup.ts` signs each shared role in through the API and saves
`request.storageState({ path: ADMIN_STATE })`. Roles whose tests mutate account state
get a per-worker account: a worker fixture creates the account through the API, signs it
in with `playwright.request.newContext({ baseURL })`, and keeps `await request.storageState()`
in memory (the `storageState` option accepts the object). No per-worker token file is
written; only the shared roles' files from the setup project exist on disk.

- **Opt out:** `test.use({ storageState: { cookies: [], origins: [] } })` at the top of
  sign-in, sign-up and sign-out specs.
- **Sign a test's own account in mid-test** (for example, a fresh user created by the
  test): call the login API with `page.context().request`. It shares cookie storage with
  the browser context, so the page is signed in. Templates: the `signInAs` fixture.
- **Session in localStorage** (a JWT the SPA reads): API login, then
  `context.addInitScript` to write the token before the app loads, or sign in once
  through the UI in the setup step. `storageState()` captures localStorage, so the saved
  file restores it.
- **Session in IndexedDB:** save with `request`/`context.storageState({ path, indexedDB: true })`.
- **Session in sessionStorage:** not captured by storage state. In the setup step, read
  it with `page.evaluate(() => JSON.stringify(sessionStorage))`, save it beside the state
  file, and restore it in a fixture with `context.addInitScript` that writes each key back.
- **No usable login API** (rule 8 fallback): in `auth.setup.ts`, use the sign-in page
  object once per role, wait for the signed-in state, then `page.context().storageState({ path })`.
- **Auth.js / NextAuth credentials** (no JSON login API): GET `/api/auth/csrf`, then POST
  `/api/auth/callback/credentials` as a form with `csrfToken`, `email`, `password`,
  `callbackUrl` and `maxRedirects: 0`; success is a 302 not pointing at `/api/auth/error`.
  Verified against next-auth 5 beta.

Git-ignore `playwright/.auth/` (templates `gitignore.entries`).

## Data (rule 10)

- **Run ID:** `global-setup.ts` sets `process.env.TEST_RUN_ID`; workers inherit it.
  `TestData.uniqueName(label)` returns `e2e-<run>-w<parallelIndex>-<label>-<random>`.
- **Environment kind:** `TEST_ENV_KIND=ephemeral|shared` (default `shared`), read only in
  `support/env.ts`, global setup and data fixtures. In `ephemeral`, global setup runs the
  project's reset-and-seed command before workers start; in `shared` it only checks the
  baseline and fails fast.
- **Cleanup:** `TestData` pushes a delete for every record it creates and runs them newest
  first in the fixture's `finally`. Records a test creates through the UI are registered
  by unique name (`data.cleanUpEvidenceTitled(...)`-style methods). Global teardown deletes
  anything left with this run's prefix.
- **Arrange through the app's service layer** (preference step 3, same repo): import the
  service functions in `support/test-data.ts` and pass them a database client from a
  worker fixture. Playwright resolves `tsconfig.json` `paths` aliases (for example `@/lib/...`)
  in test files. Keep these imports out of specs: only the data fixture knows how data is made.
- **Network mocking:** `await page.route("**/api/payments", (route) => route.fulfill({ status: 502 }))`
  inside a page-object or fixture method, in a test tagged `@mocked`.

## Assertions (rules 2, 6)

Always `await` web-first assertions: `toBeVisible`, `toBeHidden`, `toHaveText`,
`toContainText`, `toHaveValue`, `toHaveCount`, `toHaveURL`, `toBeChecked`,
`toHaveAttribute`, `toHaveAccessibleDescription`. For a value that is not on the page,
use `await expect.poll(() => api.orderStatus(id)).toBe("paid")`. Never
`expect(await locator.isVisible()).toBe(true)`.

## Journey tests (rule 9)

```ts
// JOURNEY TEST
// Flow: checkout (revenue path)
// Why end-to-end: verifies an order is created across cart, payment and confirmation
// Approved by: <name>, <date> (or: the user's explicit request for this journey, <date>)
test("places an order for an in-stock product", { tag: ["@journey"] }, async ({ data, signInAs, productPage, cartPage, checkoutPage }) => {
  await signInAs(await data.createCustomer()); // own account: the cart count below is an account-wide total
  const product = await data.createProduct("lamp");

  await test.step("add the product to the cart", async () => {
    await productPage.open(product.id);
    await productPage.addToCart(1);
    await expect(productPage.header.cartCount).toHaveText("1");
  });

  await test.step("pay and confirm", async () => {
    await cartPage.open();
    await cartPage.checkOut();
    await checkoutPage.payWith(testCards.valid);
    await expect(checkoutPage.confirmation).toContainText(product.name);
  });
});
```

`cartPage`, `checkoutPage` and `testCards` are illustrative; the structure (comment block, tag,
one `test.step` per stage, a checkpoint assertion in each) was compiled and run.
`test.step` names each stage in the report and trace. Do not nest steps more than one
level (ESLint `playwright/no-nested-step`).

## Serial exception (rule 9)

Only with the user's approval, recorded in the comment the rule requires:

```ts
// SERIAL EXCEPTION
// Why: …   Approved by: …   Tracking: …
// nosemgrep: pw-no-serial
test.describe.configure({ mode: "serial" });
```

`nosemgrep` is allowed only under a complete SERIAL EXCEPTION comment; it is the one
suppression this skill permits.

## Tags and selection (rule 12)

`test("…", { tag: ["@smoke"] }, async (…) => …)` or on `test.describe`. Run with
`npx playwright test --grep @smoke`. Tags never go in title text alone.

## Enforcement

Install with the user's agreement; the first two change repository files, the hook
changes their Claude Code settings. Whatever they choose, ESLint must ignore `.claude/**`
(see SKILL.md step 2): in two evaluation runs, installing the skill alone made
`npm run lint` fail on the skill's own template files.

1. **ESLint:** merge `enforcement/eslint.config.excerpt.mjs` into `eslint.config.mjs`
   (`npm i -D eslint-plugin-playwright typescript-eslint`). Add `.claude/**` to the
   config's `ignores`: the skill folder contains deliberately bad code (Semgrep test
   fixtures) and template files.
2. **Semgrep:** copy `templates/typescript/semgrepignore` to `.semgrepignore` at the
   repository root. Without it, **Semgrep skips any `tests/` directory by default** and
   reports nothing. Run:
   `semgrep --config .claude/skills/playwright-e2e/enforcement/semgrep --metrics=off --error tests/e2e`
   (set `SEMGREP_ENABLE_VERSION_CHECK=0` where the network is restricted).
3. **Hook (offer, then install only on a yes):** merge
   `enforcement/claude-hook.example.json` into `.claude/settings.json`. After every edit
   to a file under `tests/e2e` (override with `E2E_TEST_DIRS=dir1,dir2`), it runs Semgrep
   and ESLint on that file and shows violations to Claude. It needs Node; it skips a tool
   that is not installed.

## Definition of done (commands)

```bash
npx tsc --noEmit
npx eslint tests/e2e
semgrep --config .claude/skills/playwright-e2e/enforcement/semgrep --metrics=off --error tests/e2e
npx playwright test --list
npx playwright test --repeat-each=3 --workers=4      # new tests, several workers
npx playwright test -g "<exact test title>"          # each new test alone
git status --porcelain                                # no .env, playwright/.auth or reports staged
```

## Pitfalls

- **React projects:** `eslint-plugin-react-hooks` flags every fixture's `use(...)` as a
  hook call. Turn `react-hooks/rules-of-hooks` off for the end-to-end test files only; it
  is a React rule, not a test rule.
- **`next dev` and other compile-on-demand servers:** the first visit to each route (and
  its server actions) compiles it. Several workers hitting cold routes at once can exceed
  the assertion timeout and fail the first tests of a run. Warm the routes in global
  setup, after `webServer` is up and before workers start: launch a browser, sign in
  through the API on `context.request`, and `page.goto()` each route the suite uses once
  (including a dynamic route with a real id). In the proof run this turned cold-start
  failures (2 of 25) into a clean 25 of 25. Never paper over it with sleeps or retries.
- **`exactOptionalPropertyTypes`:** `workerInfo.project.use.baseURL` is `string | undefined`;
  pass it through a `requireBaseUrl()` helper rather than a non-null assertion.
- **Account-wide totals on a shared account:** a cart count or badge on the per-worker
  account includes other tests' actions in that worker. The verify run caught exactly
  this in a template (a cart-count assertion passed or failed depending on test order).
  Assert on the test's own record, or `signInAs(await data.createCustomer())` first.
- **Strict mode violations** ("resolved to 2 elements"): narrow with `exact: true`,
  `filter({ hasText })` or a component root; never `.first()` to silence it.
- **Next.js route announcer:** an empty `role="alert"` exists on every page; filter alerts
  by text (`getByRole("alert").filter({ hasText: /\S/ })`).
