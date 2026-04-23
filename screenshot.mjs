import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  console.log('Navigating to http://localhost:3000...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  
  console.log('Waiting for Speed Trend text...');
  await page.waitForSelector('text=Speed Trend', { timeout: 30000 });

  console.log('Waiting for map to be visible...');
  await page.waitForSelector('.leaflet-container', { timeout: 30000 });
  
  // Also wait for the agent response
  await page.waitForSelector('text=Route 28 northbound', { timeout: 10000 }).catch(e => console.log("Agent response not found"));

  console.log('Waiting an extra 2 seconds for animations...');
  await page.waitForTimeout(2000);

  console.log('Capturing real_screenshot.png...');
  await page.screenshot({ path: 'real_screenshot.png', fullPage: true });
  
  await browser.close();
  console.log('Done.');
})();
