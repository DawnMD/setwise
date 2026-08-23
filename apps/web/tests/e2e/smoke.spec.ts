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

    for (const path of [
      "/train",
      "/plan",
      "/progress",
      "/body",
      "/onboarding",
      "/settings",
      "/train/not-a-session",
    ]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/sign-in$/);
    }
  });

  test("sign-up establishes a session and opens the wizard", async () => {
    await page.goto("/sign-up");
    await page.getByLabel("Name").fill(account.name);
    await page.getByLabel("Email").fill(account.email);
    await page.getByLabel("Password").fill(account.password);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.getByRole("heading", { name: "What do you weigh?" })).toBeVisible();
  });

  /**
   * The wizard, answered rather than skipped, because the thing worth proving
   * is that five separate saves add up to one calorie target on Body.
   */
  test("onboarding saves each step and produces a target", async () => {
    for (const digit of "80") {
      await page.getByRole("button", { name: digit, exact: true }).click();
    }
    await page.getByRole("button", { name: "Save and continue" }).click();

    await expect(page.getByRole("heading", { name: "A few fixed numbers" })).toBeVisible();
    await page.getByLabel("Height (cm)").fill("180");
    await page.getByRole("radio", { name: "Male", exact: true }).click();
    await page.getByRole("button", { name: "Save and continue" }).click();

    await expect(page.getByRole("heading", { name: "How much do you move?" })).toBeVisible();
    await page.getByRole("radio", { name: "Moderate" }).click();
    await page.getByRole("button", { name: "Save and continue" }).click();

    await expect(page.getByRole("heading", { name: "What are you aiming for?" })).toBeVisible();
    await page.getByRole("radio", { name: "Hold weight" }).click();
    await page.getByRole("button", { name: "Save and continue" }).click();

    // Date of birth was skipped, so BMR cannot be worked out and the screen has
    // to say which answer it is still waiting on rather than show a blank card.
    await expect(page.getByRole("heading", { name: "Here are your targets" })).toBeVisible();
    await expect(page.getByText(/your date of birth/)).toBeVisible();

    await page.getByRole("button", { name: "Finish" }).click();
    await expect(page).toHaveURL(/\/body$/);
    // The weigh-in from step one survived the four saves after it. It appears
    // twice now — once on the weigh-in card and once in the list under the
    // chart — because the Body route warms its series before the screen mounts
    // rather than after.
    await expect(page.getByText("80 kg").first()).toBeVisible();
  });

  test("authenticated navigation and direct loads work", async () => {
    await page.goto("/train");

    await page.getByRole("link", { name: "Progress" }).click();
    await expect(page).toHaveURL(/\/progress$/);
    await page.getByRole("link", { name: "Body" }).click();
    await expect(page).toHaveURL(/\/body$/);
    await page.getByRole("link", { name: "Plan" }).click();
    await expect(page).toHaveURL(/\/plan$/);
    await page.getByRole("link", { name: "Train" }).click();
    await expect(page).toHaveURL(/\/train$/);
    // Home took `/` in phase 6, and the settings gear went with it.
    await page.getByRole("link", { name: "Home" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Setwise" })).toBeVisible();
    await page.getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/settings$/);

    for (const path of ["/", "/train", "/plan", "/progress", "/body", "/settings"]) {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`${path}$`));
    }
  });

  /** Collects the RPC requests a navigation makes, and nothing else. */
  async function recordRpc(navigate: () => Promise<void>): Promise<string[]> {
    const rpc: string[] = [];
    const record = (url: string) => {
      if (url.includes("/api/rpc")) rpc.push(url);
    };
    page.on("request", (request) => record(request.url()));
    await navigate();
    page.removeAllListeners("request");
    return rpc;
  }

  /**
   * Train is the widest screen in the app: the open workout, recent activity,
   * the rotation and today's rest. All four leave in one request.
   */
  test("a screen's reads leave as one batched request", async () => {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

    const rpc = await recordRpc(async () => {
      await page.getByRole("link", { name: "Train" }).click();
      await expect(page).toHaveURL(/\/train$/);
      await expect(page.getByRole("heading", { name: "Train" })).toBeVisible();
      await expect(page.getByText("Recent activity")).toBeVisible();
    });

    expect(rpc.length).toBeGreaterThan(0);
    // Every one of them went to the batch endpoint, which is the same thing as
    // saying none of them went on its own.
    for (const url of rpc) {
      expect(url).toContain("/api/rpc/__batch__");
    }
    expect(rpc.length).toBeLessThanOrEqual(2);
  });

  /**
   * Home summarises five screens and costs one request to draw. The summary is
   * one procedure and the targets are the shared profile read every other
   * screen uses, so a cold arrival sends both together and nothing else.
   */
  test("home draws from one request", async () => {
    await page.goto("/train");
    await expect(page.getByRole("heading", { name: "Train" })).toBeVisible();

    const rpc = await recordRpc(async () => {
      await page.getByRole("link", { name: "Home" }).click();
      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByRole("heading", { name: "Setwise" })).toBeVisible();
      await expect(page.getByText("This week")).toBeVisible();
    });

    expect(rpc).toHaveLength(1);
    expect(rpc[0]).toContain("/api/rpc/__batch__");
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
    // Twice, because a set save is retried once now: the client names the row,
    // so restating it cannot log a second set. One dropped request is something
    // the app recovers from; this test is about what happens when it does not.
    await page.route("**/api/rpc/**", (route) => route.abort("failed"), { times: 2 });
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

  /**
   * The workout above was left open on purpose. Home has to lead with it, and
   * the set it confirmed has to already be in the week's rollup — a summary
   * that lags the thing it summarises is worse than no summary.
   */
  test("home leads with the open workout and counts the set it confirmed", async () => {
    await page.goto("/");
    await expect(page.getByText("Workout in progress")).toBeVisible();

    const week = page.getByRole("link", { name: "This week, on Progress" });
    await expect(week).toContainText("Working sets");
    // 100 kg for 5, and the unit is in the label rather than beside the figure.
    await expect(week).toContainText("500");
    await expect(week).toContainText("Tonnage (kg)");

    await page.getByRole("link", { name: "Carry on" }).click();
    await expect(page).toHaveURL(/\/train\/[0-9a-f-]{36}$/);
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
    await expect(page).toHaveURL(/\/$/);
  });
});
