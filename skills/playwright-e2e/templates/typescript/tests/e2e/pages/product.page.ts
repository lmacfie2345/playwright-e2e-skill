import type { Locator, Page } from "@playwright/test";
import { HeaderComponent } from "../components/header.component";

/**
 * One product's page. Owns every locator and action for it (rule 1); methods express what a user wants to do,
 * not which control they click (rule 3); waits for its own readiness but leaves assertions to tests (rule 6).
 */
export class ProductPage {
  readonly header: HeaderComponent;
  readonly heading: Locator;
  readonly quantityInput: Locator;
  readonly addToCartButton: Locator;
  readonly addedNotice: Locator;
  readonly quantityError: Locator;

  constructor(private readonly page: Page) {
    this.header = new HeaderComponent(page);
    this.heading = page.getByRole("heading", { level: 1 });
    this.quantityInput = page.getByLabel("Quantity");
    this.addToCartButton = page.getByRole("button", { name: "Add to cart" });
    this.addedNotice = page.getByRole("status");
    this.quantityError = page.getByRole("alert");
  }

  async open(productId: string): Promise<void> {
    await this.page.goto(`/products/${encodeURIComponent(productId)}`);
    await this.heading.waitFor();
  }

  /** Adds the product in the given quantity and waits until the app confirms it. */
  async addToCart(quantity: number): Promise<void> {
    await this.setQuantity(quantity);
    await this.addToCartButton.click();
    await this.addedNotice.waitFor();
  }

  /** A single step, for tests whose behaviour under test is the quantity field itself. */
  async setQuantity(quantity: number): Promise<void> {
    await this.quantityInput.fill(String(quantity));
  }

  async submitAddToCart(): Promise<void> {
    await this.addToCartButton.click();
  }
}
