import { mergeTests } from "@playwright/test";
import { test as dataTest } from "./data";
import { test as pagesTest } from "./pages";

/** The project's single fixture entry point: specs import `test` and `expect` from here only (rule 7). */
export const test = mergeTests(pagesTest, dataTest);
export { expect } from "@playwright/test";
export type { Account } from "../support/test-data";
