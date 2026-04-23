import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 1024 });
  
  console.log('Navigating to dashboard...');
  await page.goto('http://localhost:3000');
  
  // Wait for the statewide query to finish
  console.log('Waiting for statewide sensor load...');
  await page.waitForFunction(() => {
    const badge = document.querySelector('span.bg-mile\\/10');
    if (!badge) return false;
    const count = parseInt(badge.innerText);
    return count > 1000;
  }, { timeout: 30000 });

  const sensorCount = await page.locator('span.bg-mile\\/10').innerText();
  console.log('--- TEST RESULTS ---');
  console.log('Statewide Sensors Detected:', sensorCount);

  // Verify Clustering is working
  const clusters = await page.locator('.marker-cluster').count();
  console.log('Map Clusters found:', clusters);

  // Test corridor specific query
  console.log('Querying I-95 South...');
  const textarea = page.getByPlaceholder(/Ask about the Route 28 commute/);
  await textarea.fill('How is I-95 South looking?');
  await page.getByRole('button', { name: 'Ask' }).click();

  await page.waitForTimeout(6000);
  const messages = await page.locator('.flex-1.space-y-3 >> div').allInnerTexts();
  console.log('Agent Response for I-95:', messages[messages.length - 1]);

  await page.screenshot({ path: 'statewide_verified.png', fullPage: true });
  await browser.close();
})();
