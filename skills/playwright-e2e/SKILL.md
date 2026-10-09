---
name: playwright-e2e
description: >
  Use whenever writing, generating, extending or refactoring Playwright end-to-end
  tests in TypeScript/JavaScript or Python: adding tests for a feature, creating page
  objects or fixtures, scaffolding a Playwright framework, setting up authenticated
  test sessions, or fixing flaky, serial or order-dependent tests. Enforces Page
  Object Model, fixture-provided page objects, storage-state authentication and
  independent, parallel-safe tests.
---

# Playwright E2E tests, written the way a senior SDET would

Left to defaults, agents write one long serial chain of tests with inline locators,
page objects built inside tests and a UI login in every test. It passes once, then
turns slow, flaky under parallelism and costly to maintain. This skill replaces that
shape with: page objects that own the UI, fixtures that hand them to tests, auth done
once per role through the API, and tests that each stand alone.

Follow the six steps below in order. Do not skip step 2 or step 5.

## Workflow

### 1. Detect the binding

| Signal in the repo | Binding | Load |
|---|---|---|
| `@playwright/test` in `package.json` | TypeScript / JavaScript | `references/typescript.md` |
| `pytest-playwright`, or `playwright` plus `pytest`, in `pyproject.toml` / requirements | Python | `references/python.md` (and `references/python-async.md` if step 2 says async) |
| Anything else (Java, .NET, Playwright under Jest/Vitest/Mocha) | None verified | `references/principles.md` only |

For an unsupported binding, tell the user no verified reference exists for it, apply
the principles, and check each API against the official docs before using it.
Why: a guessed API that looks right is worse than an admitted gap.

If a reference file listed above is not present in this skill folder yet, say so and
fall back to `principles.md` plus the official Playwright docs for that language.

### 2. Discover conventions

Work through `references/discovery.md`. Inspect the repo first; ask the user only for
what the repo cannot tell you. Follow what exists; use the skill's defaults only where
nothing exists. For Python, decide sync versus async here.

**Skill folder hygiene:** this skill's folder contains template code and deliberately bad
Semgrep test fixtures. If the repository's linters scan `.claude/` (ESLint does by
default), propose adding `.claude/**` to their ignore list before anything else; without
it, installing the skill alone breaks `npm run lint`.

When an existing convention conflicts with a rule (for example, the repo already uses
serial suites), follow the rule for new code, flag the conflict to the user, and do
not refactor existing code unasked.
Why: the user owns their codebase; silent rewrites destroy trust and review history.

### 3. Plan before writing

List, before writing any code:

- the spec files to create and the scenarios in each (one behaviour per test);
- the page objects and components needed, marked **new** or **existing**;
- the fixtures needed, marked **new** or **existing**;
- the data each test arranges, the arrange method used (rule 10 preference order) and how it is cleaned up;
- any proposed **journey test**: the critical flow it covers and why focused tests are not enough (rule 9). It needs the user's explicit approval, even for a small plan; a request that explicitly asks for one end-to-end journey test is that approval.

For anything larger than a single test, present the plan and wait for the user's go-ahead.
Why: a plan is cheap to correct; a dozen generated files are not.

### 4. Build bottom-up

Components → page objects → fixtures → auth setup (only if missing) → specs.
Reuse existing page objects and fixtures; extend them rather than creating parallel ones.
Why: each layer is tested by the one above it, and duplicates split the source of truth.

Before writing any file the repo doesn't already have an example of, open the matching file in `templates/<language>/` and adapt it: keep its structure and mechanics, replace every app-specific name, endpoint and value. Never write these files from memory.
Why: the templates compile under the strictest settings, pass the enforcement rules and have been run; memory hasn't.

### 5. Verify (definition of done)

Run every check; fix and re-run until all pass.

1. Type check passes (`tsc --noEmit`, or Pyright/mypy).
2. Lint passes: the skill's Semgrep rules plus ESLint or Ruff.
3. Test discovery works (`npx playwright test --list`, or `pytest --collect-only`).
4. New tests pass three times in parallel (`--repeat-each=3` with at least 2 workers,
   never above the environment's worker cap, in TypeScript; in Python, xdist with `pytest-repeat --count=3` if available, otherwise
   three consecutive runs).
5. Each new test passes when run alone, filtered by its title.
6. No secrets, auth state files or `.env` files are staged for commit.

Never disable, suppress or weaken a check or lint rule to get green.
Why: a check silenced to pass is a defect shipped with a receipt.

If the environment cannot run the tests (no network access to the app, say), complete
checks 1–3 and 6 and state plainly that 4–5 are outstanding.

### 6. Report

State what was created or changed, which conventions were followed and which were
defaulted, any conflicts flagged in step 2, and anything left unresolved or unrun.

## Rules (full text, reasons and examples in `references/principles.md`)

**Page objects**

1. Tests never build locators or call raw `page` interactions; page objects own them. — *One fix per UI change; tests read as behaviour.*
2. Page objects expose read-only locators; tests assert with web-first assertions, never boolean helpers like `isVisible()`. — *Boolean checks don't retry and cause flakiness.*
3. Methods express user intent (`addToCart(quantity)`), not one wrapper per click. — *Click-wrappers leak UI mechanics into tests.*
4. Shared UI regions are component objects composed into pages; no deep base-page hierarchies. — *No duplicated locators, no god classes.*
5. Locator priority: `getByRole` → `getByLabel` → `getByText` → `getByPlaceholder` → `getByTestId` → `getByAltText` → `getByTitle` → CSS → XPath; CSS and XPath only with a comment saying why. — *User-facing locators survive restyling and double as an accessibility check; DOM-structure selectors break.*
6. Page objects may wait for readiness; business assertions stay in tests. — *A test must show what it verifies.*

**Provisioning and authentication**

7. Page objects come from fixtures, never `new`/constructed in a test body; tests import `test`/`expect` from the project's single fixture entry point. — *One wiring point, lazy creation, consistent lifecycle.*
8. Authenticate once per role via the API and reuse storage state; state files are git-ignored; login/registration tests opt out to empty state; stateful flows use per-worker accounts. — *Speed, and no collisions between workers.*
   If no usable login API exists, log in through the UI **once per role (or per worker)** in the auth setup step, save the storage state and reuse it exactly as above; never log in through the UI inside a test. — *Still one login per role, not one per test.*

**Independence and data**

9. Every test is independent and parallel-safe; no serial suites, ordering or shared mutable state between tests; each test passes alone. A single end-to-end test of a business-critical flow (a *journey test*) is allowed only with the user's approval (an explicit request for one counts) and a stated reason, in addition to focused tests, with named steps and a journey tag. Serial suites need a stricter, recorded exception. — *This is the rule that fixes flat, serial output; approval keeps journey tests rare and deliberate.*
10. Arrange data outside the UI (public API → test-support endpoint → app's service layer in-process → direct DB → UI), act and assert through the UI, and assert only on the test's own data. Baseline data is seeded once per run and read-only; seeding or resetting only in `ephemeral` environments, never `shared` (the default). Per-test teardown cleanup always, plus a run-level safety net; tests never branch on environment. — *Fast setup, no interference with other workers or other users of the environment.*

**Hygiene**

11. No fixed sleeps, no forced actions, no conditionals in tests. — *Each hides a timing or state problem instead of fixing it.*
12. Folders by feature, one spec per feature or journey, titles state expected behaviour, native tags, base URL and secrets from environment, helpers pure and stateless. — *Navigable suites, no leaked secrets, clear layering.*

Rules 1, 7, 8 and 9 are non-negotiable: a test that breaks one of them is not done.

## Files in this skill

- `references/principles.md` — every rule in full, with reasons, a bad/good example pair, and the serial-exception policy. Read before writing the first test in a session.
- `references/discovery.md` — the questions to answer about the repo and the app before writing.
- `references/typescript.md`, `references/python.md`, `references/python-async.md` — per-language mechanics. Load only the one step 1 selected.
- `templates/<language>/` — canonical code to imitate for new files.
- `enforcement/` — Semgrep rules (with their own tests), an ESLint block, and a Claude Code post-edit hook. During setup, **offer** to install the hook and the lint config, and install them only if the user says yes: they change the user's settings and repository config. The language reference lists the steps (including the `.semgrepignore` without which Semgrep silently skips `tests/` directories).
