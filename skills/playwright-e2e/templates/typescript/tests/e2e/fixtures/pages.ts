import { test as base } from "@playwright/test";
import { HeaderComponent } from "../components/header.component";
import { ProductPage } from "../pages/product.page";
import { SignInPage } from "../pages/sign-in.page";

/** Page objects, created lazily: a test pays only for the ones it asks for (rule 7). */
export interface PageFixtures {
  header: HeaderComponent;
  productPage: ProductPage;
  signInPage: SignInPage;
}

export const test = base.extend<PageFixtures>({
  header: async ({ page }, use) => {
    await use(new HeaderComponent(page));
  },
  productPage: async ({ page }, use) => {
    await use(new ProductPage(page));
  },
  signInPage: async ({ page }, use) => {
    await use(new SignInPage(page));
  },
});
