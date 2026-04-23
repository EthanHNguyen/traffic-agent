import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:3000');
  await page.waitForTimeout(5000);
  const text = await page.innerText('body');
  console.log('--- BODY TEXT ---');
  console.log(text);
  await browser.close();
})();
