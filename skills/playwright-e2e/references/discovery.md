# Discovery

Answer these questions before writing any test. **Inspect the repo first**; ask the
user only for what the repo cannot tell you, and batch those questions into one
message. Record each answer and whether it came from the repo, the user, or a
default — step 6 (Report) lists the defaults used.

**Why:** generated code that ignores a repo's conventions creates a second,
competing framework inside the first. Following what exists is worth more than any
default in this skill.

## Checklist

| # | Question | Look in | If unknown |
|---|---|---|---|
| 1 | Which binding and runner? | `package.json`, `pyproject.toml`, `requirements*.txt`, lockfiles | Ask. |
| 2 | **Python only:** sync or async API? | `playwright.sync_api` vs `playwright.async_api` imports; `async def test_`; async pytest plugins and their config | Apply the rule below. |
| 3 | Where is the fixture entry point that tests import `test`/`expect` (or fixtures) from? | Imports in existing specs, path aliases in `tsconfig.json`, `conftest.py` files | Create the default from the templates. |
| 4 | Where do page objects and components live, and how are they named? | Existing page/component classes and their folders | Use the template default. |
| 5 | What is the test-ID attribute? | Playwright config (`testIdAttribute` / equivalent), app markup | Ask; default **`data-testid`** (Playwright's own default, so no config needed). |
| 6 | How is authentication set up, and which roles exist? | Setup projects, auth fixtures, `.auth/` or `playwright/.auth/` directories | Ask for the roles and the login API endpoint. If there is no usable login API, use the UI-login fallback in rule 8 and note it in the report. |
| 7 | Where does the app keep the session: cookies, localStorage, IndexedDB or sessionStorage? | Existing auth code; app behaviour after login (browser dev tools) | Ask. See *Session storage* below. |
| 8 | How can tests arrange and clean up data? Public API, test-support endpoints, the app's service layer (same repo), direct DB access, seeders? | Existing API client and data factories, API docs / OpenAPI spec, backend seeders and factories, test-only routes, DB connection config | Ask. Use the preference order in rule 10. If only the UI can create data, use a seeded per-worker account pool and read-only reference data, and say so in the plan. |
| 9 | Which environments does the suite run against, and is each `ephemeral` or `shared`? Who owns each one? | `docker-compose*.yml`, CI workflow files, README, environment config | Ask. Default to `shared` (rule 10). |
| 10 | How are base URL and secrets supplied? | Playwright/pytest config, `.env` handling, CI workflow files | Environment variables, with a git-ignored `.env` for local runs. |
| 11 | Which tags and lint tooling are already in use? | Existing tests, ESLint/Ruff/Semgrep configs | Defaults from `enforcement/`. |
| 13 | Do the repository's linters scan `.claude/`, where this skill is installed? | `eslint.config.*` ignores, `.semgrepignore`, Ruff `exclude` | Propose ignoring `.claude/**` (the skill folder holds templates and bad-code fixtures). |
| 12 | For `shared` environments: rate limits, scheduled resets, other users? Is baseline data seeded by the deploy pipeline? | Environment docs, README, pipeline config | Ask. Caps the worker count; decides whether skipping cleanup is ever justified (rule 10). |

## Python: sync or async

Decide once, during discovery:

- Only async signals in the repo → **async**; also load `python-async.md`.
- Only sync signals → **sync**.
- Both → **stop and ask the user.** Never pick one silently.
- Greenfield → **sync**, unless the user states an async requirement (for example,
  tests must share an event loop with an async application or async clients).

**Why sync by default:** async gives no speed benefit in tests because parallelism
comes from xdist processes; the main pytest plugin path is sync; and in async code an
un-awaited `expect` passes silently.

## Session storage

Playwright's storage state persists cookies, localStorage and (when requested)
IndexedDB, but **not sessionStorage** — Playwright has no API to persist it. If the
app keeps its auth token in sessionStorage:

1. After the API login, read the sessionStorage contents in the setup step and save
   them alongside the storage state file (same git-ignored directory).
2. Restore them in each new context with an init script that writes them back into
   `sessionStorage` before any page script runs.

Tell the user this is a workaround and that it needs the same protection as the
state file. The language reference gives the exact code.

## Conflicts with the rules

If an existing convention conflicts with a rule in `principles.md` — for example,
the repo already uses serial suites, inline locators or a UI login per test:

1. Follow the rule for **new** code.
2. Flag the conflict to the user in the plan (step 3) and the report (step 6),
   naming the files involved.
3. Do **not** refactor existing code unless the user asks.

Where the existing convention is merely a different style that does not break a rule
(a different folder name, a naming scheme, a different fixture file split), follow
the repo, not the skill's default.

## Output of discovery

Before step 3, hold a short summary like this (include it in the plan you present):

```
Binding: TypeScript, @playwright/test
Fixture entry point: tests/fixtures/index.ts (existing)
POMs: tests/pages/*.page.ts, components in tests/components/ (existing)
Test-ID attribute: data-test (from playwright.config.ts)
Auth: setup project, roles: customer, admin (existing); session in localStorage
Data: REST API supports create/delete for products and carts (from OpenAPI spec); no test-support endpoints
Environments: CI = ephemeral (docker-compose.ci.yml, seeders in global setup);
              staging = shared, nightly reset, no rate limit stated → workers: default
Base URL / secrets: BASE_URL, CUSTOMER_EMAIL, CUSTOMER_PASSWORD from .env (existing)
Lint: ESLint + eslint-plugin-playwright (existing); Semgrep rules: added from skill
Defaults applied: none
Conflicts: tests/legacy/checkout.spec.ts uses describe.serial — flagged, not changed
```
