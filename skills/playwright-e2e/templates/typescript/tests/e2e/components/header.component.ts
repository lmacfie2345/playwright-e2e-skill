import type { Locator, Page } from "@playwright/test";

/**
 * The site header, shown on every page. A component object: scoped to its own root and composed into the
 * pages that contain it (rule 4). Read-only locators for assertions (rule 2); no business assertions (rule 6).
 */
export class HeaderComponent {
  readonly root: Locator;
  readonly cartCount: Locator;
  readonly signedInUser: Locator;

  constructor(page: Page) {
    this.root = page.getByRole("banner");
    this.cartCount = this.root.getByTestId("cart-count"); // a bare number with no accessible name of its own
    this.signedInUser = this.root.getByText(/^Signed in as /);
  }

  /** A main-navigation link, for assertions on what a role can reach. */
  navLink(name: string): Locator {
    return this.root.getByRole("navigation", { name: "Main" }).getByRole("link", { name, exact: true });
  }

  async openCart(): Promise<void> {
    await this.root.getByRole("link", { name: "Cart" }).click();
  }
}
