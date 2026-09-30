import { test, expect } from '../helpers/fixtures';
import { login } from '../helpers/auth';
import { adminApi, seed, cleanup } from '../helpers/api';

const graphFor = (focalAlertId: number) => {
	const alertNodes = [
		{ id: `alert_${focalAlertId}`, group: 'alert', label: 'Focal alert' },
		...[20, 3].map((id, index) => ({
			id: `alert_${id}`,
			group: 'alert',
			label: index === 0 ? '[Closed] Zulu alert' : 'Alpha alert'
		}))
	];
	const caseNodes = [4, 6].map((id, index) => ({
		id: `case_${id}`,
		group: 'case',
		label: index === 0 ? `Case #${id}` : `[Closed] Case #${id}`
	}));

	return {
		nodes: [
			...alertNodes,
			...caseNodes,
			{ id: 'ioc_shared', group: 'ioc', label: 'shared_domain.example' },
			{ id: 'asset_shared', group: 'asset', label: 'host.example' }
		],
		edges: [
			...alertNodes.map((node) => ({ from: node.id, to: 'ioc_shared' })),
			...caseNodes.map((node) => ({ from: 'ioc_shared', to: node.id })),
			{ from: alertNodes[1].id, to: 'asset_shared' }
		]
	};
};

const paginated = <T>(data: T[]) => ({
	total: data.length,
	data,
	current_page: 1,
	last_page: 1,
	next_page: null
});

const detailAlerts = [
	{
		alert_id: 20,
		alert_title: 'Zulu enriched',
		status: { status_name: 'Merged' },
		resolution_status: { resolution_status_name: 'False positive' },
		alert_source_event_time: '2024-01-02T00:00:00Z'
	},
	{
		alert_id: 3,
		alert_title: 'Alpha enriched',
		status: { status_name: 'New' },
		resolution_status: null,
		alert_source_event_time: '2024-01-03T00:00:00Z'
	}
];

const detailCases = [
	{
		case_id: 4,
		case_name: '#4 - Zulu enriched',
		open_date: '2024-01-03',
		close_date: null
	},
	{
		case_id: 6,
		case_name: 'Closed case enriched',
		open_date: '2024-01-03',
		close_date: '2024-01-04T10:00:00Z'
	}
];

const relationshipSection = (page: import('@playwright/test').Page) =>
	page.getByRole('heading', { name: 'Relationships', exact: true }).locator('..');

const interceptDetails = async (page: import('@playwright/test').Page, fail = false) => {
	await page.route(/\/api\/v2\/(alerts|cases)\?/, (route) => {
		const url = new URL(route.request().url());
		if (!url.searchParams.has('alert_ids') && !url.searchParams.has('case_ids')) {
			return route.continue();
		}
		return fail
			? route.fulfill({ status: 503, json: { message: 'Unavailable' } })
			: route.fulfill({
					json: url.pathname.endsWith('/alerts') ? paginated(detailAlerts) : paginated(detailCases)
				});
	});
};

test.describe('Alerts · relationships table', () => {
	test('switches views, shows enriched linked rows and lays out Graph afresh', async ({ page }) => {
		const api = await adminApi();
		const alertId = await seed.alert(api);
		try {
			await login(page);
			await page.route(`**/api/v2/alerts/${alertId}/related-alerts?*`, (route) =>
				route.fulfill({ json: graphFor(alertId) })
			);
			await interceptDetails(page);
			await page.addInitScript(() => {
				const fillText = CanvasRenderingContext2D.prototype.fillText;
				CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
					const canvas = this.canvas as HTMLCanvasElement & {
						layoutPositions?: Record<string, string>;
					};
					const transform = this.getTransform();
					(canvas.layoutPositions ??= {})[text] =
						`${Math.round(transform.e + x)},${Math.round(transform.f + y)}`;
					if (maxWidth === undefined) fillText.call(this, text, x, y);
					else fillText.call(this, text, x, y, maxWidth);
				};
			});
			await page.goto(`/alerts/${alertId}`);
			const section = relationshipSection(page);
			await expect(section.locator('canvas')).toBeVisible();
			await section.getByRole('button', { name: 'Table', exact: true }).click();
			await expect(section.locator('canvas')).toHaveCount(0);
			const table = section.getByRole('table');
			await expect(table.locator('tbody tr')).toHaveCount(4);
			const alertRow = table
				.locator('tbody tr')
				.filter({ has: page.locator('a[href="/alerts/20"]') });
			await expect(alertRow.getByRole('link')).toHaveText('Zulu enriched');
			await expect(alertRow).toContainText('Merged');
			await expect(alertRow).toContainText('False positive');
			await expect(alertRow).toContainText('Asset: host.example');
			await expect(alertRow).toContainText('IOC: shared_domain.example');
			const caseRow = table.locator('tbody tr').filter({ has: page.locator('a[href="/case/4"]') });
			await expect(caseRow.getByRole('link')).toHaveText('#4 - Zulu enriched');
			await expect(caseRow).toContainText('IOC: shared_domain.example');
			await section.getByRole('button', { name: 'Graph', exact: true }).click();
			await expect(table).toHaveCount(0);
			await expect(section.locator('canvas')).toBeVisible();
			// A remounted canvas must render the displayed nodes at distinct laid-out positions.
			await expect
				.poll(() =>
					section.locator('canvas').evaluate((canvas) => {
						const positions = (
							canvas as HTMLCanvasElement & { layoutPositions?: Record<string, string> }
						).layoutPositions;
						return new Set(Object.values(positions ?? {})).size;
					})
				)
				.toBeGreaterThan(3);
		} finally {
			await cleanup.alert(api, alertId);
			await api.dispose();
		}
	});

	test('fits the table and keeps pagination reachable in a narrow split pane', async ({ page }) => {
		const api = await adminApi();
		const title = `Relationships split ${Math.random().toString(36).slice(2, 8)}`;
		const alertId = await seed.alert(api, { alert_title: title });
		try {
			await login(page);
			await page.setViewportSize({ width: 1120, height: 1000 });
			await page.route(`**/api/v2/alerts/${alertId}/related-alerts?*`, (route) =>
				route.fulfill({ json: graphFor(alertId) })
			);
			await interceptDetails(page);
			await page.goto(`/alerts?query=${encodeURIComponent(title)}`);
			await page.getByText(title, { exact: true }).first().click();
			await page
				.getByRole('tablist', { name: 'Alert detail sections' })
				.getByRole('tab', { name: /^Graph/ })
				.click();
			const pane = page.locator('.graph-pane');
			await pane.getByRole('button', { name: 'Table', exact: true }).click();
			const table = pane.getByRole('table');
			await expect(table.locator('tbody tr')).toHaveCount(4);
			expect(
				await pane.evaluate((element) => element.getBoundingClientRect().width)
			).toBeLessThanOrEqual(560);
			await expect(table.getByRole('columnheader', { name: /Linked through/ })).toBeVisible();
			await expect
				.poll(() =>
					table
						.locator('xpath=..')
						.evaluate((element) => element.scrollWidth <= element.clientWidth)
				)
				.toBe(true);
			await pane.evaluate((element) => {
				(element as HTMLElement).style.height = '220px';
				(element as HTMLElement).style.flex = 'none';
			});
			const pagination = pane.getByRole('combobox', { name: 'Rows' });
			await pagination.scrollIntoViewIfNeeded();
			const paginationBox = await pagination.boundingBox();
			const paneBox = await pane.boundingBox();
			expect(paginationBox!.y + paginationBox!.height).toBeLessThanOrEqual(
				paneBox!.y + paneBox!.height
			);
		} finally {
			await cleanup.alert(api, alertId);
			await api.dispose();
		}
	});

	test('falls back to graph labels when enrichment lookups fail', async ({ page }) => {
		const api = await adminApi();
		const alertId = await seed.alert(api);
		try {
			await login(page);
			await page.route(`**/api/v2/alerts/${alertId}/related-alerts?*`, (route) =>
				route.fulfill({ json: graphFor(alertId) })
			);
			await interceptDetails(page, true);
			await page.goto(`/alerts/${alertId}`);
			const section = relationshipSection(page);
			await section.getByRole('button', { name: 'Table', exact: true }).click();
			await expect(
				section.getByText('Some details could not be loaded.', { exact: false })
			).toBeVisible();
			await expect(section.getByRole('link', { name: 'Zulu alert' })).toHaveAttribute(
				'href',
				'/alerts/20'
			);
			await expect(section.getByRole('link', { name: 'Case #4', exact: true })).toHaveAttribute(
				'href',
				'/case/4'
			);
		} finally {
			await cleanup.alert(api, alertId);
			await api.dispose();
		}
	});
});
