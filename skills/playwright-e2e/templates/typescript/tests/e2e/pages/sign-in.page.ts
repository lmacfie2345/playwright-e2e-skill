import type { Locator, Page } from "@playwright/test";
import type { Credentials } from "../support/auth";

export class SignInPage {
  readonly heading: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly signInButton: Locator;
  readonly errorMessage: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole("heading", { name: "Sign in" });
    this.emailInput = page.getByLabel("Email");
    this.passwordInput = page.getByLabel("Password");
    this.signInButton = page.getByRole("button", { name: "Sign in" });
    this.errorMessage = page.getByRole("alert");
  }

  async open(): Promise<void> {
    await this.page.goto("/login");
    await this.heading.waitFor();
  }

  /** The sign-in form. Only tests of signing in use it; every other test signs in through the API (rule 8). */
  async signIn(credentials: Credentials): Promise<void> {
    await this.emailInput.fill(credentials.email);
    await this.passwordInput.fill(credentials.password);
    await this.signInButton.click();
  }
}
