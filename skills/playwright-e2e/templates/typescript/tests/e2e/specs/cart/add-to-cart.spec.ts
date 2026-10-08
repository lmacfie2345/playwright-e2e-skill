import { expect, test } from "../../fixtures";

// Runs as this worker's own customer (the default storage state), because adding to a cart changes account state.
// Each test arranges its own product through the API, acts and asserts through the UI, and asserts only on its own
// data. Cleanup happens in the `data` fixture's teardown.
test.describe("add to cart", { tag: ["@regression"] }, () => {
  test("adds the chosen quantity to the cart", { tag: ["@smoke"] }, async ({ data, signInAs, productPage }) => {
    // The cart count is a total for the whole account, and other tests in this worker share the worker's customer.
    // Asserting on it needs an account this test owns (rule 10: assert only on the test's own data).
    await signInAs(await data.createCustomer());
    const product = await data.createProduct("lamp");

    await productPage.open(product.id);
    await productPage.addToCart(2);

    await expect(productPage.addedNotice).toHaveText(`Added 2 × ${product.name} to your cart`);
    await expect(productPage.header.cartCount).toHaveText("2");
  });

  test("rejects a quantity of zero", async ({ data, productPage }) => {
    const product = await data.createProduct("lamp");

    await productPage.open(product.id);
    await productPage.setQuantity(0);
    await productPage.submitAddToCart();

    await expect(productPage.quantityError).toHaveText("Quantity must be at least 1");
    await expect(productPage.addedNotice).toBeHidden();
  });
});
