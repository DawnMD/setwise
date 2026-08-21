import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const account = {
  name: "Browser Smoke",
  email: `browser-smoke-${stamp}@example.com`,
  password: "browser-smoke-password",
};

async function enterSet(page: Page, weight: string, reps: string) {
  await page.getByRole("button", { name: /^Weight \(kg\)/ }).click();
  await page.getByRole("button", { name: "Clear" }).click();
  for (const digit of weight) {
    await page.getByRole("button", { name: digit, exact: true }).click();
  }
  await page.getByRole("button", { name: "Next: reps" }).click();
  await page.getByRole("button", { name: "Clear" }).click();
  for (const digit of reps) {
    await page.getByRole("button", { name: digit, exact: true }).click();
  }
}

async function pickExercise(page: Page, query: string, result: RegExp) {
  await page.getByRole("button", { name: "Add exercise" }).click();
  await page.getByPlaceholder("Search exercises").fill(query);
  await page.getByRole("option", { name: result }).click();
  await expect(page.getByRole("heading", { name: /Set \d+/ })).toBeVisible();
}

test.describe.serial("Setwise browser smoke", () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test("anonymous routes are server-guarded", async () => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/sign-in$/);

    for (const path of ["/train", "/plan", "/progress", "/settings", "/train/not-a-session"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/sign-in$/);
    }
  });

  test("sign-up establishes a session", async () => {
    await page.goto("/sign-up");
    await page.getByLabel("Name").fill(account.name);
    await page.getByLabel("Email").fill(account.email);
    await page.getByLabel("Password").fill(account.password);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/train$/);
    await expect(page.getByRole("heading", { name: "Setwise" })).toBeVisible();
  });

  test("authenticated navigation and direct loads work", async () => {
    await expect(page).toHaveURL(/\/train$/);

    await page.getByRole("link", { name: "Progress" }).click();
    await expect(page).toHaveURL(/\/progress$/);
    await page.getByRole("link", { name: "Plan" }).click();
    await expect(page).toHaveURL(/\/plan$/);
    await page.getByRole("link", { name: "Train" }).click();
    await expect(page).toHaveURL(/\/train$/);
    await page.getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/settings$/);

    for (const path of ["/train", "/plan", "/progress", "/settings"]) {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`${path}$`));
    }
  });

  test("workout writes appear only after confirmation and failed writes stay editable", async () => {
    await page.goto("/train");
    await page.getByRole("button", { name: "Start workout" }).click();
    await expect(page).toHaveURL(/\/train\/[0-9a-f-]{36}$/);
    const sessionUrl = page.url();

    await pickExercise(page, "medium grip", /Barbell Bench Press - Medium Grip/i);
    await enterSet(page, "100", "5");

    const confirmedRow = page.getByText(/100\s*kg\s*×\s*5/);
    await expect(confirmedRow).toHaveCount(0);
    await page.getByRole("button", { name: "Save set" }).click();
    await expect(confirmedRow).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Skip" })).toBeVisible();

    await page.getByRole("button", { name: "Add set" }).click();
    await enterSet(page, "105", "5");
    await page.route("**/api/rpc/**", (route) => route.abort("failed"), { times: 1 });
    await page.getByRole("button", { name: "Save set" }).click();

    await expect(
      page.getByText("Set didn't save. Check your connection and save again."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /Weight \(kg\).*105/ })).toBeVisible();
    await expect(page.getByText(/105\s*kg\s*×\s*5/)).toHaveCount(0);
    await expect(confirmedRow).toHaveCount(1);

    await page.keyboard.press("Escape");
    await pickExercise(page, "full squat", /Barbell Full Squat/i);
    const unsavedExercise = page.getByRole("main").getByText("Barbell Full Squat", { exact: true });
    await expect(unsavedExercise).toBeVisible();
    await page.reload();

    await expect(page).toHaveURL(sessionUrl);
    await expect(unsavedExercise).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Skip" })).toHaveCount(0);
    await expect(confirmedRow).toHaveCount(1);
  });

  test("theme and CSV export work, then sign-out clears auth", async () => {
    await page.goto("/settings");
    await page.getByRole("button", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/);

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download sets" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/sets.*\.csv$/);

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/sign-in$/);

    await page.getByLabel("Email").fill(account.email);
    await page.getByLabel("Password").fill(account.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/train$/);
  });
});
