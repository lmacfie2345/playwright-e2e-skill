# playwright-e2e — a Claude Code skill for Playwright end-to-end tests

This skill makes Claude Code write Playwright end-to-end tests the way a senior SDET would:

- **Page objects:** every locator lives in a page or component object.
- **Fixtures:** tests get page objects as fixtures, imported from one entry point.
- **API sign-in:** each role signs in once through the API and reuses the saved login state.
- **Independent tests:** every test runs in parallel, sets up its own data and cleans up after itself.
- **Automatic checks:** Semgrep and ESLint rules enforce all of the above.

This file is for people. Claude reads `SKILL.md` and the files it points to.

<!-- verified:start -->
**Verified against:** @playwright/test 1.63.0, eslint-plugin-playwright 2.12.1, ESLint 10.12.0, typescript-eslint 8.71.1, TypeScript 6.0.3, Semgrep 1.179.0, Node 22.22.0 on 2026-10-08 (`verify/run.mjs`).
<!-- verified:end -->

| Language | Status |
|---|---|
| TypeScript / JavaScript (`@playwright/test`) | Ready (phase 2) |
| Python (`pytest-playwright`) | Not yet: the skill applies the general rules and says no verified Python reference exists |

---

## 1. Requirements

- Claude Code (CLI or the VS Code extension)
- Node.js, and `@playwright/test` in the repository
- Optional: Semgrep, for the static checks. Install it once with `pip install semgrep`; if it gives trouble on Windows, it also runs under WSL. Without it, the skill still works and that one check is skipped.

## 2. Install (required)

1. Copy the `skills/playwright-e2e/` folder from this repository into your project, so that `SKILL.md` sits **directly** inside it:

   ```
   <repo>/.claude/skills/playwright-e2e/SKILL.md
   ```

   A common mistake is a nested copy after unzipping: `.claude/skills/playwright-e2e/playwright-e2e/SKILL.md`.

2. Add `.claude/**` to the `ignores` in your ESLint config. The skill folder contains template code and deliberately bad example code for testing the Semgrep rules. Without this ignore, `npm run lint` fails as soon as the skill is installed.

   ```js
   // eslint.config.mjs
   { ignores: [/* existing entries */, ".claude/**"] },
   ```

3. Start a new Claude Code session. Asking "what skills are available?" should list `playwright-e2e`.

4. Commit `.claude/skills/playwright-e2e/` so everyone on the team gets the same skill.

## 3. First-time setup (Claude offers these)

Paths in this section are inside the installed skill folder, `.claude/skills/playwright-e2e/`.

The first time you ask for tests, Claude offers the items below and only makes changes you agree to. You can also do them yourself.

| Item | What to do | What happens without it |
|---|---|---|
| Git ignore entries | Append `templates/typescript/gitignore.entries` to `.gitignore` (`playwright/.auth/`, `.env*`, reports) | Saved login state or `.env` files could be committed |
| Semgrep ignore file | Copy `templates/typescript/semgrepignore` to the repository root as `.semgrepignore` | Semgrep skips every `tests/` directory by default and silently finds nothing |
| ESLint rules | Merge the block from `enforcement/eslint.config.excerpt.mjs` into your config and `npm i -D eslint-plugin-playwright typescript-eslint` (skip `typescript-eslint` if your config already has it, e.g. through `eslint-config-next`) | Fewer automatic checks; the rules are still in the skill's text |
| Post-edit hook | Merge `enforcement/claude-hook.example.json` into `.claude/settings.json` | No automatic check after each edit |

What the hook does: after every edit Claude makes to a file under `tests/e2e`, it runs Semgrep and ESLint on that file and shows any violations to Claude, so Claude fixes them straight away. For other test folders, set `E2E_TEST_DIRS=tests/e2e,other/dir`. The hook needs Node, and it skips any tool that isn't installed.

**React or Next.js projects:** the React hooks lint rule mistakes Playwright's fixture callback `use(...)` for React's `use()`. Turn `react-hooks/rules-of-hooks` off for the end-to-end test files only; the ESLint excerpt has the line, commented out.

## 4. Do not copy the template code by hand

The code under `templates/typescript/` (`playwright.config.ts`, fixtures, page objects, support files, specs) is reference code. Claude opens the matching template when it creates a file your repository doesn't have yet, and adapts it: it keeps the structure and replaces the names, endpoints and values specific to the template's sample shop app.

- **No Playwright set-up yet:** Claude builds the `tests/e2e` layout from the templates, adapted to your app.
- **Existing Playwright set-up:** your existing config, folders and conventions win. Claude proposes changes (for example, turning on `fullyParallel`) rather than replacing your files.

Copying the templates in yourself would be a mistake. They contain stand-ins for a sample shop app (`/api/auth/login`, a product page, `E2E_RESET_COMMAND`, `/api/health`), and Claude would treat them as your real conventions.

## 5. Environment variables

Put these in a git-ignored `.env` / `.env.test` file, or in CI variables. Never put them in test code.

| Variable | Purpose |
|---|---|
| `BASE_URL` | URL of the app under test |
| Test account credentials | E.g. the admin used by the auth setup step. Names follow your project |
| `TEST_ENV_KIND` | `ephemeral`: the suite owns the environment (Docker/Podman locally or in CI) and may reset and seed it. `shared`: a QA or staging environment others use; the suite never resets it, only checks the data it needs exists. **Default: `shared`** |
| `E2E_RESET_COMMAND` (template default) | The command global setup runs to reset and seed in `ephemeral` mode, e.g. `npm run db:reset:test` |

## 6. Using it

Just ask in plain words. The skill triggers on Playwright end-to-end work, for example:

- "Add a Playwright test for deleting evidence"
- "Create a page object for the profile page"
- "Our e2e tests fail when run in parallel, fix them"
- "Set up Playwright so tests don't log in every time"

It should **not** trigger for unit tests (Vitest/Jest), integration tests or Selenium questions.

For every task, Claude:

1. Works out the language from the repository.
2. Checks the repo's conventions: fixture entry point, page object folders, test-ID attribute, how sign-in works, how test data can be created, and the environment kind.
3. Shows a plan for anything bigger than one test: specs, page objects, fixtures, how each test gets its data, and any journey test. **Wait for your go-ahead.**
4. Builds in this order: components, page objects, fixtures, auth setup, then specs.
5. Runs the checks below and fixes anything that fails.
6. Reports what it did, which defaults it used, and any conflicts with existing code. It flags existing code that breaks the rules but doesn't refactor it unless you ask.

**Journey tests:** a single test that walks one business-critical flow end to end is allowed with your approval. Asking for one explicitly ("write one test covering the whole checkout journey") counts as approval. Claude still adds focused tests for the individual steps alongside it. Serial suites, where one test depends on another, need a stricter exception you approve, with a comment recording why.

## 7. Checks (definition of done)

Claude runs these before it calls the work done. You can run them too.

```bash
npx tsc --noEmit
npx eslint tests/e2e
semgrep --config .claude/skills/playwright-e2e/enforcement/semgrep --metrics=off --error tests/e2e
npx playwright test --list
npx playwright test --repeat-each=3 --workers=4    # new tests, several times, in parallel
npx playwright test -g "<exact test title>"        # each new test on its own
git status --porcelain                              # no .env, playwright/.auth or reports staged
```

Where outbound network access is restricted, set `SEMGREP_ENABLE_VERSION_CHECK=0` before running Semgrep.

## 8. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `npm run lint` fails on files under `.claude/skills/playwright-e2e/templates` | ESLint isn't ignoring `.claude/**` (step 2.2) |
| Semgrep reports 0 files scanned | No `.semgrepignore` at the repo root (section 3) |
| First tests of a run time out with `next dev` or another dev server that builds pages on first visit | Pages compile on first visit. Warm the routes up in global setup; `references/typescript.md` → Pitfalls |
| Lint error "React Hook `use` is called in function …" in fixtures | Turn off `react-hooks/rules-of-hooks` for e2e files (section 3) |
| The skill doesn't seem to be used | Check the folder isn't nested (section 2.1), start a new session, or say "use the playwright-e2e skill" |

## 9. What's in this repository

Only `skills/playwright-e2e/` is installed into projects. Everything else is for maintaining the skill.

```
.
├── README.md                        # this file (for people)
├── .github/
│   ├── workflows/verify-skill.yml   # runs verify/ monthly, on demand and on pull requests
│   └── dependabot.yml               # pull requests for new versions of the pinned tools
├── skills/playwright-e2e/           # THE SKILL: copy this folder into .claude/skills/
│   ├── SKILL.md                     # what Claude reads first: workflow and rule summary
│   ├── references/
│   │   ├── principles.md            # the 12 rules, with reasons and examples
│   │   ├── discovery.md             # what to find out about the repo before writing
│   │   └── typescript.md            # how each rule is done in TypeScript, plus pitfalls
│   ├── templates/typescript/        # reference code Claude adapts (do not copy by hand)
│   └── enforcement/
│       ├── semgrep/                 # rules + their test file (deliberately bad code)
│       ├── eslint.config.excerpt.mjs
│       ├── hooks/lint-e2e.mjs       # the post-edit hook script
│       └── claude-hook.example.json # hook settings to merge into .claude/settings.json
└── verify/                          # maintainers only: checks the skill still works (section 11)
```

## 10. Updating and sharing

- **Updating:** replace your project's whole `.claude/skills/playwright-e2e/` folder with the latest `skills/playwright-e2e/` from this repository, then start a new session.
- **Sharing:** point people at this repository. Sections 2 and 3 are all they need to install it.

## 11. Keeping the skill current (maintainers)

The templates and checks depend on Playwright, `eslint-plugin-playwright`, ESLint, TypeScript, Semgrep and Claude Code, which all change over time. `verify/` (at the repository root) checks that the skill in `skills/playwright-e2e/` still works with the versions pinned in `verify/package.json` and `verify/requirements.txt`. The "Verified against" line at the top of this file records the last passing run.

**What it checks** (one command, exit code 1 on any failure):

1. The templates compile with the strictest TypeScript settings (`strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`).
2. They pass ESLint with `enforcement/eslint.config.excerpt.mjs`.
3. The Semgrep rules pass their own tests (`semgrep --test`).
4. The templates have no Semgrep findings, and Semgrep actually scans them (catches a missing `.semgrepignore`).
5. The post-edit hook flags a bad spec and passes a clean one.
6. The templates run **unchanged** against a small stub shop app (`verify/stub/`): all tests with 3 workers × 3 repeats in `ephemeral` mode, then each test alone in `shared` mode.

**Run it locally:**

```bash
cd verify   # from the repository root
npm ci
npx playwright install chromium
python -m pip install -r requirements.txt
node run.mjs            # verify
node run.mjs --record   # verify and, if all checks pass, update the "Verified against" line
```

`verify/node_modules`, `test-results/` and `playwright-report/` are git-ignored.

**Automation** (already set up in `.github/`):

- `.github/workflows/verify-skill.yml` runs the checks monthly, on demand (Actions → Verify playwright-e2e skill → Run workflow), and on pull requests that change `skills/playwright-e2e/` or `verify/`.
- `.github/dependabot.yml` opens pull requests for new versions of the pinned tools; the workflow shows whether the skill still works with them.
- After merging a version bump, run `node run.mjs --record` in `verify/` and commit the updated README.

**When a check fails:** fix the template, rule or excerpt, not the check. Also skim the Playwright release notes about once a quarter for new recommended practices; verification proves the templates work, not that they are still the best approach. Re-run the full evaluation (see the design spec) only for big changes, such as a major Playwright version or a change to the rules.

