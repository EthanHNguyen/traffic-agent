import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));
  page.on('requestfailed', request => console.log('REQ FAILED:', request.url(), request.failure().errorText));

  console.log('Navigating to http://localhost:3000...');
  await page.goto('http://localhost:3000');
  
  await page.waitForTimeout(5000);
  
  await browser.close();
})();
