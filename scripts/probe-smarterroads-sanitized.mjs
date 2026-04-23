import { chromium } from "playwright";
import fs from "node:fs";

function loadEnv(path) {
  const env = {};
  const text = fs.readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
  }
  return env;
}

function sanitizeUrl(raw) {
  const url = new URL(raw);
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().includes("token")) {
      url.searchParams.set(key, "[redacted]");
    }
  }
  return url.toString();
}

function summarize(value) {
  if (Array.isArray(value)) {
    return {
      type: "array",
      count: value.length,
      sample: value.slice(0, 2).map(summarize),
    };
  }
  if (value && typeof value === "object") {
    const result = { type: "object", keys: Object.keys(value).slice(0, 25) };
    for (const key of [
      "success",
      "data",
      "result",
      "token",
      "url",
      "path",
      "dataset_id",
      "dataset_name",
      "format",
      "download_url",
    ]) {
      if (key in value) {
        result[key] = key.toLowerCase().includes("token") ? "[redacted]" : summarize(value[key]);
      }
    }
    return result;
  }
  return value;
}

const env = loadEnv("/home/ethan/code/traffic-agent/apps/api/.env");
const username = env.VDOT_USERNAME;
const password = env.VDOT_PASSWORD;

if (!username || !password) {
  throw new Error("VDOT_USERNAME and VDOT_PASSWORD are required");
}

const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
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
    url: sanitizeUrl(url),
    contentType: response.headers()["content-type"] ?? "",
  };

  if (event.contentType.includes("application/json")) {
    try {
      event.body = summarize(await response.json());
    } catch {
      event.body = "unreadable-json";
    }
  }

  apiEvents.push(event);
});

await page.goto("https://smarterroads.vdot.virginia.gov/login", { waitUntil: "networkidle" });
await page.locator("#id_username").fill(username);
await page.locator("#id_password").fill(password);
await page.locator("#id_password").press("Enter");
await page.waitForLoadState("networkidle");
await page.goto("https://smarterroads.vdot.virginia.gov/user/datasets", { waitUntil: "networkidle" });
await page.waitForTimeout(6000);

console.log(JSON.stringify({
  page: {
    title: await page.title(),
    url: page.url(),
  },
  events: apiEvents,
}, null, 2));

await browser.close();
