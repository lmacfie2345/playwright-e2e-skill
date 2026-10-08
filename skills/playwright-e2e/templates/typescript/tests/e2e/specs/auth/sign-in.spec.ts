import { expect, test } from "../../fixtures";
import { NO_SESSION } from "../../support/auth";

// Tests of signing in start without a session; they are the only tests that use the sign-in form (rule 8).
test.use({ storageState: NO_SESSION });

test.describe("sign-in", { tag: ["@smoke"] }, () => {
  test("signs a customer in and shows who is signed in", async ({ data, signInPage, header }) => {
    const customer = await data.createCustomer();

    await signInPage.open();
    await signInPage.signIn(customer);

    await expect(header.signedInUser).toHaveText(`Signed in as ${customer.name}`);
  });

  test("rejects an incorrect password", async ({ data, signInPage }) => {
    const customer = await data.createCustomer();

    await signInPage.open();
    await signInPage.signIn({ email: customer.email, password: `${customer.password}-wrong` });

    await expect(signInPage.errorMessage).toHaveText("Incorrect email or password");
  });
});
