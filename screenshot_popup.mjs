import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 1024 });
  await page.goto('http://localhost:3000');
  
  console.log('Waiting for markers...');
  await page.waitForSelector('.leaflet-marker-icon', { timeout: 30000 });
  
  console.log('Clicking marker...');
  await page.locator('.leaflet-marker-icon').first().click({ force: true });
  
  console.log('Waiting for Speed data...');
  await page.waitForSelector('text=Speed:', { timeout: 20000 });
  
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'final_popup_verified.png' });
  await browser.close();
})();
