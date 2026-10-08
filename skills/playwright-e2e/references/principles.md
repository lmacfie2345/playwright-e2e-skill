# Principles

Twelve rules for Playwright end-to-end tests. Each is stated once, language-neutrally,
with its reason. How a rule is implemented in a given language lives in that
language's reference file (`typescript.md`, `python.md`, `python-async.md`).

Examples here are **pseudocode**: they show shape, not syntax. Copy syntax from the
language reference and the templates, never from this file.

Rules 1, 7, 8 and 9 are non-negotiable. The structural rules (1–8) alone do not fix
flat, serial output; rules 9 and 10 are what change the shape of a suite, so they
carry equal weight.

---

## Page objects

### Rule 1 — Tests never touch the page directly

Tests never construct locators or call raw page interactions (`locator`, `click`,
`fill`, `getBy…`/`get_by_…` on `page`). All locators and actions live in page objects
or component objects.

**Why:** when the UI changes, the fix lands in one place, and tests read as a
description of behaviour rather than a script of clicks.

Navigating is also a page-object concern: expose `open()`/`goto()` on the page
object rather than calling `page.goto` in the test.

### Rule 2 — Expose locators, assert in the test, web-first

Page objects expose **read-only** locators for anything a test needs to assert on.
Tests assert on them with the runner's web-first (auto-retrying) assertions.
Page objects never offer boolean helpers (`isVisible()`, `hasError()`) for
assertions.

```
// bad: snapshot boolean, no retry
assert productPage.isAddedBannerVisible() == true

// good: retrying assertion on an exposed locator
expect(productPage.addedBanner).toBeVisible()
```

**Why:** a boolean check reads the DOM once and does not retry, so it fails whenever
the UI is a few milliseconds behind. It is one of the most common sources of flaky
tests.

### Rule 3 — Methods express user intent

Page object methods describe what a user is trying to achieve: `addToCart(quantity)`,
`signIn(user)`, `searchFor(term)`. They do not wrap one Playwright call each
(`clickAddButton()`, `fillQuantityField()`, `closeToast()`). The method hides **how**
the UI achieves the goal; the test states **what** the user does.

**Why:** one-to-one wrappers are a page object in name only. They move the locators
out of the test (rule 1) but leave the *sequence of UI steps* in it, so a UI change
still ripples through every test that used them.

```
// bad: click-wrappers; the test still scripts the UI
productPage.fillQuantity("2")
productPage.clickAddToCart()
productPage.closeToast()
expect(header.cartCount).toHaveText("2")

// good: one intent method; the steps live inside it
productPage.addToCart(quantity = 2)      // fills, clicks, waits for the toast (rule 6)
expect(header.cartCount).toHaveText("2")
```

**What a UI change costs.** Suppose the quantity text box becomes +/- buttons and
the toast no longer needs dismissing. With click-wrappers, a new method is added and
**every test** that adds to the cart is edited (30 tests, 30 edits). With an intent
method, only the body of `addToCart()` changes; no test changes, because what the
user does hasn't changed, only how.

**Two checks for any method name:**

1. *Would a product owner or manual tester describe the action this way?*
   "Sign in as a customer", "pay with a valid card" pass; "click the submit button",
   "fill the email field" fail.
2. *If the UI were redesigned but the feature stayed the same, would the name still
   make sense?* If yes, it is an intent method.

**Fine-grained methods are allowed when the step itself is the behaviour under
test**, such as validating a single field:

```
productPage.setQuantity(0)
productPage.submitAddToCart()
expect(productPage.quantityError).toHaveText("Quantity must be at least 1")
```

Even then, name the action (`setQuantity`), not the control
(`fillQuantityTextbox`), and build intent methods from these smaller ones rather than
duplicating their steps.

Intent methods do **not** assert business outcomes: `addToCart()` may wait for
readiness (rule 6) but does not check the cart count — that check is what the test
verifies.

### Rule 4 — Compose components; keep hierarchies shallow

Shared UI regions — header, navigation, product card, modal, toast — are
**component objects**, scoped to a root locator and composed into the pages that
contain them. A thin base class for constructor wiring is fine; a deep base-page
hierarchy accumulating helpers is not.

```
class ProductPage:
    header = HeaderComponent(root = page.getByTestId("site-header"))
    addToCartButton = page.getByRole("button", name = "Add to cart")
```

**Why:** composition removes duplicated locators without creating a god class that
every page inherits and nobody can change safely.

### Rule 5 — Locator priority

Use the first locator in this list that identifies the element uniquely and stably:

1. `getByRole()` — preferred; matches how users and assistive technology perceive
   the page. Always pass an accessible name (`{ name: ... }`).
2. `getByLabel()` — form inputs, via their associated label.
3. `getByText()` — non-interactive elements identified by visible text.
4. `getByPlaceholder()` — inputs with a placeholder and no usable label.
5. `getByTestId()` — when the project's test-ID attribute is present on the element.
6. `getByAltText()` — images and other elements with a text alternative.
7. `getByTitle()` — elements identified by their `title` attribute.
8. CSS selector — only when none of the above apply, with a one-line comment saying why.
9. XPath — last resort only, with a one-line comment saying why CSS will not do.

Chain and filter (`locator.getByRole(...)`, `filter({ hasText })`) inside a
component's root before falling to CSS.

**Why:** user-facing locators (1–4) double as an accessibility check and survive
restyling; test IDs (5) are the most resilient explicit contract when the app
provides one; CSS and XPath (8–9) depend on DOM structure and break on markup
refactors, so each use must justify itself.

**Relation to Playwright's guidance:** this follows Playwright's recommended
built-in locators (playwright.dev/docs/locators), with two deliberate differences:
`getByLabel` ranks above `getByText` (a label is the stronger contract for form
controls), and `getByTestId` ranks above `getByAltText`/`getByTitle` (when an app
ships test IDs, they are more stable than alt or title text). Playwright calls CSS
and XPath "not recommended"; here they are allowed only as justified fallbacks.

If an element needs CSS or XPath because it has no accessible name, label or test
ID, say so in the report: an accessibility fix or a test ID in the app is usually
the right remedy.

### Rule 6 — Readiness in page objects, assertions in tests

A page object may wait for its own readiness (for example, `open()` waits until the
page's main region is visible). Business assertions — "the cart shows 2 items",
"the error says X" — belong in the test.

**Why:** a reader must see what a test verifies by reading the test. Assertions
hidden in page objects make tests look empty and make failures harder to place.

---

## Provisioning and authentication

### Rule 7 — Page objects come from fixtures

Page objects reach tests through the runner's dependency-injection mechanism
(fixtures in Playwright Test and in pytest). They are never constructed in a test
body. Tests import their test function and `expect` from the project's **single
fixture entry point**, never directly from the Playwright package.

```
// bad
test("adds to cart", ({ page }) =>
    productPage = new ProductPage(page)        // constructed in the test
    ...)

// good
import { test, expect } from "<project fixture entry point>"
test("adds to cart", ({ productPage }) => ...)  // injected
```

**Why:** one wiring point means one place to change construction, fixtures are
created lazily only for tests that use them, and every test gets the same lifecycle
(setup, teardown, isolation).

### Rule 8 — Authenticate once per role, via the API

- Log in once per role through the API (not the UI), save the browser storage state,
  and reuse it for every test of that role. (No usable login API? See the fallback
  below.)
- State files hold live session tokens: they live in a git-ignored directory and are
  never logged or committed.
- Tests of login, logout or registration explicitly opt out to an **empty** storage
  state, so they start unauthenticated.
- Flows that mutate account state (cart, profile, addresses, orders) use a
  **per-worker** account, so parallel workers never share a mutable account.
- Credentials come from environment variables.

**Why:** a UI login per test multiplies runtime and flakiness for no coverage gain
(login has its own tests). Per-worker accounts stop parallel workers corrupting each
other's carts and profiles.

**Fallback when no login API is usable** (none exists, it needs a CAPTCHA or MFA
step the API can't satisfy, or the app's session can't be produced from an API
token):

1. Log in through the UI **once per role** in the auth setup step (or once per
   worker, for per-worker accounts), using the sign-in page object.
2. Wait for a signal that the session is established (for example, the account
   page heading is visible), then save the storage state.
3. Reuse that state exactly as in the API path; everything else in this rule still
   applies.

Never fall back to logging in through the UI inside a test. Record in the report
that the UI fallback was used and why, so the team can add a login API or a test
bypass later.

```
setup("authenticate as customer", ({ signInPage, accountPage, context }) =>
    signInPage.open()
    signInPage.signIn(credentials.customer)          // from env
    expect(accountPage.heading).toBeVisible()        // session established
    context.storageState(path = AUTH_DIR + "/customer.json")
)
```

Storage state captures cookies and localStorage (and IndexedDB when requested), but
**not sessionStorage**. If the app keeps its session in sessionStorage, see
`discovery.md`.

---

## Independence and data

### Rule 9 — Every test is independent

- Parallel execution is on.
- No serial suites, no reliance on test order, no shared mutable state between tests.
- Each test passes when run alone, filtered by its title.
- By default, each behaviour gets its own focused test that **arranges** its starting
  point (through data fixtures, per rule 10) rather than inheriting it from a previous test.

**Why:** this is the rule that fixes flat, serial output. Serial chains hide
dependencies, fail as a cascade (one failure skips everything after it), can't be
parallelised and can't be re-run individually.

Two different things are easy to confuse here:

| | Serial suite | Critical journey test |
|---|---|---|
| Shape | Several tests; each depends on the state the previous one left | **One** test that walks a flow end to end |
| Runs alone / in parallel | No | Yes |
| Status | Prohibited; strict exception below | Allowed with approval; conditions below |

#### Critical journey tests

A single test that exercises a business-critical workflow end to end (for example,
browse → add to cart → checkout → order confirmed) is allowed, because it catches
what focused tests cannot: handover between steps, state carried across pages, a
session that survives the whole flow.

**Why approval is required:** agents drift towards long, flat tests, and "journey"
is the easiest label to hide that behind. Approval and a stated reason keep these
rare and deliberate.

A journey test is acceptable only when **all** of these hold:

1. **Critical flow, stated reason.** The plan (workflow step 3) lists it as a
   journey test, names the business-critical flow, and says why focused tests are
   not enough. The user approves it with the plan. The agent never self-approves.
   **A request that explicitly asks for one end-to-end journey test** (for example,
   "write one test covering the whole checkout journey step by step") **counts as
   that approval.** Record the request as the approval in the comment; all the other
   conditions still apply, including the focused tests in condition 2.
2. **In addition to focused tests, never instead of them.** Each important step in
   the journey also has its own focused test, so a journey failure can usually be
   located by a focused one.
3. **Still independent.** It arranges its own data (outside the UI, per rule 10, wherever the
   setup is not the behaviour under test), uses a per-worker account if it mutates
   account state, cleans up per rule 10, and passes alone and in parallel. Only the
   behaviour under test runs through the UI.
4. **Readable when it fails.** Each stage is wrapped in a named step (`test.step` in
   Playwright Test; the Python binding's equivalent), and each stage asserts its
   checkpoint before moving on, rather than asserting only at the end.
5. **Tagged and few.** It carries a journey tag (for example `@journey`, alongside
   `@smoke` if it runs as smoke) and a comment stating the reason. More than a
   handful of journey tests in one plan is a warning sign; say so to the user.

```
// JOURNEY TEST
// Flow: checkout (revenue path)
// Why end-to-end: verifies an order is created across cart, payment and confirmation
// Approved by: <name>, <date> (or: the user's explicit request for this journey, <date>)
test("places an order for an in-stock product", { tag: ["@journey"] },
    ({ data, signInAs, productPage, cartPage, checkoutPage, orderConfirmationPage }) =>
        signInAs(data.customers.create())                              // own account: the cart count is account-wide
        product = data.products.create(name = uniqueName("lamp"))      // arrange outside the UI

        step("add the product to the cart", () =>
            productPage.open(product.id)
            productPage.addToCart(quantity = 1)
            expect(productPage.header.cartCount).toHaveText("1"))     // checkpoint

        step("review the cart", () =>
            cartPage.open()
            expect(cartPage.lineItem(product.name)).toBeVisible())    // checkpoint

        step("pay and confirm", () =>
            cartPage.proceedToCheckout()
            checkoutPage.payWith(testCard.valid)                      // from env/fixture
            expect(orderConfirmationPage.heading).toHaveText("Thank you for your order"))
)   // focused tests for add-to-cart, cart and payment exist separately (condition 2)
```

**Trade-offs accepted:** a journey test fails later, costs more to retry and gives
a less precise signal than a focused test. Conditions 2 and 4 contain that cost.

#### Serial suite exception

Because a single journey test covers nearly every case a serial suite would, serial
suites stay prohibited except when **all** of these hold:

1. The flow cannot be one journey test (for example, too long or slow for one
   test's timeout), **and** its intermediate state genuinely cannot be arranged
   by any rule 10 method or a direct URL (for example, a wizard whose step state
   exists only in the browser session).
2. The user has explicitly approved it in this conversation. The agent never grants
   the exception itself.
3. The suite carries a comment directly above it containing:
   - **why** neither a journey test nor API/fixture arrangement works for this flow;
   - **who** approved the exception;
   - a **ticket or issue reference** to remove the exception (for example, an app
     change to expose the needed state).

```
// SERIAL EXCEPTION
// Why: the onboarding wizard exceeds a single test's timeout, and step state lives
//      only in sessionStorage, so no API or URL can place a user at step 4.
// Approved by: <name>, <date>
// Tracking: <ticket id> — expose wizard state via API so this can be parallelised
describe.serial("onboarding wizard", ...)
```

Even under an exception, the serial group is kept as small as possible and the rest
of the suite stays parallel.

### Rule 10 — Arrange data outside the UI, act and assert through the UI

Create preconditions (users, products, carts, orders) without clicking through the
UI; exercise and assert only the behaviour under test through the UI.

**Why:** setup outside the UI is fast and reliable, unique data prevents cross-test
interference, and the test's UI steps cover only the behaviour it is about.

#### Environments: tests don't know which one they run in

Real projects run the same suite against two kinds of environment:

- **`ephemeral`** — owned by the suite for one run: docker-compose locally, the same
  images in CI.
- **`shared`** — long-lived and used by other people: a QA or staging test
  environment deployed by the pipeline. A third-party hosted app the team doesn't
  control is also `shared`, with the fewest options.

Configuration declares which it is: `TEST_ENV_KIND=ephemeral|shared`.
**Default to `shared`** when it is not set: it is the safe assumption. Global setup
and data fixtures choose the arrange and cleanup strategy from it; **tests never
branch on it** (that would also break rule 11).

| | `ephemeral` | `shared` |
|---|---|---|
| Baseline data | Seeders or a seeded image, run in global setup before workers start | Seeded by the deploy pipeline or environment owners; global setup only **verifies** it exists and fails fast if not |
| Reset / re-seed | Allowed at the start of the run | **Never** from the suite |
| Per-test arrange | Any method in the preference order below | Only methods actually available there (usually public API, test-support endpoints if deployed) |
| Cleanup | Optional: environment teardown removes everything | **Mandatory** per-test teardown plus a run-level safety net |
| Unique data | Required (parallel workers) | Required (workers and other users) |

#### Two levels of arrange

1. **Baseline, once per run, read-only to tests.** Reference data, catalogue,
   role accounts, the per-worker account pool. Created by seeders, a snapshot or a
   seeded image (`ephemeral`), or verified as present (`shared`). Tests may read it
   but never modify it; look it up by a stable key, never a hard-coded database id.
   Never seed, reset or migrate while workers are running: it wipes data other
   workers depend on.
2. **Per test, owned by the test.** Anything the test mutates, created inside the
   test's fixtures with a unique identifier (factory plus worker index, timestamp or
   UUID, and a run-ID prefix so the safety net can find it).

#### Per-test arrange: preference order

Use the first method that is available in the target environment and can produce
the state. State the method chosen, and why, in the plan (workflow step 3).

1. **Public application API** — the default.
2. **Test-support endpoints** (for example, a route that calls the app's model
   factories to create "an order shipped 31 days ago"). For states the public API
   cannot produce.
3. **The app's own service or data layer, called in-process** (for example, the
   service functions a server action calls). Only when the tests live in the same
   repository and runtime as the app, and 1 and 2 are unavailable. It keeps the
   app's validation and business rules, but couples tests to internal function
   signatures and needs database access from the test process.
4. **Direct database insert** (SQL, or the ORM's raw model calls, behind a data
   fixture). Only when 1–3 cannot produce the state. It couples tests to the schema
   and bypasses business logic (caches, search indexes and events are not updated),
   so it can create states the app could never reach.
5. **Through the UI** — last resort; any UI step that isn't the behaviour under test
   is cost without coverage.

**Client-side state** (storage state, cookies, init scripts, feature flags,
controlled clock) is arranged through the runner's context and page APIs; it
complements, never replaces, real server-side data.

**Network mocking** (route interception, HAR replay) is a separate category, not an
arrange method for end-to-end tests. It is allowed for UI-state cases that are hard
to produce for real (error responses, empty states, third-party services such as
payment providers), tagged (for example `@mocked`), and never counted as end-to-end
coverage of the call it fakes. Never mock to avoid a difficult real setup in a test
that claims to cover the integration.

#### Assert on your own data, never on global counts

Assert that **the record this test created** appears, changes or disappears — not
that a list has N rows or a counter shows a total. A test that passes on a fresh
database and fails on a busy shared one is a bug.

Totals that belong to an **account** count as global when the account is shared. A
cart count, an unread badge or a "3 items" summary on the worker's shared account
includes what other tests in that worker did. Assert on the line for your own record,
or give the test an account of its own (create it and sign it in through the API).

```
// bad: depends on everything else in the environment
expect(ordersPage.rows).toHaveCount(3)

// good: depends only on this test's data
expect(ordersPage.row(order.reference)).toBeVisible()
```

#### Cleanup

Layered, from primary to safety net:

1. **Per-test teardown** (primary). The data fixture records each id it creates and
   deletes them in reverse order (children before parents) in teardown, so it runs
   even when the test fails. Through the public API, a test-support endpoint, the
   app's service layer or a direct database delete — same preference order as arrange.
2. **Run-level safety net.** Delete everything carrying this run's ID prefix at the
   end of the run (test-support endpoint or database delete by prefix), and/or a
   scheduled sweeper that removes test-prefixed records older than N hours. Catches
   crashed runs; never a substitute for 1.
3. **Environment reset or teardown** — `ephemeral` only: reset at the start of the
   run (keeps a failed run's data inspectable until the next one), and/or destroy the
   containers at the end.

**Cleanup default:** per-test teardown always, in every environment. Skipping it is
allowed only for `ephemeral` environments, or a `shared` one with a scheduled
reset, with a one-line comment stating which. Deleting by table or by anything wider
than this run's own data is never allowed.

```
test("removing an item empties the cart", ({ data, cartPage }) =>
    product = data.products.create(name = uniqueName("lamp"))   // arrange: fixture picks API / endpoint / DB
    data.cart.add(product.id, quantity = 1)
    cartPage.open()                                             // act via UI
    cartPage.removeItem(product.name)
    expect(cartPage.emptyMessage).toBeVisible()                 // assert via UI, on own data
)   // `data` fixture teardown deletes the cart line and product, in reverse order
```

#### Security

- Test-support endpoints must not exist in production builds: enabled only by a
  test-environment flag and protected by a token from an environment variable.
- Database credentials come from environment variables, with least privilege
  (insert/delete on the tables the suite owns), and are never logged.
- Seeders and reset commands must refuse to run unless the target is declared
  `ephemeral`.

---

## Hygiene

### Rule 11 — No sleeps, no force, no conditionals

- No fixed waits (`waitForTimeout`, `sleep`). Wait for a state: a web-first
  assertion, a locator becoming actionable, a network response.
- No forced actions (`force: true`). If an element isn't actionable, find out why
  (an overlay, an animation, the wrong element) and fix that.
- No conditionals (`if`/`try` on page state) in tests. A test follows one path.

**Why:** each one hides a timing or state problem rather than fixing it. A sleep is
either too short (flaky) or too long (slow); a forced click passes when a real user
would be blocked; a conditional makes the test verify different things on different
runs.

### Rule 12 — Organisation and configuration

- Folders by feature domain (`tests/cart/`, `tests/search/`), one spec per feature or
  journey.
- Test titles state the expected behaviour: "shows an error for an expired card",
  not "test checkout 3".
- Tags through the runner's native mechanism (`@smoke`, `@regression`), not title
  text hacks or custom wrappers.
- Base URL and credentials come from environment configuration. No URLs, passwords or
  tokens in tests or page objects.
- Helpers are pure, stateless utilities only. Anything touching the page is a page or
  component object; anything with setup or teardown is a fixture.

**Why:** suites stay navigable as they grow, secrets stay out of version control, and
each kind of code has one obvious home.

---

## Bad example: the flat, serial spec

This is the shape agents produce by default. Pseudocode.

```
describe.serial("shop", () =>                                      // ✗ R9: serial suite
    let page                                                       // ✗ R9: shared mutable state

    beforeAll(({ browser }) => page = browser.newPage())

    test("login", () =>
        page.goto("https://shop.example.com/login")                // ✗ R1 raw page, R12 hard-coded URL
        page.fill("#email", "admin@example.com")                   // ✗ R1, R5 CSS without reason
        page.fill("#password", "Secret123!")                       // ✗ R12 secret in test
        page.click("//button[text()='Sign in']")                   // ✗ R5 XPath where getByRole works; ✗ R8 UI login
        page.waitForTimeout(3000)                                  // ✗ R11 fixed sleep
    )

    test("search", () =>                                           // ✗ R9 depends on "login"
        page.fill("input.search", "lamp")
        page.press("input.search", "Enter")
        if (page.locator(".cookie-banner").isVisible())            // ✗ R11 conditional, R2 boolean
            page.click(".cookie-banner .close")
    )

    test("add to cart", () =>                                      // ✗ R9 depends on "search" results
        productPage = new ProductPage(page)                        // ✗ R7 constructed in test
        productPage.clickFirstResult()                             // ✗ R3 click-wrapper; R10 relies on unknown data
        productPage.clickAddButton()
        page.click("#confirm", { force: true })                    // ✗ R11 forced action
        assert productPage.isCartBadgeVisible() == true            // ✗ R2 boolean assertion
    )
)
```

What goes wrong in practice: one failure skips every later test; nothing can run in
parallel or alone; the 3-second sleep is still flaky on a slow CI runner; the
product searched for may not exist in the environment; and the password is in git.

## Good example: the same coverage, corrected

Pseudocode. Three files, each test independent.

```
// tests/auth/sign-in.spec  — the only place the login UI is exercised
import { test, expect } from "<fixture entry point>"

test.use(storageState = EMPTY)                                     // R8 opt out of stored auth

test("signs in with valid credentials", ({ signInPage, accountPage, credentials }) =>
    signInPage.open()
    signInPage.signIn(credentials.customer)                        // R3 intent, R12 creds from env
    expect(accountPage.heading).toHaveText("My account")           // R2 web-first, R6 in test
)
```

```
// tests/search/product-search.spec   — runs as an authenticated customer via stored state (R8)
import { test, expect } from "<fixture entry point>"

test("lists a product that matches the search term", ({ data, searchPage }) =>
    product = data.products.create(name = uniqueName("lamp"))      // R10 arrange outside the UI, unique
    searchPage.open()
    searchPage.searchFor(product.name)                             // R3
    expect(searchPage.resultCard(product.name)).toBeVisible()     // R2, R4 component locator
)
```

```
// tests/cart/add-to-cart.spec   — the cart count is an account-wide total, so this test uses its own account (R10)
import { test, expect } from "<fixture entry point>"

test("adds the chosen quantity to the cart", ({ data, signInAs, productPage, header }) =>
    signInAs(data.customers.create())                              // R8 API sign-in; an account only this test uses
    product = data.products.create(name = uniqueName("lamp"))      // R10, R9 own data
    productPage.open(product.id)
    productPage.addToCart(quantity = 2)                            // R3; waits for readiness inside (R6)
    expect(header.cartCount).toHaveText("2")                       // R2, R4
)   // `data` fixture teardown deletes the product (R10 cleanup default)
```

Each test arranges its own state, runs alone or in any order, and the suite runs
fully parallel. Login is covered once, by the test that is actually about login.
