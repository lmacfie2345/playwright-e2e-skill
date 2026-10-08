import { test as base, type APIRequestContext } from "@playwright/test";
import { ApiClient } from "../support/api-client";
import { ADMIN_STATE, signInViaApi } from "../support/auth";
import { requireBaseUrl } from "../support/env";
import { TestData, type Account } from "../support/test-data";

export interface DataFixtures {
  /** Per-test data, deleted in teardown even when the test fails (rule 10). */
  data: TestData;
  /** Signs this test's browser context in as `account` through the API, never the UI (rule 8). */
  signInAs: (account: Account) => Promise<void>;
}

export interface DataWorkerFixtures {
  /** API client authenticated as the administrator, for arranging data. */
  adminApi: ApiClient;
  /** This worker's own customer: tests that change account state (cart, profile) never share one (rule 8). */
  workerCustomer: Account;
  /** Kept in memory, never written to disk: it holds a live session token. */
  workerCustomerState: StorageState;
}

type StorageState = Awaited<ReturnType<APIRequestContext["storageState"]>>;

export const test = base.extend<DataFixtures, DataWorkerFixtures>({
  adminApi: [
    async ({ playwright }, use, workerInfo) => {
      const request = await playwright.request.newContext({
        baseURL: requireBaseUrl(workerInfo.project.use.baseURL),
        storageState: ADMIN_STATE, // written by setup/auth.setup.ts, which every test project depends on
      });
      await use(new ApiClient(request));
      await request.dispose();
    },
    { scope: "worker" },
  ],

  workerCustomer: [
    async ({ adminApi }, use, workerInfo) => {
      const workerData = new TestData(adminApi, `w${workerInfo.parallelIndex}`);
      try {
        await use(await workerData.createCustomer());
      } finally {
        await workerData.cleanUp();
      }
    },
    { scope: "worker" },
  ],

  workerCustomerState: [
    async ({ playwright, workerCustomer }, use, workerInfo) => {
      const request = await playwright.request.newContext({ baseURL: requireBaseUrl(workerInfo.project.use.baseURL) });
      let state: StorageState;
      try {
        await signInViaApi(request, workerCustomer);
        state = await request.storageState();
      } finally {
        await request.dispose();
      }
      await use(state);
    },
    { scope: "worker" },
  ],

  // Tests run as this worker's customer by default. Override per file with test.use({ storageState: ... }).
  storageState: async ({ workerCustomerState }, use) => {
    await use(workerCustomerState);
  },

  data: async ({ adminApi }, use, testInfo) => {
    const data = new TestData(adminApi, `w${testInfo.parallelIndex}`);
    try {
      await use(data);
    } finally {
      await data.cleanUp();
    }
  },

  signInAs: async ({ page }, use) => {
    await use((account) => signInViaApi(page.context().request, account));
  },
});
