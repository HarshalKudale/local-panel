/**
 * Screenshot tour of every panel in the left sidebar.
 *
 * Tab-based panels (Mock / Request sub-panels, WebSocket, Webhooks) get a
 * second screenshot taken with a fresh draft tab open so the tab bar is
 * visible.
 *
 * All screenshots are written to <workspace-root>/screenshots/
 */

import { test } from "./fixtures/electronApp";
import path from "path";
import fs from "fs";

// ── Output directory ───────────────────────────────────────────────────────

const SCREENSHOT_DIR = path.resolve(__dirname, "..", "..", "screenshots");
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

// ── Panel definitions ──────────────────────────────────────────────────────

interface PanelDef {
    /** Human-readable name for the screenshot file */
    name: string;
    /** Section header text that the nav item lives under */
    section?: string;
    /** Exact nav label to click */
    navLabel: string;
    /** If the section is collapsible, pass the section header label to expand it first */
    collapsibleSection?: string;
    /** Opens a new draft tab after navigating (for tab-based panels) */
    openNewTab?: boolean;
}

const PANELS: PanelDef[] = [
    // ── Routing (flat) ─────────────────────────────────────────────────────
    { name: "01-mappings", navLabel: "Mappings" },
    { name: "02-proxy-rules", navLabel: "Proxy Rules" },
    { name: "03-capture", navLabel: "Capture" },

    // ── Mock (collapsible) ─────────────────────────────────────────────────
    { name: "04-mock-rest", collapsibleSection: "Mock", navLabel: "REST", openNewTab: true },
    { name: "05-mock-graphql", collapsibleSection: "Mock", navLabel: "GraphQL", openNewTab: true },
    { name: "06-mock-soap", collapsibleSection: "Mock", navLabel: "SOAP", openNewTab: true },
    { name: "07-mock-grpc", collapsibleSection: "Mock", navLabel: "gRPC", openNewTab: true },

    // ── Request (collapsible) ──────────────────────────────────────────────
    { name: "08-req-rest", collapsibleSection: "Request", navLabel: "REST", openNewTab: true },
    { name: "09-req-graphql", collapsibleSection: "Request", navLabel: "GraphQL", openNewTab: true },
    { name: "10-req-soap", collapsibleSection: "Request", navLabel: "SOAP", openNewTab: true },
    { name: "11-req-grpc", collapsibleSection: "Request", navLabel: "gRPC", openNewTab: true },
    { name: "12-websocket", collapsibleSection: "Request", navLabel: "WebSocket", openNewTab: true },
    { name: "13-webhooks", collapsibleSection: "Request", navLabel: "Webhooks", openNewTab: true },

    // ── Tools (flat) ───────────────────────────────────────────────────────
    { name: "14-environments", navLabel: "Envs & Vars" },

    // ── Applications (flat) ────────────────────────────────────────────────
    { name: "15-run-configs", navLabel: "Runner" },

    // ── Discovery (flat) ───────────────────────────────────────────────────
    { name: "16-services", navLabel: "Services" },

    // ── Monitoring (flat) ──────────────────────────────────────────────────
    { name: "17-health-bar", navLabel: "Health Bar" },
];

// ── Helpers ────────────────────────────────────────────────────────────────

/** Save a full-page screenshot with an annotated filename */
async function shot(page: import("@playwright/test").Page, name: string) {
    const file = path.join(SCREENSHOT_DIR, `${name}.png`);
    await page.screenshot({ path: file, fullPage: false });
    console.log(`  ✓ ${file}`);
}

/** Expand a collapsible section if it is currently collapsed.
 *  Returns the container div of that section. */
async function ensureSectionExpanded(
    page: import("@playwright/test").Page,
    label: string,
): Promise<import("@playwright/test").Locator> {
    // Each collapsible section is wrapped in a div.mt-1 that contains a toggle button
    // whose text matches the label (case-insensitive, ignoring chevron svg text)
    const allSections = page.locator("div.mt-1");
    const count = await allSections.count();

    for (let i = 0; i < count; i++) {
        const sec = allSections.nth(i);
        const toggleBtn = sec.locator("button").first();
        const text = (await toggleBtn.textContent().catch(() => "")) ?? "";
        if (text.toLowerCase().includes(label.toLowerCase())) {
            // Check if the items div is visible (expanded)
            const itemsDiv = sec.locator("div.flex.flex-col").first();
            const isExpanded = await itemsDiv.isVisible().catch(() => false);
            if (!isExpanded) {
                await toggleBtn.click();
                await page.waitForTimeout(400);
            }
            return sec;
        }
    }
    return page.locator("body"); // fallback
}

/** Click a nav item scoped to an optional section container.
 *  When `sectionContainer` is provided (collapsible sections), we restrict
 *  the button search to that subtree to avoid duplicate-label collisions. */
async function clickNavItem(
    page: import("@playwright/test").Page,
    label: string,
    sectionContainer?: import("@playwright/test").Locator,
) {
    const root = sectionContainer ?? page;
    // Items inside a collapsible section are in the inner div.flex.flex-col
    const itemsRoot = sectionContainer
        ? sectionContainer.locator("div.flex.flex-col").first()
        : page;

    // Match button text containing the label (badges are in separate spans)
    const btn = itemsRoot
        .locator("button")
        .filter({ hasText: label })
        .first();

    if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await btn.scrollIntoViewIfNeeded().catch(() => {});
        await btn.click();
    } else {
        // Broader fallback - removed exact:true since badges add extra text
        const fallback = (root as import("@playwright/test").Page | import("@playwright/test").Locator)
            .getByRole("button")
            .filter({ hasText: label })
            .first();
        await fallback.scrollIntoViewIfNeeded().catch(() => {});
        await fallback.click();
    }
    await page.waitForTimeout(600);
}

// ── Test ───────────────────────────────────────────────────────────────────

test.setTimeout(120_000);

test("screenshot tour of all sidebar panels", async ({ page }) => {
    // Wait for the app to fully load
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    // Screenshot the initial state
    await shot(page, "00-initial");

    for (const panel of PANELS) {
        console.log(`\nNavigating to: ${panel.name}`);

        // 1. If collapsible section, expand it first and get its container
        let sectionContainer: import("@playwright/test").Locator | undefined;
        if (panel.collapsibleSection) {
            sectionContainer = await ensureSectionExpanded(page, panel.collapsibleSection);
        }

        // 2. Click the nav item (scoped to section container for collapsibles)
        await clickNavItem(page, panel.navLabel, sectionContainer);

        // 3. For tab-based panels, open a new draft tab by clicking the + button
        if (panel.openNewTab) {
            // TabBar + buttons always have title="New <something>" (starts with "New ").
            // This avoids matching unrelated buttons like "Stop webhook server".
            // Panels where the TabBar only renders when tabs exist (e.g. Webhooks) need
            // Strategy B: click the empty-state "New …" button in the main content.

            let clicked = false;

            // Strategy A: TabBar + button whose title starts with "New "
            try {
                const plusBtn = page.locator("button[title^='New ']").first();
                if (await plusBtn.isVisible({ timeout: 1200 })) {
                    await plusBtn.click();
                    clicked = true;
                }
            } catch { /* continue */ }

            // Strategy B: empty-state "New …" visible button (e.g. Webhooks)
            if (!clicked) {
                try {
                    const allBtns = page.locator("button");
                    const count = await allBtns.count();
                    for (let i = 0; i < count; i++) {
                        const btn = allBtns.nth(i);
                        if (!(await btn.isVisible().catch(() => false))) continue;
                        const text = (await btn.textContent().catch(() => "") ?? "").trim();
                        if (/^New [A-Z]/i.test(text)) {
                            await btn.click();
                            clicked = true;
                            break;
                        }
                    }
                } catch { /* ignore */ }
            }

            if (clicked) await page.waitForTimeout(900);
        }

        // 4. Screenshot
        await shot(page, panel.name);
    }

    console.log(`\nAll screenshots saved to: ${SCREENSHOT_DIR}`);
});
