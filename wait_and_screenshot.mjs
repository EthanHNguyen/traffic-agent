import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 1024 });
  
  console.log('Navigating to http://localhost:3000...');
  await page.goto('http://localhost:3000');
  
  console.log('Waiting for Map container...');
  // The text "STATEWIDE TRAFFIC NETWORK" is static, so we wait for the Leaflet container
  try {
    await page.waitForSelector('.leaflet-container', { timeout: 30000 });
    console.log('Map container detected.');
  } catch (e) {
    console.log('Map container NOT detected within 30s.');
    const html = await page.content();
    console.log('HTML Snippet:', html.substring(0, 1000));
  }
  
  await page.waitForTimeout(5000); // Extra buffer for tiles
  await page.screenshot({ path: 'final_verified_map.png' });
  await browser.close();
})();
