# Playwright E2E Skill — Phase 2 Evaluation Report

Oct 8, 2026 · Lu Macfie

## Verdict

Phase 2 (TypeScript) meets its acceptance criteria. All 3 with-skill runs broke none of rules 1, 7, 8 and 9 and had 0 Semgrep findings in new code. The proof suite passed every definition-of-done check on ProgressionCoach, including 25 of 25 tests run 3 times in parallel from a cold server.

The skill made the largest difference on the "bait" prompt: without it, the agent wrote a single journey test with 26 raw page calls and 5 page objects built inside the test. With it, the agent wrote a journey test plus 3 focused tests and no violations. On a plain greenfield prompt the baseline model was already close to the rules (3 minor rule 1 violations).

## Method

Each run was a fresh subagent working on its own clean copy of ProgressionCoach, with its own Postgres database and app port. With-skill runs had the skill installed at `.claude/skills/playwright-e2e` and were told it had triggered. Baseline runs had no skill on disk.

| Prompt | Starting repo |
| --- | --- |
| Greenfield: "Write Playwright end-to-end tests for signing in, setting up a learner profile, and logging STAR evidence." | No e2e suite or Playwright config |
| Bait: "Write one Playwright test file covering the whole learner journey step by step…" | Original repo, including the serial `smoke.spec.ts` |
| Brownfield: "Add an end-to-end test that a learner can edit the title of an evidence entry…" | Repo plus the page-object proof suite (`tests/e2e-pom`) |

- **Scoring:** the skill's Semgrep rules on new code only, plus manual checks of rules 1, 7, 8 and 9: raw page calls in specs, page objects built in tests or `test`/`expect` imported from `@playwright/test`, UI login outside sign-in or journey tests, and serial suites.
- **User unavailable:** agents chose defaults where they would have asked. A journey test counted as approved only if the prompt clearly asked for one.
- **Contamination control:** the first three baselines found the skill files in this Project's docs and followed them. Those runs are excluded. Two baselines were repeated with the Projects tool, memory and files outside the repo blocked.

## Results

The skill runs were clean on every prompt; the baselines broke rule 1 on two prompts and rule 7 on the bait prompt.

| Prompt | Run | Tests written | Semgrep findings (new code) | Rules 1, 7, 8, 9 | Notes |
| --- | --- | --- | --- | --- | --- |
| Greenfield | With skill | 10 in 3 specs | 0 | No violations | Service-layer data, per-worker learners, run-ID cleanup, `TEST_ENV_KIND` |
| Greenfield | Baseline | 20 in 3 specs | 3 raw `page.goto` in a spec | Rule 1 broken (minor) | Already used page objects, fixtures and API sign-in |
| Bait | With skill | 1 journey + 3 focused | 0 | No violations | Recorded the request as journey approval; named steps; `@journey` tag |
| Bait | Baseline | 1 journey only | 26 raw page calls, 5 page objects built in the test | Rules 1 and 7 broken | Page objects defined inside the spec; imports `test` from `@playwright/test` |
| Brownfield | With skill | +1, reused existing page objects | 0 | No violations | Extended `EvidenceFormPage` rather than duplicating it |
| Brownfield | Baseline | Excluded | – | – | Read the skill from Project docs |

For comparison, the existing `smoke.spec.ts`, written without the skill, has 207 raw page calls, 1 serial suite and 1 forced action.

Every run's final tests passed, both repeated 3–4 times in parallel and with each new test run alone. The bait baseline's first parallel run failed on cold-server sign-in timeouts; it passed after the agent raised the wait to 60 s. The skill's TypeScript reference now prescribes a browser warm-up in global setup for this instead.

## Proof on ProgressionCoach

The proof suite (`tests/e2e-pom`, run with `playwright.pom.config.ts`) passed every definition-of-done check. It has 8 tests covering sign-in, profile set-up, evidence and admin, and it sits beside the existing smoke suite without changing it.

| Check | Result |
| --- | --- |
| `tsc --noEmit` (whole repo) | Pass |
| ESLint, including `eslint-plugin-playwright` and `no-floating-promises` | Pass |
| Semgrep, skill rules | 0 findings in 20 files |
| `playwright test --list` | 9 entries (1 setup + 8 tests) |
| 3 workers, `--repeat-each=3`, `TEST_ENV_KIND=ephemeral`, cold server | 25 of 25 passed |
| Each test alone, `TEST_ENV_KIND=shared` | 8 of 8 passed |
| Test data left in the database afterwards | 0 accounts |
| Session files on disk | Admin only (git-ignored); per-worker sessions kept in memory |

The generic templates were verified separately. They compile with `strict`, `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`, pass ESLint and Semgrep, and ran unchanged against a stub shop app: 13 of 13 passed with `--repeat-each=3` and 4 of 4 alone. All 7 Semgrep rules pass `semgrep --test`, and the post-edit hook flagged a deliberately bad spec while passing a clean one.

## Defects found and fixed

The evaluation found five defects in the skill; all are fixed in the delivered version.

| Defect | Found by | Fix |
| --- | --- | --- |
| `pw-no-force` flagged Node's `fs.rm(path, { force: true })` | Greenfield baseline scoring | Rule now matches Playwright actions only; an `ok:` case was added to its test file |
| Installing the skill made `npm run lint` fail on the skill's own template files under `.claude/` | Bait and brownfield skill runs | SKILL.md step 2 and discovery question 13 have the agent propose ignoring `.claude/**` first |
| Semgrep silently scanned nothing in `tests/` directories (its default ignore list) | Proof suite | Templates ship a root `.semgrepignore`; the TypeScript reference explains why |
| Cold `next dev` routes failed the first tests of a parallel run | Proof suite and greenfield skill run | TypeScript reference prescribes a browser warm-up in global setup; the proof suite has one |
| Per-worker session files held live tokens on disk | Greenfield skill run | Per-worker storage state is kept in memory; only shared-role files remain, git-ignored |

One agent claimed the session-file writes made `next dev` rebuild. Two direct experiments could not reproduce that, so the change is justified on security grounds only.

The evaluation also produced one rule decision: a request that explicitly asks for one end-to-end journey test counts as rule 9 approval. The journey test still needs focused tests alongside it.

## Limitations

The results show the skill working on one app with one model, with 1 run per prompt and variant. They are not a statistical benchmark.

- **Trigger check not run.** Whether Claude Code selects the skill on its own needs its real skill selection, which subagents cannot reproduce. Every with-skill run was told the skill had triggered.
- **Brownfield baseline missing.** The only brownfield baseline was contaminated and excluded.
- **Sandbox, not Lu's machine.** Prisma's engines could not be downloaded and Podman was unavailable, so runs used a local Postgres 16, an engine-less Prisma client patched in `node_modules`, and a `psql`-based stand-in for `prisma migrate reset`. None of this is in the skill or the delivered proof suite. `npm test` (Vitest integration) could not run for the same reason.
- **2 CPUs and about 6 GB of memory** made `next dev` slow and caused some out-of-memory browser crashes in contaminated runs. Times in this report are not representative of a developer machine.
- **Approval was simulated.** With the user unavailable, "approved" meant only what the prompt explicitly asked for.

## Next steps

- [ ] Lu re-runs the proof suite locally: `npx playwright test -c playwright.pom.config.ts --repeat-each=3`
- [ ] Lu runs the trigger check in VS Code: 5 prompts that should trigger the skill and 3 that should not (listed below)
- [ ] Choose the sample app for the Python phases
- [ ] Start phase 3 (Python sync) after the phase 2 gate is accepted

**Should trigger:** "Add a Playwright test for deleting evidence"; "Our e2e tests fail when run in parallel, fix them"; "Create a page object for the profile page"; "Set up Playwright so tests don't log in every time"; "Write pytest-playwright tests for the login page".

**Should not trigger:** "Write a Vitest unit test for parseWorkbook"; "How do I find an element in Selenium?"; "Write an integration test for the plan service".
