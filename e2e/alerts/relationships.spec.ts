import { test, expect } from '../helpers/fixtures';
import { login } from '../helpers/auth';
import { adminApi, seed, cleanup } from '../helpers/api';

const DETAIL_PREFERENCE_KEY = 'iris.alert-relationships:detail';
const SPLIT_PREFERENCE_KEY = 'iris.alert-relationships:split';
const CASE_IDS = [4, 6];

const graphFor = (
	focalAlertId: number,
	relatedAlertIds: number[] = [20, 3],
	caseIds: number[] = CASE_IDS
) => {
	const alertNodes = [
		{ id: `alert_${focalAlertId}`, group: 'alert', label: 'Focal alert' },
		...relatedAlertIds.map((id, index) => ({
			id: `alert_${id}`,
			group: 'alert',
			label: index === 0 ? '[Closed] Zulu alert' : 'Alpha alert'
		}))
	];
	const caseNodes = caseIds.map((id, index) => ({
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
			...(alertNodes.length > 1 ? [{ from: alertNodes[1].id, to: 'asset_shared' }] : [])
		]
	};
};

const resetPreferenceOnce = async (page: import('@playwright/test').Page) => {
	await page.addInitScript(
		({ preferenceKeys }) => {
			const marker = '__e2e_relationship_preference_reset__';
			if (sessionStorage.getItem(marker)) return;
			for (const preferenceKey of preferenceKeys) sessionStorage.removeItem(preferenceKey);
			sessionStorage.setItem(marker, '1');
		},
		{ preferenceKeys: [DETAIL_PREFERENCE_KEY, SPLIT_PREFERENCE_KEY] }
	);
};

const relationshipSection = (page: import('@playwright/test').Page) =>
	page.getByRole('heading', { name: 'Relationships', exact: true }).locator('..');

const tableRowIds = async (table: import('@playwright/test').Locator) =>
	Promise.all(
		(await table.locator('tbody tr').all()).map(async (row) =>
			Number(await row.locator('td').nth(1).textContent())
		)
	);

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

const interceptDetails = async (
	page: import('@playwright/test').Page,
	alerts = detailAlerts,
	cases = detailCases
) => {
	const alertQueries: URLSearchParams[] = [];
	const caseQueries: URLSearchParams[] = [];
	await page.route(/\/api\/v2\/alerts\?/, async (route) => {
		const query = new URL(route.request().url()).searchParams;
		if (!query.has('alert_ids')) return route.continue();
		alertQueries.push(query);
		await route.fulfill({ json: paginated(alerts) });
	});
	await page.route(/\/api\/v2\/cases\?/, async (route) => {
		const query = new URL(route.request().url()).searchParams;
		if (!query.has('case_ids')) return route.continue();
		const requestedCaseIds = query
			.getAll('case_ids')
			.flatMap((value) => value.split(','))
			.map(Number)
			.sort((left, right) => left - right);
		if (requestedCaseIds.join(',') !== CASE_IDS.join(',')) return route.continue();
		caseQueries.push(query);
		await route.fulfill({ json: paginated(cases) });
	});
	return { alertQueries, caseQueries };
};

test.describe('Alerts · relationships table', () => {
	test('defaults to Graph and loads beta.4 details into a compact linked table', async ({
		page
	}) => {
		const api = await adminApi();
		const alertId = await seed.alert(api);
		try {
			await resetPreferenceOnce(page);
			await login(page);
			await page.setViewportSize({ width: 1024, height: 1000 });
			await page.route(`**/api/v2/alerts/${alertId}/related-alerts?*`, (route) =>
				route.fulfill({ json: graphFor(alertId) })
			);
			const { alertQueries, caseQueries } = await interceptDetails(page);

			await page.goto(`/alerts/${alertId}`);
			const section = relationshipSection(page);
			await expect(section.getByRole('button', { name: 'Graph', exact: true })).toHaveAttribute(
				'aria-pressed',
				'true'
			);
			await expect(section.getByRole('table')).toHaveCount(0);
			expect(alertQueries).toHaveLength(0);
			expect(caseQueries).toHaveLength(0);

			await section.getByRole('button', { name: 'Table', exact: true }).click();
			const table = section.getByRole('table');
			await expect(table.locator('a[href="/alerts/20"]')).toHaveText('Zulu enriched');
			await expect(table.getByRole('link', { name: 'Alpha enriched' })).toHaveAttribute(
				'href',
				'/alerts/3'
			);
			await expect(table.locator('a[href="/case/4"]')).toHaveText('Zulu enriched');
			await expect(table.locator('tbody tr')).toHaveCount(4);
			await expect(table.locator('tbody tr').filter({ hasText: 'Focal alert' })).toHaveCount(0);
			await expect(section.getByRole('combobox', { name: 'Rows' })).toHaveValue('25');
			await expect.poll(() => tableRowIds(table)).toEqual([3, 4, 6, 20]);
			await table.getByRole('button', { name: 'Sort Title', exact: true }).click();
			await expect.poll(() => tableRowIds(table)).toEqual([3, 6, 4, 20]);
			await table.getByRole('button', { name: 'Sort ID', exact: true }).click();
			await table.getByRole('button', { name: 'Sort ID', exact: true }).click();
			await expect.poll(() => tableRowIds(table)).toEqual([20, 6, 4, 3]);

			const linkedThrough = table
				.locator('tbody tr')
				.filter({ has: page.locator('a[href="/alerts/20"]') })
				.locator('td')
				.nth(4);
			const linkedValues = linkedThrough.locator('span[title]');
			await expect(linkedValues).toHaveCount(2);
			await expect(linkedValues.first()).toHaveCSS('display', 'block');
			await expect(linkedValues.nth(1)).toHaveCSS('display', 'block');
			expect(
				await linkedThrough
					.locator('span[title]')
					.evaluateAll((spans) => spans.map((span) => span.getAttribute('title')))
			).toEqual(['Asset: host.example', 'IOC: shared_domain.example']);

			const headers = await table.locator('thead th').allTextContents();
			expect(headers.map((header) => header.trim())).toEqual([
				'Type',
				'ID',
				'Title',
				'Status',
				'Linked through',
				'Date'
			]);
			const closedAlert = table
				.locator('tbody tr')
				.filter({ has: page.locator('a[href="/alerts/20"]') });
			await expect(closedAlert).toContainText('Closed');
			await expect(closedAlert).toContainText('Merged');
			await expect(closedAlert).toContainText('False positive');
			const scrollWrapper = table.locator('xpath=..');
			await expect
				.poll(() => scrollWrapper.evaluate((element) => element.scrollWidth <= element.clientWidth))
				.toBe(true);
			await expect
				.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
				.toBe(true);
			await page.setViewportSize({ width: 1440, height: 1000 });
			const openDate = table.locator('tbody tr').filter({ has: page.locator('a[href="/case/4"]') });
			const dateCell = openDate.locator('td').last();
			await expect(dateCell).toBeVisible();
			await expect(dateCell).not.toContainText(/\b\d{1,2}:\d{2}\b/);
			const dateHeaderText = table.locator('thead th').last().locator('span').first();
			await expect
				.poll(() =>
					dateHeaderText.evaluate((element) => element.scrollWidth <= element.clientWidth)
				)
				.toBe(true);

			expect(alertQueries).toHaveLength(1);
			expect(alertQueries[0].getAll('alert_ids')).toHaveLength(1);
			expect(
				alertQueries[0]
					.get('alert_ids')
					?.split(',')
					.map(Number)
					.sort((left, right) => left - right)
			).toEqual([3, 20]);
			expect(alertQueries[0].get('per_page')).toBe('2');
			expect(caseQueries).toHaveLength(1);
			expect(caseQueries[0].getAll('case_ids')).toHaveLength(1);
			expect(caseQueries[0].get('case_ids')).toBe('4,6');
			expect(caseQueries[0].get('per_page')).toBe('2');
		} finally {
			await cleanup.alert(api, alertId);
			await api.dispose();
		}
	});

	test('keeps Table selected through navigation, Back and reload without refetching stable cases', async ({
		page
	}) => {
		const api = await adminApi();
		let focalAlertId: number | undefined;
		let relatedAlertId: number | undefined;
		try {
			focalAlertId = await seed.alert(api, { alert_title: 'Relationships focal alert' });
			relatedAlertId = await seed.alert(api, { alert_title: 'Relationships related alert' });
			await resetPreferenceOnce(page);
			await login(page);
			await page.route(/\/api\/v2\/alerts\/(\d+)\/related-alerts\?/, (route) => {
				const currentAlertId = Number(
					route
						.request()
						.url()
						.match(/\/alerts\/(\d+)\//)?.[1]
				);
				const otherAlertId = currentAlertId === focalAlertId ? relatedAlertId : focalAlertId;
				return route.fulfill({ json: graphFor(currentAlertId, [otherAlertId!]) });
			});
			const { caseQueries } = await interceptDetails(
				page,
				[
					{ alert_id: relatedAlertId!, alert_title: 'Relationships related alert' },
					{ alert_id: focalAlertId!, alert_title: 'Relationships focal alert' }
				],
				detailCases
			);

			await page.goto(`/alerts/${focalAlertId}`);
			let section = page.getByRole('heading', { name: 'Relationships', exact: true }).locator('..');
			await section.getByRole('button', { name: 'Table', exact: true }).click();
			await expect(section.getByRole('table')).toBeVisible();
			const graphReload = page.waitForResponse(
				(response) =>
					response.url().includes('/related-alerts?') &&
					response.request().method() === 'GET' &&
					response.ok()
			);
			await section.getByRole('button', { name: 'Show open alerts', exact: true }).click();
			await graphReload;
			await expect(section.locator('tbody tr')).toHaveCount(3);
			await expect(section.getByText('Loading relationship details...')).toHaveCount(0);
			await expect(section.getByRole('table')).toBeVisible();
			expect(caseQueries).toHaveLength(1);
			expect(caseQueries[0].getAll('case_ids')).toHaveLength(1);
			expect(caseQueries[0].get('case_ids')).toBe('4,6');

			await section.getByRole('link', { name: 'Relationships related alert' }).click();
			await expect(page).toHaveURL(new RegExp(`/alerts/${relatedAlertId}$`));
			section = page.getByRole('heading', { name: 'Relationships', exact: true }).locator('..');
			await expect(section.getByRole('button', { name: 'Table', exact: true })).toHaveAttribute(
				'aria-pressed',
				'true'
			);
			await page.goBack();
			await expect(page).toHaveURL(new RegExp(`/alerts/${focalAlertId}$`));
			section = page.getByRole('heading', { name: 'Relationships', exact: true }).locator('..');
			await expect(section.getByRole('button', { name: 'Table', exact: true })).toHaveAttribute(
				'aria-pressed',
				'true'
			);
			await page.reload();
			section = page.getByRole('heading', { name: 'Relationships', exact: true }).locator('..');
			await expect(section.getByRole('button', { name: 'Table', exact: true })).toHaveAttribute(
				'aria-pressed',
				'true'
			);
		} finally {
			if (relatedAlertId !== undefined) await cleanup.alert(api, relatedAlertId);
			if (focalAlertId !== undefined) await cleanup.alert(api, focalAlertId);
			await api.dispose();
		}
	});

	test('keeps detail and split preferences independent and fits the split pane', async ({
		page
	}) => {
		const api = await adminApi();
		const title = `Relationships placement ${Math.random().toString(36).slice(2, 8)}`;
		const alertId = await seed.alert(api, { alert_title: title });
		try {
			await resetPreferenceOnce(page);
			await login(page);
			await page.setViewportSize({ width: 1024, height: 1000 });
			await page.route(/\/api\/v2\/alerts\/(\d+)\/related-alerts\?/, (route) => {
				const currentAlertId = Number(
					route
						.request()
						.url()
						.match(/\/alerts\/(\d+)\//)?.[1]
				);
				return route.fulfill({ json: graphFor(currentAlertId) });
			});
			await interceptDetails(page);

			await page.goto(`/alerts/${alertId}`);
			let section = relationshipSection(page);
			await section.getByRole('button', { name: 'Table', exact: true }).click();
			let table = section.getByRole('table');
			await expect(table).toBeVisible();
			await table.getByRole('button', { name: 'Sort ID', exact: true }).click();
			expect(
				await page.evaluate(
					(key) => JSON.parse(sessionStorage.getItem(key) ?? 'null'),
					DETAIL_PREFERENCE_KEY
				)
			).toEqual({ view: 'table', sort: { id: 'id', dir: 'asc' } });
			await page.reload();
			section = relationshipSection(page);
			await expect(section.getByRole('button', { name: 'Table', exact: true })).toHaveAttribute(
				'aria-pressed',
				'true'
			);
			table = section.getByRole('table');
			await expect(table.getByRole('button', { name: 'Sort ID', exact: true })).toBeVisible();
			await expect(table.locator('tbody tr')).toHaveCount(4);
			await expect.poll(() => tableRowIds(table)).toEqual([3, 4, 6, 20]);
			expect(
				await page.evaluate(
					(key) => JSON.parse(sessionStorage.getItem(key) ?? 'null'),
					DETAIL_PREFERENCE_KEY
				)
			).toEqual({ view: 'table', sort: { id: 'id', dir: 'asc' } });

			await page.setViewportSize({ width: 1120, height: 1000 });
			await page.goto(`/alerts?query=${encodeURIComponent(title)}`);
			const queuedAlert = page.getByText(title, { exact: true }).first();
			await expect(queuedAlert).toBeVisible({ timeout: 15_000 });
			await queuedAlert.click();
			const detailTabs = page.getByRole('tablist', { name: 'Alert detail sections' });
			await detailTabs.getByRole('tab', { name: /^Graph/ }).click();
			let pane = page.locator('.graph-pane');
			await expect(pane).toBeVisible();
			let viewControls = pane.getByRole('group', { name: 'Relationships view' });
			await expect(
				viewControls.getByRole('button', { name: 'Graph', exact: true })
			).toHaveAttribute('aria-pressed', 'true');
			await viewControls.getByRole('button', { name: 'Table', exact: true }).click();
			table = pane.getByRole('table');
			await expect(table).toBeVisible();
			const paneWidth = await pane.evaluate((element) => element.getBoundingClientRect().width);
			expect(paneWidth).toBeLessThanOrEqual(560);
			for (const hiddenColumn of ['Type', 'Date']) {
				await expect(table.locator('thead th').filter({ hasText: hiddenColumn })).toBeHidden();
			}
			for (const visibleColumn of ['ID', 'Title', 'Status', 'Linked through']) {
				await expect(
					table.getByRole('columnheader', { name: new RegExp(visibleColumn) })
				).toBeVisible();
			}
			const scrollWrapper = table.locator('xpath=..');
			await expect
				.poll(() => scrollWrapper.evaluate((element) => element.scrollWidth <= element.clientWidth))
				.toBe(true);
			await table.getByRole('button', { name: 'Sort Title', exact: true }).click();
			await expect.poll(() => tableRowIds(table)).toEqual([3, 6, 4, 20]);
			expect(
				await page.evaluate(
					(key) => JSON.parse(sessionStorage.getItem(key) ?? 'null'),
					SPLIT_PREFERENCE_KEY
				)
			).toEqual({ view: 'table', sort: { id: 'title', dir: 'asc' } });
			expect(
				await page.evaluate(
					(key) => JSON.parse(sessionStorage.getItem(key) ?? 'null'),
					DETAIL_PREFERENCE_KEY
				)
			).toEqual({ view: 'table', sort: { id: 'id', dir: 'asc' } });

			await page.reload();
			await page
				.getByRole('tablist', { name: 'Alert detail sections' })
				.getByRole('tab', { name: /^Graph/ })
				.click();
			pane = page.locator('.graph-pane');
			viewControls = pane.getByRole('group', { name: 'Relationships view' });
			await expect(
				viewControls.getByRole('button', { name: 'Table', exact: true })
			).toHaveAttribute('aria-pressed', 'true');
			table = pane.getByRole('table');
			await expect.poll(() => tableRowIds(table)).toEqual([3, 6, 4, 20]);
			expect(
				await page.evaluate(
					(key) => JSON.parse(sessionStorage.getItem(key) ?? 'null'),
					SPLIT_PREFERENCE_KEY
				)
			).toEqual({ view: 'table', sort: { id: 'title', dir: 'asc' } });
		} finally {
			await cleanup.alert(api, alertId);
			await api.dispose();
		}
	});

	test('uses graph fallbacks after lookup failure and supports case-only and all-off filters', async ({
		page
	}) => {
		const api = await adminApi();
		const alertId = await seed.alert(api);
		try {
			await resetPreferenceOnce(page);
			await login(page);
			await page.route(`**/api/v2/alerts/${alertId}/related-alerts?*`, (route) =>
				route.fulfill({ json: graphFor(alertId) })
			);
			await page.route(/\/api\/v2\/(alerts|cases)\?/, (route) => {
				const query = new URL(route.request().url()).searchParams;
				return query.has('alert_ids') || query.has('case_ids')
					? route.fulfill({ status: 503, json: { message: 'Unavailable' } })
					: route.continue();
			});

			await page.goto(`/alerts/${alertId}`);
			const section = page
				.getByRole('heading', { name: 'Relationships', exact: true })
				.locator('..');
			await section.getByRole('button', { name: 'Table', exact: true }).click();
			await expect(
				section.getByText('Some details could not be loaded.', { exact: false })
			).toBeVisible();
			await expect(section.getByRole('link', { name: 'Zulu alert' })).toBeVisible();
			await section.getByRole('button', { name: 'Show open alerts', exact: true }).click();
			await section.getByRole('button', { name: 'Show closed alerts', exact: true }).click();
			await expect(section.locator('tbody tr')).toHaveCount(2);
			await expect(section.getByRole('link', { name: 'Case #4' })).toBeVisible();
			await expect(
				section.getByRole('cell', { name: 'IOC: shared_domain.example', exact: true })
			).toHaveCount(2);
			await section.getByRole('button', { name: 'Show open cases', exact: true }).click();
			await section.getByRole('button', { name: 'Show closed cases', exact: true }).click();
			await expect(
				section.getByText('No related alerts or cases found.', { exact: true })
			).toBeVisible();
			await expect(section.getByRole('table')).toHaveCount(0);
		} finally {
			await cleanup.alert(api, alertId);
			await api.dispose();
		}
	});
});
