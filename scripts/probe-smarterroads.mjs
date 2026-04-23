import { chromium } from "playwright";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const username = process.env.SMARTERROADS_USER;

if (!username) {
  console.error("Set SMARTERROADS_USER before running this script.");
  process.exit(1);
}

const rl = readline.createInterface({ input, output });
const password = await rl.question("SmarterRoads password: ");
rl.close();

const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"]
});

const page = await browser.newPage();
const apiEvents = [];

page.on("response", async (response) => {
  const url = response.url();
  if (!url.includes("smarterroads.vdot.virginia.gov/services") && !url.includes("511-atis")) {
    return;
  }

  const event = {
    method: response.request().method(),
    status: response.status(),
    url,
    requestHeaderNames: Object.keys(response.request().headers()).sort()
  };

  const contentType = response.headers()["content-type"] ?? "";
  if (contentType.includes("application/json")) {
    try {
      const json = await response.json();
      event.keys = json && typeof json === "object" ? Object.keys(json).slice(0, 12) : [];
      if (Array.isArray(json?.data)) {
        event.dataCount = json.data.length;
        event.sample = json.data.slice(0, 3).map((item) => {
          if (!item || typeof item !== "object") return item;
          return {
            dataset_id: item.dataset_id,
            dataset_name: item.dataset_name,
            name: item.name,
            format: item.format,
            update_rate: item.update_rate,
            default_format: item.default_format,
            source: item.source
          };
        });
      }
    } catch {
      event.json = "unreadable";
    }
  } else if (response.status() >= 400) {
    try {
      const text = await response.text();
      event.text = text.slice(0, 500);
    } catch {
      event.text = "unreadable";
    }
  }

  apiEvents.push(event);
});

await page.goto("https://smarterroads.vdot.virginia.gov/login", { waitUntil: "networkidle" });
await page.locator("#id_username").fill(username);
await page.locator("#id_password").fill(password);
const loginResponsePromise = page.waitForResponse(
  (response) => response.url().includes("/services/auth/login"),
  { timeout: 10000 }
).catch(() => null);
await page.locator("#id_password").press("Enter");
await loginResponsePromise;
await page.waitForLoadState("networkidle");

try {
  await page.goto("https://smarterroads.vdot.virginia.gov/user/datasets", { waitUntil: "networkidle" });
  await page.waitForTimeout(5000);
} catch {
  await page.waitForTimeout(5000);
}

const title = await page.title();
const url = page.url();
const cookies = await page.context().cookies();
const visibleText = (await page.locator("body").innerText()).slice(0, 1000);

console.log(JSON.stringify({
  page: { title, url, visibleText },
  cookies: cookies.map((cookie) => ({ name: cookie.name, domain: cookie.domain, httpOnly: cookie.httpOnly })),
  apiEvents
}, null, 2));

await browser.close();
