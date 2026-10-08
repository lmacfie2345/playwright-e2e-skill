import { expect, type APIRequestContext, type APIResponse } from "@playwright/test";

/** Placeholder resources: replace with your application's. */
export interface Product {
  readonly id: string;
  readonly name: string;
  readonly priceInPence: number;
}

export interface NewProduct {
  readonly name: string;
  readonly priceInPence: number;
}

export interface NewUser {
  readonly name: string;
  readonly email: string;
  readonly password: string;
  readonly role: "customer" | "admin";
}

export interface User {
  readonly id: string;
  readonly email: string;
}

/**
 * A typed wrapper over the application's public API, used to arrange and clean up test data (rule 10). One
 * method per endpoint the suite needs; responses are checked here so tests never see raw HTTP.
 */
export class ApiClient {
  constructor(private readonly request: APIRequestContext) {}

  async createProduct(product: NewProduct): Promise<Product> {
    return this.json<Product>(await this.request.post("/api/products", { data: product }), 201);
  }

  async deleteProduct(id: string): Promise<void> {
    this.expectStatus(await this.request.delete(`/api/products/${encodeURIComponent(id)}`), 204, 404);
  }

  async createUser(user: NewUser): Promise<User> {
    return this.json<User>(await this.request.post("/api/users", { data: user }), 201);
  }

  async deleteUser(id: string): Promise<void> {
    this.expectStatus(await this.request.delete(`/api/users/${encodeURIComponent(id)}`), 204, 404);
  }

  /** Run-level safety net: deletes every record whose name or email starts with `prefix`. */
  async deleteByPrefix(prefix: string): Promise<number> {
    const body = await this.json<{ deleted: number }>(
      await this.request.delete(`/api/test-support/records?prefix=${encodeURIComponent(prefix)}`),
      200,
    );
    return body.deleted;
  }

  private async json<T>(response: APIResponse, expected: number): Promise<T> {
    this.expectStatus(response, expected);
    return (await response.json()) as T;
  }

  private expectStatus(response: APIResponse, ...accepted: number[]): void {
    expect(accepted, `${response.url()} returned ${response.status()}`).toContain(response.status());
  }
}
