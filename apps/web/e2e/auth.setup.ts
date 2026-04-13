import { expect, test as setup } from "@playwright/test";
import path from "node:path";

const E2E_USER = { user: "e2e_admin", password: "e2e_password_secure_123" };
const AUTH_FILE = path.join(__dirname, ".auth/user.json");

setup("authenticate", async ({ request }) => {
  const regRes = await request.post("/api/auth/register", {
    data: {
      username: E2E_USER.user,
      password: E2E_USER.password,
    },
  });

  if (!regRes.ok() && regRes.status() !== 409) {
    const loginRes = await request.post("/api/auth/login", {
      data: E2E_USER,
    });
    expect(loginRes.ok()).toBeTruthy();
  } else if (regRes.status() === 409) {
    const loginRes = await request.post("/api/auth/login", {
      data: E2E_USER,
    });
    expect(loginRes.ok()).toBeTruthy();
  }

  await request.storageState({ path: AUTH_FILE });
});
