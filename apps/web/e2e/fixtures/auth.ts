import { test as base } from "@playwright/test";

export const E2E_USER = {
  user: "e2e_admin",
  password: "e2e_password_secure_123",
};

export const test = base;
export { expect } from "@playwright/test";
