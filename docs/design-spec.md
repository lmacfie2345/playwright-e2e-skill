# Playwright E2E Skill — Design Spec

Oct 7, 2026 · Lu Macfie

## Handover notes for the builder

This spec defines a Claude Code skill named `playwright-e2e`; build it phase by phase as set out in *Build plan*, and stop for review at each phase gate.

- **Verify, don't recall.** Check every Playwright API, config key, plugin option and Claude Code feature (skill frontmatter, hooks) against the current official docs before writing it into the skill. The agent that later uses this skill will trust the reference files completely, so a plausible-but-wrong snippet is worse than a missing one.
- **Run what you write.** Every template and example must compile, lint and pass against a real sample project before it ships. Unverified content is marked `UNVERIFIED` and listed in the phase report.
- **Rules carry reasons.** Write each rule with a one-line *why*. Agents generalise from reasons; bare MUSTs get applied rigidly or ignored at the edges.
- **If the skill-creator skill is available, use it** for the SKILL.md structure, description tuning and evaluation runs.
- **Questions go to Lu.** Anything this spec leaves open is listed under *Open questions*; do not resolve those by assumption.

## Problem and purpose

When asked to write Playwright end-to-end tests, AI agents default to a flat structure: one long serial chain of tests, inline locators, page objects constructed inside tests, and UI login repeated in every test. The output works once but is slow, flaky under parallelism and expensive to maintain.

The skill makes an agent produce tests the way a senior SDET would:

- page objects own all locators and actions; tests express intent and assertions only;
- page objects reach tests through the runner's dependency-injection mechanism, never `new` in a test body;
- authentication happens once per role via the API, and is reused through storage state;
- every test is independent, parallel-safe and arranges its own data;
- the conventions are enforced mechanically by lint rules, not left to the agent's discipline.

The structural rules (POM, fixtures) alone do not fix the flat/serial problem; the test-independence and data rules are what change the shape of the output, so they carry equal weight.

## Scope of v1

v1 is a Claude Code skill covering TypeScript and Python, with language-neutral principles so further bindings can be added without rewriting the core.

| Area | In v1 | Out of v1 |
| --- | --- | --- |
| Agent | Claude Code | Copilot, Cursor and other agents (content stays portable; see *Design principles*) |
| Languages | TypeScript/JavaScript with `@playwright/test`; Python with `pytest-playwright` | Java, .NET, Playwright used as a library under Jest/Vitest/Mocha |
| Python API style | Sync by default; async supported when the repo already uses it | Converting a repo between sync and async |
| Project types | Greenfield scaffolding and brownfield extension | Migrating from Cypress/Selenium |
| Test types | Browser E2E, with API calls used for arrange/setup | Standalone API test suites, visual regression, component testing, mobile |

The skill is portable across applications: nothing in it is specific to one product, URL, test-ID value or folder name.

## Design principles for the skill itself

The skill is a thin router over portable content, backed by mechanical enforcement.

1. **Thin SKILL.md, deep references.** SKILL.md holds the workflow and the rule summary, and points to reference files loaded only when needed. A Python repo never loads the TypeScript reference. Keep SKILL.md well under 500 lines.
2. **Principles are language-neutral; mechanics are per language.** Each rule is stated once in `principles.md`, with how it is implemented in each binding given in that language's reference file.
3. **Discover before generating.** The agent inspects the repo's existing conventions (paths, fixture entry point, API style, auth setup) and follows them. Defaults apply only where nothing exists.
4. **Examples over prose.** Every major rule has a canonical good example and, where agents commonly fail, a bad example of the anti-pattern. Agents imitate examples more reliably than they follow rules.
5. **Enforcement over trust.** Every rule that can be checked statically has a lint or Semgrep rule. The skill tells the agent to run them; a Claude Code hook runs them automatically after edits.
6. **Portable content, Claude-specific shell.** Only SKILL.md's frontmatter, its workflow wording and the hook config are Claude Code-specific. Everything in `references/`, `templates/` and `enforcement/` is plain content another agent's entry file could point at later.
7. **Verified or marked.** No content ships unverified without an explicit `UNVERIFIED` marker.

## Skill directory layout

The skill ships as one folder; only SKILL.md is loaded on trigger, and everything else is read on demand.

```
playwright-e2e/
├── SKILL.md                         # trigger description, workflow, rule summary, pointers
├── references/
│   ├── principles.md                # every rule with its why, plus good/bad patterns in pseudocode
│   ├── discovery.md                 # what to establish about the repo and the app before writing
│   ├── typescript.md                # TS mechanics for each principle + canonical snippets (phase 2)
│   ├── python.md                    # Python (sync) mechanics + canonical snippets (phase 3)
│   └── python-async.md              # only what differs when the repo uses the async API (phase 4)
├── templates/
│   ├── typescript/                  # config, .semgrepignore, gitignore entries, tests/e2e/{fixtures,components,pages,setup,support,specs}
│   └── python/                      # POM, component, conftest, auth fixture, test module
└── enforcement/
    ├── semgrep/                     # portable rules + their semgrep --test fixture
    ├── eslint.config.excerpt.mjs    # TS-native rules incl. eslint-plugin-playwright
    ├── pyright.excerpt.json         # async Python: unused-coroutine check (phase 4)
    ├── hooks/lint-e2e.mjs           # post-edit check: Semgrep + ESLint on the edited e2e file
    └── claude-hook.example.json     # PostToolUse hook config for Claude Code
```

**Install location (decided):** per-repo, at `.claude/skills/playwright-e2e/`, committed with the project so the team shares it and the enforcement files sit beside the code they check.

## SKILL.md specification

SKILL.md must trigger on any Playwright test-writing task and walk the agent through a fixed six-step workflow.

**Frontmatter (draft; tune during evaluation):**

```yaml
name: playwright-e2e
description: >
  Use whenever writing, generating, extending or refactoring Playwright end-to-end
  tests in TypeScript/JavaScript or Python: adding tests for a feature, creating page
  objects or fixtures, scaffolding a Playwright framework, setting up authenticated
  test sessions, or fixing flaky, serial or order-dependent tests. Enforces Page
  Object Model, fixture-provided page objects, storage-state authentication and
  independent, parallel-safe tests.
```

**Workflow the agent follows:**

1. **Detect the binding.** `@playwright/test` in `package.json` → TypeScript. `pytest-playwright` (or Playwright plus pytest) in `pyproject.toml`/requirements → Python. Load the matching reference file. Anything else → apply `principles.md`, state that no verified reference exists for that language, and proceed with care.
2. **Discover conventions.** Work through `discovery.md`. Follow what exists; use defaults only for what doesn't. For Python, determine sync versus async here (rule in *Language references*).
3. **Plan before writing.** List the specs to create, the scenarios in each, the POMs and components needed (new versus existing), the fixtures needed, the data each test arranges with the arrange method chosen (rule 10 order) and its cleanup, and any proposed journey test with its flow and reason. Present this plan to the user for anything larger than a single test; a proposed journey test always needs the user's approval, even in a one-test plan.
4. **Build bottom-up.** Components and POMs, then fixtures, then auth setup if missing, then specs.
5. **Verify.** Run the definition-of-done checks. Fix and re-run until they pass; never weaken a check or a lint rule to get green.
6. **Report.** State what was created, which conventions were followed or defaulted, and anything left unresolved.

**Rule summary in SKILL.md:** one line per rule from `principles.md`, each with its why, plus the pointer to the full file.

## Core test-design rules (principles.md)

These twelve rules are the content of `principles.md`; each is stated language-neutrally with its reason, and the language references show the mechanics.

**Page objects**

1. **Tests never construct locators or call raw page interactions.** All locators and actions live in page objects. *Why:* a UI change is fixed in one place, and tests read as behaviour.
2. **Page objects expose read-only locators for assertions.** Tests assert on them with web-first assertions; POMs never expose boolean helpers like `isVisible()` for assertions. *Why:* boolean checks don't retry and are a top source of flakiness.
3. **Methods express user intent**, such as `addToCart(quantity)` or `signIn(user)`, not one wrapper per click. The method hides *how* the UI reaches the goal; the test states *what* the user does. Two naming checks: would a product owner describe the action this way, and would the name survive a UI redesign of the same feature? Fine-grained methods, named for the action rather than the control, are allowed when the step itself is the behaviour under test. *Why:* one-to-one wrappers move locators out of tests but leave the sequence of UI steps in, so one UI change means editing every test instead of one method.
4. **Shared UI regions are component objects** (header, navigation, product card, modal) composed into pages. Base *test* classes for injection are fine; deep base *page* hierarchies full of helpers are not. *Why:* avoids duplicated locators and god classes.
5. **Locator priority:** `getByRole` → `getByLabel` → `getByText` → `getByPlaceholder` → `getByTestId` → `getByAltText` → `getByTitle` → CSS → XPath. CSS and XPath only with a one-line comment saying why. This differs deliberately from Playwright's documented order (Role, Text, Label, Placeholder, AltText, Title, TestId): Label ranks above Text for form controls, and TestId above AltText and Title when the app ships test IDs. *Why:* user-facing locators survive restyling and double as an accessibility check; DOM-structure selectors break.
6. **POMs may wait for readiness; business assertions stay in tests.** *Why:* a test must show what it verifies.

**Provisioning and authentication**

7. **Page objects come from the runner's DI mechanism** (fixtures in TS and pytest), never instantiated in a test body. Tests import their test function and `expect` from the project's single fixture entry point. *Why:* one wiring point, lazy creation, consistent lifecycle.
8. **Authenticate once per role via the API and reuse storage state.** State files are git-ignored because they hold live tokens. Tests of login/registration explicitly opt out to an empty state. Stateful flows (cart, profile) use per-worker accounts. **No usable login API** (none exists, or CAPTCHA/MFA blocks it): log in through the UI once per role (or per worker) in the auth setup step, wait for the session to be established, save the state and reuse it the same way. Never a UI login inside a test; the report states that the fallback was used and why. *Why:* speed, and no collisions between parallel workers.

**Independence and data**

9. **Every test is independent.** Parallel execution is on. No serial suites, test ordering or shared mutable state between tests; each test passes when run alone. By default each behaviour gets its own focused test. *Why:* this is the rule that fixes flat, serial output.
   - **Critical journey tests**, one test walking a business-critical flow end to end, are allowed only with the user's approval in the plan and a stated reason (a request that explicitly asks for one end-to-end journey test counts as that approval), and only when they are: in addition to focused tests, never instead; still independent (own data, per-worker account if mutating, cleanup, run alone and in parallel); split into named steps (`test.step`) that each assert their checkpoint; tagged (for example `@journey`) and few. A comment records the flow, the reason and the approver.
   - **Serial suites** stay prohibited unless the flow cannot be one journey test (for example, it exceeds one test's timeout) *and* its intermediate state cannot be arranged by any rule 10 method or a direct URL. The user approves explicitly (the agent never self-approves), and a comment states why, who approved, and a ticket to remove the exception.
10. **Arrange data outside the UI, act and assert through the UI.** *Why:* fast setup, and no interference with other workers or other users of the environment.
    - **Environment kind** is declared in configuration: `ephemeral` (docker-compose locally or in CI, owned by the suite for one run) or `shared` (a QA or staging environment, or a hosted app the team doesn't control). Default `shared`. Global setup and data fixtures choose the strategy; tests never branch on it.
    - **Baseline data** (reference data, role accounts, per-worker account pool) is set up once per run before workers start: seeders or a seeded image in `ephemeral`, verified as present in `shared`. It is read-only to tests. Seeding or resetting happens only in `ephemeral`, never while workers run.
    - **Per-test data** uses the first available method in this order: public API → test-support endpoint → the app's own service layer called in-process (same repo only) → direct database insert → UI. The plan names the method and why. Records carry unique IDs with a run-ID prefix. Network mocking is a separate, tagged category (`@mocked`), never counted as end-to-end coverage.
    - **Assert on the test's own data**, never on global counts or list totals.
    - **Cleanup in layers:** per-test fixture teardown always (reverse order, runs on failure); a run-level safety net (delete by run-ID prefix, or a scheduled sweeper); environment reset or teardown in `ephemeral` only. Skipping teardown is allowed only for `ephemeral`, or `shared` with a scheduled reset, with a comment saying which.
    - **Security:** test-support endpoints are absent from production builds and token-protected; database credentials are least-privilege, from environment variables, never logged; seeders refuse to run unless the target is `ephemeral`.

**Hygiene**

11. **No fixed sleeps, no forced actions, no conditionals in tests.** *Why:* each one hides a timing or state problem rather than fixing it.
12. **Organisation and configuration:** folders by feature domain, one spec per feature or journey, test titles stating the expected behaviour, tags through the runner's native mechanism. Base URL and credentials come from environment configuration; no URLs or secrets in tests. Helpers are pure, stateless utilities only: anything touching the page is a POM or component, and anything with setup/teardown is a fixture.

`principles.md` must also contain one bad example: a flat, serial spec with inline locators and UI login, annotated with which rules it breaks, followed by its corrected version. It also carries worked examples for rule 3 (click-wrappers versus an intent method, and what a UI change costs each), a journey test with named steps, the serial-exception comment, and the rule 10 cleanup fixture.

## Discovery checklist (discovery.md)

Before writing any test, the agent answers these questions, by inspecting the repo first and asking the user only for what the repo cannot tell it.

| Question | Look in | If unknown |
| --- | --- | --- |
| Which binding and runner? | `package.json`, `pyproject.toml`, requirements files | Ask |
| Python only: sync or async? | `playwright.sync_api` vs `playwright.async_api` imports, `async def test_`, async plugins | Rule in Language references |
| Where is the fixture entry point that tests import from? | Existing specs' imports, path aliases, `conftest.py` | Create the default from the templates |
| Where do POMs and components live, and how are they named? | Existing page classes | Template default |
| What is the test-ID attribute? | Playwright config (`testIdAttribute`), app markup | Ask; default `data-testid` |
| How is authentication set up, and which roles exist? | Setup projects, auth fixtures, `.auth/` or similar | Ask for roles and the login API. No usable login API → UI-login fallback in rule 8, noted in the report |
| Where does the app keep the session: cookies, localStorage or sessionStorage? | App behaviour, existing auth code | Ask. sessionStorage is not captured by storage state and needs an init-script workaround |
| How can tests arrange and clean up data: public API, test-support endpoints, direct DB access, seeders? | API client, factories, API docs, backend seeders and factories, test-only routes, DB config | Ask. Use the rule 10 preference order. UI only → seeded per-worker account pool and read-only reference data |
| Which environments does the suite run against, is each `ephemeral` or `shared`, and who owns it? | `docker-compose*.yml`, CI files, README, environment config | Ask; default `shared` |
| For `shared` environments: rate limits, scheduled resets, other users, baseline seeded by the pipeline? | Environment docs, README, pipeline config | Ask. Caps the worker count and decides whether skipping cleanup is justified |
| How are base URL and secrets supplied? | Config, `.env` handling, CI files | Environment variables with a git-ignored `.env` |
| Which tags and lint tooling are already in use? | Existing tests, lint configs | Defaults from Enforcement layer |

If an existing convention conflicts with a rule in `principles.md` (for example, a repo that already uses serial suites), the agent follows the rule for new code, flags the conflict to the user, and does not refactor existing code unasked.

## Language references

Each reference file maps every principle to its binding's mechanics; the table below is the required coverage, and each cell must be verified against current docs before shipping.

| Concept | TypeScript (`typescript.md`) | Python sync (`python.md`) |
| --- | --- | --- |
| POM provisioning | `test.extend` fixtures, split by concern, combined with `mergeTests`; one entry file re-exports `test` and `expect` | `@pytest.fixture` functions in `conftest.py` returning POM instances |
| Auth state reuse | `setup` project + `dependencies`; projects set `use.storageState` per role | Session-scoped login fixture writes the state file; override `browser_context_args` to load it |
| Opting out of auth | `test.use({ storageState: { cookies: [], origins: [] } })` | A fixture or marker giving a fresh context without state |
| API client for arranging data | `request` fixture / `APIRequestContext`, wrapped in a typed client fixture | `playwright.request.new_context()` wrapped in a client fixture |
| Web-first assertion | `await expect(locator).toHaveText(...)` | `expect(locator).to_have_text(...)` |
| Parallelism | `fullyParallel: true`; workers set in config | `pytest-xdist` (`-n auto`) |
| Per-worker identity | `testInfo.workerIndex` / `parallelIndex` | `worker_id` fixture from xdist |
| Tagging | `{ tag: ['@smoke'] }` option | `@pytest.mark.smoke`, markers registered in config |
| Base URL | `use.baseURL` from env | `--base-url` / `base_url` setting |
| Static checks | `tsc --noEmit`, ESLint | Pyright or mypy, Ruff |
| Named steps (journey tests) | `test.step()` | No native pytest equivalent; choose in phase 3 |
| Environment-driven data strategy | globalSetup + a data fixture reading the environment kind | Session-scoped setup + a data fixture reading the environment kind |

**Python: sync or async.** The agent decides once, during discovery:

1. Only async signals in the repo → async, using `python-async.md`.
2. Only sync signals → sync.
3. Both → stop and ask the user. Never pick one silently.
4. Greenfield → sync, unless the user states an async requirement (for example, tests must share an event loop with an async application or async clients).

*Why sync by default:* async gives no speed benefit in tests because parallelism comes from xdist processes; the main plugin path is sync; and async allows an un-awaited `expect` to pass silently.

`python-async.md` covers only the differences: `async def` tests and fixtures, every Playwright call and `expect` awaited, plugin and event-loop-scope config copied from the repo rather than invented, and the extra unawaited-coroutine check in the definition of done.

**Pitfall the Python reference must call out:** under xdist, `scope="session"` means once per worker, not once per run. Auth state generation must either tolerate running per worker or use a file lock, so workers don't race to write the same file.

## Templates

Each language gets the same six canonical templates, written to the strictest settings of that language and used as the agent's model for new code.

| Template | TypeScript | Python |
| --- | --- | --- |
| Component object | `header.component.ts` | `header_component.py` |
| Page object composing a component | `product.page.ts` | `product_page.py` |
| Fixture entry point | `fixtures/pages.ts`, `fixtures/api.ts`, `fixtures/index.ts` (`mergeTests`) | `conftest.py` |
| Auth setup per role | `auth.setup.ts` + config excerpt | Auth fixture with file lock |
| Spec using arrange-via-API | `add-to-cart.spec.ts` | `test_add_to_cart.py` |
| Config excerpt | `playwright.config.ts` (projects, `fullyParallel`, `testIdAttribute`, `baseURL`) | `pyproject.toml` pytest section (markers, base URL, xdist) |

Template requirements:

- **Strict typing.** TypeScript in `strict` mode with explicit return types. Python fully type-hinted and clean under Pyright strict.
- **Placeholders, not product values.** Use test IDs like `cart-quantity` that are clearly illustrative. No real URLs, credentials or product names.
- **Security.** Credentials come from environment variables; state files sit in a git-ignored directory; nothing logs tokens or passwords; `.gitignore` entries are part of the template set.
- **Proven.** Every template is run against a sample app in the phase that introduces it.

## Enforcement layer

Semgrep is the primary, cross-language enforcement layer; language-native linters add what Semgrep cannot express.

| Rule ID | Catches | TS | Python |
| --- | --- | --- | --- |
| `pw-no-raw-page-in-test` | `page.locator`, `page.click`, `page.fill`, `getBy*`/`get_by_*` called on `page` inside test files | Yes | Yes |
| `pw-no-pom-instantiation-in-test` | `new XxxPage(` / `XxxPage(page)` inside test bodies | Yes | Yes |
| `pw-no-fixed-wait` | `waitForTimeout`, `wait_for_timeout`, `time.sleep`, `asyncio.sleep` in tests and POMs | Yes | Yes |
| `pw-no-serial` | `test.describe.serial`, `describe.configure({ mode: 'serial' })`, pytest ordering markers | Yes | Yes |
| `pw-no-force` | `force: true` / `force=True` on actions | Yes | Yes |
| `pw-no-boolean-assert` | `expect(await x.isVisible()).toBe(true)` and the Python equivalent | Yes | Yes |
| `pw-unawaited-expect` | Bare `expect(...)` statement without `await` in async tests | Yes | Async only |

Language-native additions:

- **TypeScript:** ESLint with `eslint-plugin-playwright` (recommended set, plus `no-wait-for-timeout`, `no-force-option`, `prefer-web-first-assertions`, `no-conditional-in-test`, `missing-playwright-await`), and `@typescript-eslint/no-floating-promises`.
- **Python async:** Pyright `reportUnusedCoroutine`, or mypy with the `unused-awaitable` error code enabled.

**Claude Code hook.** `claude-hook.example.json` runs Semgrep, and ESLint for TypeScript, on test and page files after each edit, so the agent sees violations immediately. The builder must confirm the current hook configuration format in Claude Code's docs. Decided: the skill offers the hook and installs it only after the user confirms, since it changes the user's settings. The hook is a Node script, so it runs on Windows too.

Semgrep skips tests/ directories by default, so the TypeScript templates ship a root .semgrepignore that replaces those defaults (and ignores .claude/). ESLint must also ignore .claude/\*\*, or the installed skill's own template files fail npm run lint. Each Semgrep rule ships with a positive and a negative fixture file and passes `semgrep --test`.

## Definition of done for generated tests

The agent declares work complete only when all of these pass, and it reports any it could not run and why.

1. Type check passes: `tsc --noEmit`, or Pyright/mypy.
2. Lint passes: Semgrep rules plus ESLint or Ruff, with no rules disabled or suppressed to get there.
3. Test discovery works: `npx playwright test --list`, or `pytest --collect-only`.
4. New tests pass three times in parallel, to surface order dependence and flakiness: `--repeat-each=3` with several workers in TypeScript; for Python, xdist with `pytest-repeat` (`--count=3`) if available, otherwise three consecutive runs.
5. Each new test passes when run alone, filtered by its title.
6. No new secrets, state files or `.env` files are staged for commit.

If the environment can't run the tests (no network access to the app, say), the agent completes checks 1–3 and 6, and states clearly that 4–5 are outstanding.

## Build plan, evaluation and acceptance criteria

Build in four phases, TypeScript before Python, and do not start a phase until Lu has accepted the previous gate.

| Phase | Deliverables | Gate |
| --- | --- | --- |
| 1. Core | `SKILL.md`, `principles.md`, `discovery.md`, the bad/good example pair | Lu reviews the rules and workflow wording |
| 2. TypeScript | `typescript.md`, TS templates, ESLint excerpt, Semgrep rules for TS with test fixtures, hook example | Templates pass the definition of done on a sample TS project; evaluation below passes for TS |
| 3. Python sync | `python.md`, Python templates, Semgrep rules for Python | Same, on a sample Python project |
| 4. Python async | `python-async.md`, async Semgrep rule, Pyright/mypy excerpt | Same, on a small async sample |

**Evaluation.** Each language phase runs the same prompts with and without the skill, in a fresh Claude Code session each time:

1. Greenfield: "Write E2E tests for login, product search and add-to-cart."
2. Brownfield: add a test to an existing project that already has POMs and fixtures. The skill must reuse them, not create parallel ones.
3. Bait for flat output: "Write one test file covering the whole checkout journey step by step." The skill must still produce focused, independent tests; at most one journey test, proposed in the plan with its reason and built only after approval.
4. Python only: a repo that mixes sync and async. The agent must stop and ask.

Score each run against the twelve rules plus the definition of done. **Acceptance:** with the skill, every run passes all enforcement checks and violates none of rules 1, 7, 8 and 9. Without the skill, the baseline violations are recorded, to show the skill is what made the difference.

**Trigger check:** run five Playwright-related prompts that should trigger the skill and three nearby prompts that should not (for example, a unit test with Jest, or a Selenium question). Tune the description until it triggers correctly.

## Open questions

These are for Lu to decide; the builder must not resolve them by assumption.

- [x] **Install location:** decided — per-repo `.claude/skills/playwright-e2e/`.
- [x] **Sample projects for the gates:** decided for phase 2 — Lu's ProgressionCoach app (Next.js, Prisma, Postgres). Which app the Python samples target is still open (phase 3).
- [x] **Default test-ID attribute:** decided — `data-testid` (Playwright's own default).
- [x] **Cleanup default:** decided — per-test teardown always; skipping only for `ephemeral` environments or `shared` ones with a scheduled reset, with a comment (rule 10).
- [x] **Hook installation:** decided — the skill offers the hook and installs it only after the user confirms.
- [x] **Exception policy for rule 9:** decided — critical journey tests allowed with approval and conditions; serial suites only under the stricter exception (rule 9).
- [ ] **Python named steps:** which equivalent of `test.step` the Python binding uses for journey tests (decide in phase 3).
- [x] **Environment-kind setting:** decided — `TEST_ENV_KIND=ephemeral|shared`, default `shared`.
- [x] **Explicit journey requests:** decided — a request that explicitly asks for one end-to-end journey test counts as rule 9 approval; the other journey-test conditions, including focused tests alongside it, still apply.

## Phase 2 results (TypeScript)

Phase 2 is built and waiting at its gate: the templates pass the definition of done on ProgressionCoach, and every with-skill evaluation run broke none of rules 1, 7, 8 and 9.

**Proof on ProgressionCoach.** A separate suite (`tests/e2e-pom`, own config, existing smoke suite untouched) instantiates every template pattern: 8 tests across sign-in, profile set-up, evidence and admin. `tsc`, ESLint and Semgrep are clean; 25 of 25 pass with 3 workers and `--repeat-each=3` from a cold server; each test passes alone in `shared` mode; no test data is left behind. The generic templates also compile at the strictest TypeScript settings and run unchanged against a stub app.

**Evaluation.** Agents ran in fresh sessions on clean copies of the repo. The first baselines read the skill from the Project docs, so two were repeated with Projects and memory blocked; the contaminated runs are excluded.

| Prompt | Run | Tests | Semgrep findings (new code) | Rules 1, 7, 8, 9 |
| --- | --- | --- | --- | --- |
| Greenfield: sign-in, profile, evidence | With skill | 10 | 0 | No violations |
| Greenfield | Baseline | 20 | 3 raw `page.goto` in a spec | Rule 1 broken (minor) |
| Bait: one file, whole journey | With skill | 1 journey + 3 focused | 0 | No violations |
| Bait | Baseline | 1 journey only | 26 raw page calls, 5 page objects built in the test | Rules 1 and 7 broken |
| Brownfield: edit evidence title | With skill | +1, reused existing page objects | 0 | No violations |
| Brownfield | Baseline | Excluded (read the skill from Project docs) | – | – |

The existing hand-off suite (`smoke.spec.ts`, written without the skill) has 207 raw page calls, a serial suite and a forced action; it is the clearest real-world baseline.

**Fixed after the evaluation:**

- `pw-no-force` flagged `fs.rm(..., { force: true })`; it now matches Playwright actions only.
- Installing the skill made `npm run lint` fail on its own template files; the skill now has the agent propose ignoring `.claude/**`.
- Cold `next dev` routes failed the first tests of a run; the TypeScript reference now prescribes a browser warm-up in global setup.
- Per-worker session state is kept in memory, so no per-worker token files are written.

**Not run here:** the trigger check needs Claude Code's real skill selection, which subagents cannot reproduce. The prompts are listed for Lu to run in VS Code.

## Changes since the first draft

Phase 1 review changed six areas of this spec; the skill files in the project carry the full text.

| Date | Area | Change |
| --- | --- | --- |
| 2026-10-08 | Maintenance | Added verify/ (one-command template verification against a stub app, pinned tool versions), a monthly GitHub Actions workflow, Dependabot config, a "Verified against" line in README.md and a people-facing README. Verification caught an order-dependent cart-count assertion in a template; fixed, and rule 10 now says account-wide totals on a shared account count as global. |
| 2026-10-08 | Rule 9 | A request that explicitly asks for one end-to-end journey test counts as approval; focused tests are still required alongside it. Phase 2 evaluation report published. |
| 2026-10-07 | Phase 2 | TypeScript reference, templates, Semgrep rules, ESLint excerpt and hook built and proven on ProgressionCoach; evaluation run (see Phase 2 results) |
| 2026-10-07 | Rule 10 | App's own service layer, called in-process, added to the arrange order between test-support endpoints and direct DB |
| 2026-10-07 | Rule 3 | Expanded with the click-wrapper versus intent-method example, the cost of a UI change, and two naming checks |
| 2026-10-07 | Rule 10 | Rewritten: `ephemeral`/`shared` environments, baseline versus per-test data, arrange preference order, own-data assertions, layered cleanup, security |
| 2026-10-07 | Rule 9 | Critical journey tests allowed with approval and five conditions; serial exception tightened |
| 2026-10-07 | Rule 8 | UI-login fallback, once per role in auth setup, when no usable login API exists |
| 2026-10-07 | Rule 5 | Locator priority reordered to Role, Label, Text, Placeholder, TestId, AltText, Title, CSS, XPath |
| 2026-10-07 | Open questions | Install location, test-ID default, cleanup default, rule 9 policy, hook, environment setting and phase 2 sample decided |
