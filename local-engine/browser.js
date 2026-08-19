import { chromium } from "playwright";

const clip = (value, limit = 6000) => String(value ?? "").slice(0, limit);

function selectorFor(element) {
  const testId = element.getAttribute("data-testid");
  if (testId) return `[data-testid="${CSS.escape(testId)}"]`;
  const id = element.id;
  if (id) return `#${CSS.escape(id)}`;
  const name = element.getAttribute("name");
  if (name) return `${element.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`;
  const parts = [];
  let current = element;
  while (current && current.nodeType === 1 && parts.length < 5) {
    let part = current.tagName.toLowerCase();
    if (current.parentElement) {
      const siblings = [...current.parentElement.children].filter((item) => item.tagName === current.tagName);
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
    }
    parts.unshift(part);
    current = current.parentElement;
  }
  return parts.join(" > ");
}

export function createBrowserRuntime({ getPreviewStatus, emit = () => {} }) {
  let browser = null;
  let page = null;
  const consoleErrors = [];
  const pageErrors = [];

  const ensurePage = async () => {
    if (!browser) browser = await chromium.launch({ headless: true });
    if (!page || page.isClosed()) {
      page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(clip(message.text(), 2000));
      });
      page.on("pageerror", (error) => pageErrors.push(clip(error.message, 2000)));
    }
    return page;
  };

  const currentText = async () => clip(await page.locator("body").innerText().catch(() => ""));

  return {
    browser_open: async (target) => {
      const status = await getPreviewStatus();
      if (!status?.running || !status.url) throw new Error("The project preview is not running. Start the preview before opening the browser.");
      const url = new URL(String(target || "/"), status.url).toString();
      const activePage = await ensurePage();
      await activePage.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
      await activePage.waitForTimeout(500);
      emit("browser-page", { url: activePage.url(), title: await activePage.title().catch(() => "") });
      return { ok: true, url: activePage.url(), title: await activePage.title().catch(() => ""), text: await currentText() };
    },
    browser_inspect: async () => {
      if (!page || page.isClosed()) throw new Error("No browser page is open. Use browser_open first.");
      const elements = await page.locator("button, a, input, textarea, select, [role=button]").evaluateAll((items) => items.filter((item) => {
        const style = getComputedStyle(item);
        const rect = item.getBoundingClientRect();
        return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
      }).slice(0, 100).map((item) => ({
        selector: selectorFor(item),
        tag: item.tagName.toLowerCase(),
        role: item.getAttribute("role") || "",
        text: (item.innerText || item.getAttribute("aria-label") || item.getAttribute("placeholder") || item.getAttribute("name") || "").trim().slice(0, 240),
        type: item.getAttribute("type") || "",
      })));
      return { ok: true, url: page.url(), title: await page.title().catch(() => ""), text: await currentText(), elements, consoleErrors: consoleErrors.slice(-20), pageErrors: pageErrors.slice(-20) };
    },
    browser_click: async (selector) => {
      if (!page || page.isClosed()) throw new Error("No browser page is open. Use browser_open first.");
      await page.locator(String(selector)).first().click({ timeout: 10000 });
      await page.waitForTimeout(500);
      return { ok: true, url: page.url(), text: await currentText(), consoleErrors: consoleErrors.slice(-20), pageErrors: pageErrors.slice(-20) };
    },
    browser_fill: async (selector, text) => {
      if (!page || page.isClosed()) throw new Error("No browser page is open. Use browser_open first.");
      await page.locator(String(selector)).first().fill(String(text ?? ""), { timeout: 10000 });
      return { ok: true, selector, text: await currentText() };
    },
    browser_assert: async (selector, expectedText = "") => {
      if (!page || page.isClosed()) throw new Error("No browser page is open. Use browser_open first.");
      const locator = page.locator(String(selector)).first();
      await locator.waitFor({ state: "visible", timeout: 10000 });
      const actual = await locator.innerText().catch(() => "");
      if (expectedText && !actual.includes(String(expectedText))) throw new Error(`Browser assertion failed: ${selector} did not contain expected text.`);
      return { ok: true, selector, text: clip(actual, 2000), url: page.url() };
    },
    browser_console: async () => ({ ok: true, url: page?.url() || null, consoleErrors: consoleErrors.slice(-50), pageErrors: pageErrors.slice(-50) }),
    close: async () => { if (browser) await browser.close().catch(() => {}); browser = null; page = null; },
  };
}
