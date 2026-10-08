import { randomUUID } from "node:crypto";
import type { ApiClient, Product } from "./api-client";
import type { Credentials } from "./auth";
import { runPrefix } from "./env";

export interface Account extends Credentials {
  readonly id: string;
  readonly name: string;
}

type Cleanup = () => Promise<void>;

/**
 * Arranges data outside the UI and deletes it again (rule 10). This template uses the public API (preference
 * order step 1). If your application has no API for a record, swap the call for a test-support endpoint, then the
 * app's own service layer in-process, then a direct database insert, in that order, and say which in the plan.
 *
 * Every record carries the run prefix, so the run-level safety net in global teardown can find anything a
 * crashed run leaves behind.
 */
export class TestData {
  private readonly cleanups: Cleanup[] = [];

  constructor(
    private readonly api: ApiClient,
    private readonly owner: string,
  ) {}

  /** A unique, readable name for this run and worker, e.g. `e2e-1a2b3c4d-w0-lamp-9f8e7d`. */
  uniqueName(label: string): string {
    return `${runPrefix()}-${this.owner}-${label}-${randomUUID().slice(0, 6)}`;
  }

  async createProduct(label = "product", priceInPence = 1999): Promise<Product> {
    const product = await this.api.createProduct({ name: this.uniqueName(label), priceInPence });
    this.cleanups.push(() => this.api.deleteProduct(product.id));
    return product;
  }

  async createCustomer(): Promise<Account> {
    const name = this.uniqueName("customer");
    const email = `${name}@example.test`;
    const password = randomUUID(); // random per account; never logged
    const user = await this.api.createUser({ name, email, password, role: "customer" });
    this.cleanups.push(() => this.api.deleteUser(user.id));
    return { id: user.id, name, email, password };
  }

  /** Deletes everything this instance created, newest first (children before parents). Runs even after a failure. */
  async cleanUp(): Promise<void> {
    const errors: unknown[] = [];
    for (const cleanup of this.cleanups.reverse()) {
      try {
        await cleanup();
      } catch (error) {
        errors.push(error); // keep going, so one failure doesn't strand the rest
      }
    }
    this.cleanups.length = 0;
    if (errors.length > 0) throw new AggregateError(errors, `Cleanup failed for ${errors.length} record(s)`);
  }
}
