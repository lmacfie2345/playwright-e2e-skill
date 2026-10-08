// Fixture for `semgrep --test`: each `ruleid:` line must be flagged by that rule, each `ok:` line must not.
import { expect, test } from "./fixtures";
import { rm } from "node:fs/promises";
import { ProductPage } from "./pages/product.page";

test("raw page calls in a test", async ({ page, productPage }) => {
  // ruleid: pw-no-raw-page-in-test
  await page.locator("#add").click();
  // ruleid: pw-no-raw-page-in-test
  await page.getByRole("button", { name: "Add to cart" }).click();
  // ruleid: pw-no-raw-page-in-test
  await page.goto("/products/1");
  // ruleid: pw-no-raw-page-in-test
  await page.fill("#qty", "2");
  // ok: pw-no-raw-page-in-test
  await productPage.addToCart(2);
  // ok: pw-no-raw-page-in-test
  await expect(page).toHaveURL(/\/cart$/);
  // ok: pw-no-raw-page-in-test
  await page.context().clearCookies();
});

test("page objects built in a test", async ({ page }) => {
  // ruleid: pw-no-pom-instantiation-in-test
  const productPage = new ProductPage(page);
  // ok: pw-no-pom-instantiation-in-test
  const when = new Date();
  await expect(productPage.heading).toBeVisible();
  expect(when).toBeTruthy();
});

test("fixed waits", async ({ page, productPage }) => {
  // ruleid: pw-no-fixed-wait
  await page.waitForTimeout(3000);
  // ruleid: pw-no-fixed-wait
  await new Promise((resolve) => setTimeout(resolve, 500));
  // ok: pw-no-fixed-wait
  await expect(productPage.heading).toBeVisible();
});

// ruleid: pw-no-serial
test.describe.serial("serial suite", () => {});

// ruleid: pw-no-serial
test.describe.configure({ mode: "serial" });

// ok: pw-no-serial
test.describe.configure({ mode: "parallel" });

test("forced actions", async ({ productPage }) => {
  // ruleid: pw-no-force
  await productPage.addToCartButton.click({ force: true });
  // ruleid: pw-no-force
  await productPage.quantityInput.fill("2", { force: true, timeout: 1000 });
  // ok: pw-no-force
  await productPage.addToCartButton.click({ timeout: 1000 });
  // ok: pw-no-force
  await rm("test-results/tmp", { recursive: true, force: true });
});

test("boolean assertions", async ({ productPage }) => {
  // ruleid: pw-no-boolean-assert
  expect(await productPage.addedToast.isVisible()).toBe(true);
  // ruleid: pw-no-boolean-assert
  expect(await productPage.addToCartButton.isEnabled()).toBeTruthy();
  // ruleid: pw-no-boolean-assert
  expect(await productPage.addedToast.isVisible()).not.toBe(false);
  // ok: pw-no-boolean-assert
  await expect(productPage.addedToast).toBeVisible();
});

test("unawaited assertions", async ({ productPage }) => {
  // ruleid: pw-unawaited-expect
  expect(productPage.addedToast).toBeVisible();
  // ruleid: pw-unawaited-expect
  expect(productPage.heading).not.toHaveText("Sold out");
  // ruleid: pw-unawaited-expect
  expect.soft(productPage.heading).toHaveText("Lamp");
  // ok: pw-unawaited-expect
  await expect(productPage.addedToast).toBeVisible();
  // ok: pw-unawaited-expect
  await expect(productPage.heading).not.toHaveText("Sold out");
  // ok: pw-unawaited-expect
  expect(1 + 1).toBe(2);
});
