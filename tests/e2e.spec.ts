import { expect, test, type Page } from '@playwright/test';

const mockSensors = [
  {
    id: 'sensor-va28-nb',
    name: 'VA-28 Northbound',
    corridor: 'VA-28N',
    direction: 'N',
    mile_marker: 12.4,
    location: { latitude: 38.92, longitude: -77.45 },
  },
  {
    id: 'sensor-i95-sb',
    name: 'I-95 Southbound',
    corridor: 'I-95S',
    direction: 'S',
    mile_marker: 151.2,
    location: { latitude: 38.67, longitude: -77.25 },
  },
  {
    id: 'sensor-i95-nb',
    name: 'I-95 Northbound',
    corridor: 'I-95N',
    direction: 'N',
    mile_marker: 152.1,
    location: { latitude: 38.71, longitude: -77.23 },
  },
  {
    id: 'sensor-va28-sb',
    name: 'VA-28 Southbound',
    corridor: 'VA-28S',
    direction: 'S',
    mile_marker: 10.1,
    location: { latitude: 38.84, longitude: -77.43 },
  },
];

const queryResponse = {
  answer: '**VA-28 northbound** is averaging 43 mph, below the 55 mph baseline.',
  sql: 'SELECT * FROM traffic_observations LIMIT 2',
  chart: [
    {
      timestamp: '2026-04-22T12:00:00Z',
      speed_mph: 48,
      baseline_mph: 55,
    },
    {
      timestamp: '2026-04-22T12:05:00Z',
      speed_mph: 43,
      baseline_mph: 55,
    },
  ],
  sensors: [mockSensors[0]],
  incidents: [
    {
      id: 'incident-1',
      title: 'Disabled vehicle on VA-28',
      description: 'Right shoulder blocked.',
      severity: 'medium',
      corridor: 'VA-28N',
      starts_at: '2026-04-22T11:45:00Z',
      ends_at: null,
      location: { latitude: 38.91, longitude: -77.44 },
    },
  ],
  anomaly_detected: true,
  latency_ms: 128,
  ui_actions: [
    { type: 'set_corridor', value: 'VA-28N' },
    { type: 'set_time_range', value: 'last_1h' },
    { type: 'set_chart_mode', value: 'history' },
    { type: 'highlight_sensors', value: ['sensor-va28-nb'] },
    { type: 'focus_map', value: { latitude: 38.92, longitude: -77.45, zoom: 12 } },
  ],
  follow_ups: [],
};

const historyResponse = {
  corridor: 'VA-28',
  bucket: '5m',
  chart: [
    { timestamp: '2026-04-22T11:00:00Z', speed_mph: 52, baseline_mph: 55 },
    { timestamp: '2026-04-22T11:05:00Z', speed_mph: 46, baseline_mph: 55 },
    { timestamp: '2026-04-22T11:10:00Z', speed_mph: 41, baseline_mph: 55 },
  ],
};

async function mockApi(page: Page) {
  await page.route('**/api/sensors', async (route) => {
    await route.fulfill({ json: mockSensors });
  });

  await page.route('**/api/sensors/*/latest', async (route) => {
    await route.fulfill({
      json: {
        place_id: 'sensor-va28-nb',
        observed_at: '2026-04-22T12:06:00Z',
        speed_mph: 43,
        volume_vph: 1440,
        occupancy_pct: 21.5,
      },
    });
  });
}

async function mockHistory(page: Page, response = historyResponse) {
  const requests: string[] = [];

  await page.route('**/api/corridors/*/history**', async (route) => {
    requests.push(route.request().url());
    await route.fulfill({ json: response });
  });

  return requests;
}

test.beforeEach(async ({ page }) => {
  await page.route('https://*.tile.openstreetmap.org/**', async (route) => {
    await route.abort();
  });
});

test('initial traffic story renders command bar, evidence, and mocked sensor grid', async ({
  page,
}) => {
  await mockApi(page);

  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'FlowOps' })).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Traffic question' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Worst slowdowns statewide' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'How is I-95 south?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Any incidents near Richmond?' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Traffic Story', exact: true })).toBeVisible();
  await expect(page.getByText('Real-time corridor awareness.')).toBeVisible();
  await expect(page.getByText('No speed data available')).toBeVisible();
  await expect(page.getByText('Latest Speed').first()).toBeVisible();
  await expect(page.getByLabel('Sensor count')).toHaveText('4 SENSORS SHOWN');
  await expect(page.getByRole('heading', { name: 'How Traffic Changed' })).toBeVisible();
  await expect(page.getByText('Showing full network in background')).toBeVisible();
  await expect(page.locator('.leaflet-container')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ask' })).toBeDisabled();
});

test('operator can submit a query and see answer, speed, anomaly, and chart update', async ({
  page,
}) => {
  await mockApi(page);
  const historyRequests = await mockHistory(page, {
    corridor: 'VA-28N',
    bucket: '5m',
    chart: [
      { timestamp: '2026-04-22T12:00:00Z', speed_mph: 49, baseline_mph: 55 },
      { timestamp: '2026-04-22T12:05:00Z', speed_mph: 45, baseline_mph: 55 },
      { timestamp: '2026-04-22T12:10:00Z', speed_mph: 43, baseline_mph: 55 },
      { timestamp: '2026-04-22T12:15:00Z', speed_mph: 42, baseline_mph: 55 },
    ],
  });

  let requestBody: unknown;
  await page.route('**/api/query', async (route) => {
    requestBody = route.request().postDataJSON();
    await route.fulfill({ json: queryResponse });
  });

  await page.goto('/');
  await page.getByRole('searchbox', { name: 'Traffic question' }).fill('How is VA-28 northbound?');
  await page.getByRole('button', { name: 'Ask' }).click();

  await expect(page.getByText('How is VA-28 northbound?')).toBeVisible();
  const story = page.getByLabel('Traffic story');
  await expect(page.getByRole('heading', { name: 'VA-28N is 13 mph slower than typical' })).toBeVisible();
  await expect(page.getByText('FlowOps focused the evidence on VA-28N')).toBeVisible();
  await expect(page.getByText('highlighted 1 affected sensor')).toBeVisible();
  await expect(story.getByText('VA-28 northbound', { exact: true })).toBeVisible();
  await expect(story.locator('strong', { hasText: 'VA-28 northbound' })).toBeVisible();
  await expect(page.getByText('**')).toHaveCount(0);
  await expect(story.getByText('Past hour')).toBeVisible();
  await expect(page.getByText('Likely Impact')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Compare to yesterday' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Show affected sensors' })).toHaveCount(0);
  await expect(page.getByText('42 mph', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Anomaly Detected')).toBeVisible();
  await expect(page.getByText('128 ms')).toHaveCount(0);
  await expect(page.locator('svg circle')).toHaveCount(4);
  await expect(page.getByText('Lowest point: 42 mph')).toBeVisible();
  await expect(page.getByText('Typical reference: 55 mph')).toBeVisible();
  await expect(page.getByLabel('Sensor count')).toHaveText('4 SENSORS SHOWN');
  await expect(page.getByLabel('Map zoom')).toHaveText('Zoom 12');
  await expect(page.getByLabel('Map center')).toHaveText('38.9200, -77.4500');
  const mapEvidence = page.getByRole('heading', { name: 'Map Evidence' }).locator('..').locator('..');
  await expect(mapEvidence.getByText('1 affected sensor')).toBeVisible();
  await expect(mapEvidence.getByText('1 likely cause nearby')).toBeVisible();
  await expect(page.getByText('Unrelated sensors muted in the background')).toBeVisible();
  expect(historyRequests.some((url) => url.includes('/api/corridors/VA-28N/history'))).toBeTruthy();
  expect(requestBody).toEqual({ message: 'How is VA-28 northbound?' });
});

test('prompt chip submits a useful statewide traffic question', async ({ page }) => {
  await mockApi(page);
  await mockHistory(page);

  let requestBody: unknown;
  await page.route('**/api/query', async (route) => {
    requestBody = route.request().postDataJSON();
    await route.fulfill({ json: queryResponse });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Worst slowdowns statewide' }).click();

  await expect(page.getByText('Asked: Worst slowdowns statewide')).toBeVisible();
  expect(requestBody).toEqual({ message: 'Worst slowdowns statewide' });
});

test('statewide slowdown query updates story, metrics, chart, and map evidence', async ({ page }) => {
  await mockApi(page);
  await mockHistory(page);

  await page.route('**/api/query', async (route) => {
    await route.fulfill({
      json: {
        ...queryResponse,
        answer: '**Statewide** slowdowns are concentrated around I-95 and VA-28.',
        chart: [
          { timestamp: '2026-04-22T12:00:00Z', speed_mph: 49, baseline_mph: 55 },
          { timestamp: '2026-04-22T12:05:00Z', speed_mph: 45, baseline_mph: 55 },
          { timestamp: '2026-04-22T12:10:00Z', speed_mph: 43, baseline_mph: 55 },
        ],
        sensors: [mockSensors[1], mockSensors[3]],
        incidents: [
          {
            id: 'incident-statewide',
            title: 'Crash on I-95',
            description: 'Left lane blocked.',
            severity: 'high',
            corridor: 'I-95S',
            starts_at: '2026-04-22T11:50:00Z',
            ends_at: null,
            location: { latitude: 38.69, longitude: -77.24 },
          },
        ],
        ui_actions: [
          { type: 'set_corridor', value: 'Statewide' },
          { type: 'set_time_range', value: 'last_1h' },
          { type: 'set_chart_mode', value: 'history' },
          { type: 'highlight_sensors', value: ['sensor-i95-sb', 'sensor-va28-sb'] },
          { type: 'highlight_incidents', value: ['incident-statewide'] },
          { type: 'focus_map', value: { latitude: 38.75, longitude: -77.34, zoom: 8 } },
        ],
      },
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Worst slowdowns statewide' }).click();

  await expect(page.getByText('Asked: Worst slowdowns statewide')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Statewide is 12 mph slower than typical' })).toBeVisible();
  await expect(page.getByText('FlowOps focused the evidence on Statewide')).toBeVisible();
  await expect(page.getByText('43 mph', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Lowest point: 43 mph')).toBeVisible();
  await expect(page.getByText('Typical reference: 55 mph')).toBeVisible();
  await expect(page.getByText('No speed data available')).toHaveCount(0);
  await expect(page.getByText('Crash on I-95')).toBeVisible();
  await expect(page.getByLabel('Map zoom')).toHaveText('Zoom 8');
  await expect(page.getByLabel('Map center')).toHaveText('38.7500, -77.3400');
  const mapEvidence = page.getByRole('heading', { name: 'Map Evidence' }).locator('..').locator('..');
  await expect(mapEvidence.getByText('2 affected sensors')).toBeVisible();
  await expect(mapEvidence.getByText('1 likely cause nearby')).toBeVisible();
  await page.screenshot({ path: 'test-results/statewide-slowdown-fixed.png', fullPage: true });
});

test('general corridor query focuses relevant sensors', async ({ page }) => {
  await mockApi(page);
  await mockHistory(page);

  await page.route('**/api/query', async (route) => {
    await route.fulfill({
      json: {
        ...queryResponse,
        answer: '**I-95 southbound** is averaging 39 mph, below the 55 mph baseline.',
        sensors: [mockSensors[1]],
        incidents: [],
        ui_actions: [
          { type: 'set_corridor', value: 'I-95S' },
          { type: 'set_time_range', value: 'last_1h' },
          { type: 'set_chart_mode', value: 'history' },
          { type: 'highlight_sensors', value: ['sensor-i95-sb'] },
          { type: 'focus_map', value: { latitude: 38.67, longitude: -77.25, zoom: 12 } },
        ],
      },
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'How is I-95 south?' }).click();

  await expect(page.getByRole('heading', { name: /I-95S is \d+ mph slower than typical/ })).toBeVisible();
  await expect(page.getByText('FlowOps focused the evidence on I-95S')).toBeVisible();
  await expect(page.getByText('I-95 southbound', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Map zoom')).toHaveText('Zoom 12');
  await expect(page.getByLabel('Map center')).toHaveText('38.6700, -77.2500');
  const mapEvidence = page.getByRole('heading', { name: 'Map Evidence' }).locator('..').locator('..');
  await expect(mapEvidence.getByText('1 affected sensor')).toBeVisible();
});

test('operator can manually change corridor to load supporting evidence', async ({
  page,
}) => {
  await mockApi(page);
  const historyRequests = await mockHistory(page);

  await page.goto('/');
  await page.getByLabel('Corridor').selectOption('VA-28');

  await expect(page.getByRole('heading', { name: 'How Traffic Changed' })).toBeVisible();
  await expect(page.getByText('VA-28 · Past hour').first()).toBeVisible();
  await expect(page.locator('svg circle')).toHaveCount(3);
  expect(historyRequests.some((url) => url.includes('/api/corridors/VA-28/history'))).toBeTruthy();
  expect(historyRequests.at(-1)).toContain('bucket=5m');
});

test('undirected I-95 query updates story, controls, chart, and full-corridor map', async ({ page }) => {
  await mockApi(page);
  const historyRequests = await mockHistory(page, {
    corridor: 'I-95',
    bucket: '5m',
    chart: [
      { timestamp: '2026-04-22T12:00:00Z', speed_mph: 51, baseline_mph: 58 },
      { timestamp: '2026-04-22T12:05:00Z', speed_mph: 47, baseline_mph: 58 },
      { timestamp: '2026-04-22T12:10:00Z', speed_mph: 44, baseline_mph: 58 },
    ],
  });

  await page.route('**/api/query', async (route) => {
    await route.fulfill({
      json: {
        ...queryResponse,
        answer: '**I-95** is slower than typical across monitored sensors.',
        chart: [
          { timestamp: '2026-04-22T12:00:00Z', speed_mph: 50, baseline_mph: 58 },
          { timestamp: '2026-04-22T12:05:00Z', speed_mph: 45, baseline_mph: 58 },
        ],
        sensors: [mockSensors[1], mockSensors[2]],
        incidents: [
          {
            id: 'incident-i95',
            title: 'Crash on I-95',
            description: 'Left lane blocked.',
            severity: 'high',
            corridor: 'I-95S',
            starts_at: '2026-04-22T11:50:00Z',
            ends_at: null,
            location: { latitude: 38.69, longitude: -77.24 },
          },
        ],
        ui_actions: [
          { type: 'set_corridor', value: 'I-95' },
          { type: 'set_time_range', value: 'last_1h' },
          { type: 'set_chart_mode', value: 'history' },
          { type: 'highlight_sensors', value: ['sensor-i95-sb', 'sensor-i95-nb'] },
          { type: 'highlight_incidents', value: ['incident-i95'] },
          { type: 'focus_map', value: { latitude: 38.69, longitude: -77.24, zoom: 12 } },
        ],
      },
    });
  });

  await page.goto('/');
  await page.getByRole('searchbox', { name: 'Traffic question' }).fill('How is I-95?');
  await page.getByRole('button', { name: 'Ask' }).click();

  await expect(page.getByText('Asked: How is I-95?')).toBeVisible();
  await expect(page.getByRole('heading', { name: /I-95 is \d+ mph slower than typical/ })).toBeVisible();
  await expect(page.getByText('FlowOps focused the evidence on I-95')).toBeVisible();
  await expect(page.getByText('I-95 · Past hour').first()).toBeVisible();
  await expect(page.getByText('Lowest point: 44 mph')).toBeVisible();
  await expect(page.getByText('Typical reference: 58 mph')).toBeVisible();
  await expect(page.getByText('Crash on I-95')).toBeVisible();
  await expect(page.getByLabel('Map zoom')).toHaveText('Zoom 12');
  await expect(page.getByLabel('Map center')).toHaveText('38.6900, -77.2400');
  const mapEvidence = page.getByRole('heading', { name: 'Map Evidence' }).locator('..').locator('..');
  await expect(mapEvidence.getByText('2 affected sensors')).toBeVisible();
  await expect(mapEvidence.getByText('1 likely cause nearby')).toBeVisible();
  expect(historyRequests.some((url) => url.includes('/api/corridors/I-95/history'))).toBeTruthy();
  expect(historyRequests.every((url) => !url.includes('/api/corridors/I-95S/history'))).toBeTruthy();
});

test('query failure shows an error and restores the form for retry', async ({ page }) => {
  await mockApi(page);
  await page.route('**/api/query', async (route) => {
    await route.fulfill({ status: 500, json: { detail: 'upstream unavailable' } });
  });

  await page.goto('/');
  await page.getByRole('searchbox', { name: 'Traffic question' }).fill('Status on I-95');
  await page.getByRole('button', { name: 'Ask' }).click();

  await expect(page.getByText('Traffic API request failed')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ask' })).toBeDisabled();
  await page.getByRole('searchbox', { name: 'Traffic question' }).fill('Retry I-95');
  await expect(page.getByRole('button', { name: 'Ask' })).toBeEnabled();
});

test('mobile viewport keeps core controls visible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);

  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'FlowOps' })).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Traffic question' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ask' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Map Evidence' })).toBeVisible();
});
