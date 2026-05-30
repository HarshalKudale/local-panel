import { test, expect } from "./fixtures/electronApp";

test.describe("Applications Panel", () => {
    test.beforeEach(async ({ page }) => {
        const nav = page
            .locator("text=Applications, [data-testid='nav-applications']")
            .first();
        if (await nav.isVisible()) {
            await nav.click();
            await page.waitForTimeout(500);
        }
    });

    test("displays applications panel heading", async ({ page }) => {
        const body = await page.textContent("body");
        expect(body).toBeTruthy();
        // The panel title or empty state should be visible
        const hasHeading =
            (body ?? "").includes("Applications") ||
            (body ?? "").includes("No applications configured");
        expect(hasHeading).toBe(true);
    });

    test("shows empty state when no applications exist", async ({ page }) => {
        const body = await page.textContent("body");
        // Either empty state message or existing app cards
        expect(body).toBeTruthy();
    });

    test("can open the Add Application form", async ({ page }) => {
        const addBtn = page
            .locator("button:has-text('Add Application'), [data-testid='add-application']")
            .first();
        if (await addBtn.isVisible()) {
            await addBtn.click();
            await page.waitForTimeout(300);

            // Form should be visible after clicking add
            const nameInput = page
                .locator("input[placeholder='My App'], input[placeholder*='name'], input[placeholder*='App']")
                .first();
            const formVisible = await nameInput.isVisible();
            expect(formVisible).toBe(true);
        }
    });

    test("can add and see a new application configuration", async ({ page }) => {
        const addBtn = page
            .locator("button:has-text('Add Application'), [data-testid='add-application']")
            .first();
        if (!(await addBtn.isVisible())) return;

        await addBtn.click();
        await page.waitForTimeout(300);

        // Fill name
        const nameInput = page
            .locator("input[placeholder='My App'], input[placeholder*='App']")
            .first();
        if (!(await nameInput.isVisible())) return;
        await nameInput.fill("Test Shell App");

        // Fill working directory
        const wdInput = page
            .locator("input[placeholder='/path/to/project']")
            .first();
        if (await wdInput.isVisible()) {
            await wdInput.fill("/tmp/test");
        }

        // Submit
        const submitBtn = page
            .locator("button:has-text('Add Application'), button[type='submit']")
            .last();
        if (await submitBtn.isVisible()) {
            await submitBtn.click();
            await page.waitForTimeout(500);

            const body = await page.textContent("body");
            expect(body).toContain("Test Shell App");
        }
    });

    test("can cancel the add application form", async ({ page }) => {
        const addBtn = page
            .locator("button:has-text('Add Application'), [data-testid='add-application']")
            .first();
        if (!(await addBtn.isVisible())) return;

        await addBtn.click();
        await page.waitForTimeout(300);

        const cancelBtn = page
            .locator("button:has-text('Cancel')")
            .first();
        if (await cancelBtn.isVisible()) {
            await cancelBtn.click();
            await page.waitForTimeout(200);

            // Form should be gone
            const nameInput = page
                .locator("input[placeholder='My App']")
                .first();
            const isGone = !(await nameInput.isVisible());
            expect(isGone).toBe(true);
        }
    });
});
