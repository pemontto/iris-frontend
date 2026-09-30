import { describe, it, expect } from 'vitest';
import type { RelatedAlert } from '$lib/services/alerts.service';
import type { Alert } from '$lib/types/resources/alert';
import type { Case } from '$lib/types/resources/case';
import {
	relatedGraphToRows,
	sortRelatedEntityRows,
	type RelatedEntityRow
} from '../related-graph-rows';
import { projectRelatedGraph } from '../related-graph-projection';

const graph: RelatedAlert = {
	nodes: [
		{ id: 'alert_10', group: 'alert', label: '[Closed][False positive]\n Alert title' },
		{ id: 'alert_2', group: 'alert', label: 'Open alert' },
		{ id: 'case_10', group: 'case', label: 'Case #10' },
		{ id: 'case_3', group: 'case', label: '[Closed] Case #3' },
		{ id: 'ioc_domain', group: 'ioc', label: 'evil_domain.example' },
		{ id: 'asset_host', group: 'asset', label: 'host_one' },
		{ id: 'ioc_orphan', group: 'ioc', label: 'unlinked' }
	],
	edges: [
		{ from: 'alert_10', to: 'ioc_domain' },
		{ from: 'asset_host', to: 'alert_10' },
		{ from: 'ioc_domain', to: 'case_10' },
		{ from: 'case_3', to: 'asset_host' }
	]
};

describe('relatedGraphToRows', () => {
	it('strips only the matching case ID prefix without changing alerts or source titles', () => {
		const cases = [
			{ case_id: 10, case_name: '#10 - Case title', close_date: null },
			{ case_id: 3, case_name: '#30 - Keep this prefix', close_date: null }
		] as Case[];
		const rows = relatedGraphToRows(
			graph,
			[{ alert_id: 10, alert_title: '#10 - Alert title' }] as Alert[],
			cases
		);
		expect(rows.find((row) => row.href === '/case/10')?.title).toBe('Case title');
		expect(rows.find((row) => row.href === '/case/3')?.title).toBe('#30 - Keep this prefix');
		expect(rows.find((row) => row.href === '/alerts/10')?.title).toBe('#10 - Alert title');
		expect(cases[0].case_name).toBe('#10 - Case title');
	});

	it('defaults to open first, newest first, then numeric ID regardless of API order', () => {
		const rows: RelatedEntityRow[] = relatedGraphToRows(graph).map((row) => ({
			...row,
			date: row.status === 'Open' ? '2026-09-28' : '2026-09-30'
		}));
		rows.push({ ...rows[1], id: 1, href: '/alerts/1', date: '2026-09-29' });
		rows.push({ ...rows[1], id: 4, href: '/alerts/4', date: null });
		rows.push({ ...rows[1], id: 5, href: '/alerts/5', date: 'invalid' });
		const expected = [
			'/alerts/1',
			'/alerts/2',
			'/case/10',
			'/alerts/4',
			'/alerts/5',
			'/case/3',
			'/alerts/10'
		];
		expect(sortRelatedEntityRows(rows).map((row) => row.href)).toEqual(expected);
		expect(sortRelatedEntityRows([...rows].reverse()).map((row) => row.href)).toEqual(expected);
		expect(rows[0].id).toBe(10);
	});

	it('retains the shared table numeric ID and title comparison for an explicit sort', () => {
		const rows = relatedGraphToRows(graph);
		expect(sortRelatedEntityRows(rows, { id: 'id', dir: 'asc' }).map((row) => row.id)).toEqual([
			2, 3, 10, 10
		]);
		expect(
			sortRelatedEntityRows(rows, { id: 'title', dir: 'desc' }).map((row) => row.title)
		).toEqual(rows.map((row) => row.title).sort((a, b) => b.localeCompare(a)));
	});

	it('excludes only the focal alert, preserving a case with the same numeric ID and shared links', () => {
		const rows = relatedGraphToRows(graph, [], [], 10);
		expect(rows.map((row) => row.href)).toEqual(['/alerts/2', '/case/10', '/case/3']);
		expect(rows[1].linkedThrough).toBe('IOC: evil_domain.example');
	});

	it('maps alerts and cases to separate rows with routes and graph status fallbacks', () => {
		expect(relatedGraphToRows(graph)).toEqual([
			{
				type: 'Alert',
				id: 10,
				href: '/alerts/10',
				title: 'Alert title',
				status: 'Closed',
				resolution: 'False positive',
				customer: null,
				linkedThrough: 'Asset: host_one; IOC: evil_domain.example',
				linkedThroughValues: ['Asset: host_one', 'IOC: evil_domain.example'],
				date: null
			},
			{
				type: 'Alert',
				id: 2,
				href: '/alerts/2',
				title: 'Open alert',
				status: 'Open',
				resolution: null,
				customer: null,
				linkedThrough: '',
				linkedThroughValues: [],
				date: null
			},
			{
				type: 'Case',
				id: 10,
				href: '/case/10',
				title: 'Case #10',
				status: 'Open',
				resolution: null,
				customer: null,
				linkedThrough: 'IOC: evil_domain.example',
				linkedThroughValues: ['IOC: evil_domain.example'],
				date: null
			},
			{
				type: 'Case',
				id: 3,
				href: '/case/3',
				title: 'Case #3',
				status: 'Closed',
				resolution: null,
				customer: null,
				linkedThrough: 'Asset: host_one',
				linkedThroughValues: ['Asset: host_one'],
				date: null
			}
		]);
	});

	it('deduplicates entities and connector values and ignores dangling edges without mutating the graph', () => {
		const duplicateGraph = {
			nodes: [...graph.nodes, graph.nodes[0]],
			edges: [...graph.edges, graph.edges[0], { from: 'alert_10', to: 'missing' }]
		};
		const original = structuredClone(duplicateGraph);
		expect(relatedGraphToRows(duplicateGraph)).toEqual(relatedGraphToRows(graph));
		expect(duplicateGraph).toEqual(original);
	});

	it('preserves each complete linked value for multi-link cells, including semicolons', () => {
		const linkedGraph = {
			...graph,
			nodes: graph.nodes.map((node) =>
				node.id === 'ioc_domain'
					? { ...node, label: 'https://example.test/path; parameter=value' }
					: node
			)
		};
		expect(relatedGraphToRows(linkedGraph)[0].linkedThroughValues).toEqual([
			'Asset: host_one',
			'IOC: https://example.test/path; parameter=value'
		]);
	});

	it('returns no rows for an empty graph or connectors alone', () => {
		expect(relatedGraphToRows({ nodes: [], edges: [] })).toEqual([]);
		expect(relatedGraphToRows({ nodes: graph.nodes.slice(4), edges: [] })).toEqual([]);
	});

	it('uses the chip projection for case-only and all-off views', () => {
		const filters = {
			openAlerts: false,
			closedAlerts: false,
			openCases: true,
			closedCases: true,
			numberOfNodes: 100,
			daysBack: 180
		};
		const rows = relatedGraphToRows(projectRelatedGraph(graph, filters));
		expect(rows).toEqual(relatedGraphToRows(graph).slice(2));
		expect(
			relatedGraphToRows(
				projectRelatedGraph(graph, {
					...filters,
					openCases: false,
					closedCases: false
				})
			)
		).toEqual([]);
	});

	it('enriches only displayed entities and retains graph data for missing details', () => {
		const alerts = [
			{
				alert_id: 10,
				alert_title: 'Exact alert title',
				status: { status_name: 'Merged' },
				resolution_status: { resolution_status_name: 'True positive' },
				customer: { customer_name: 'Customer A' },
				alert_source_event_time: '2026-09-01T12:00:00Z'
			},
			{ alert_id: 999, alert_title: 'Not in graph' }
		] as Alert[];
		const cases = [
			{
				case_id: 10,
				case_name: 'Exact case title',
				close_date: null,
				case_customer: { customer_name: 'Customer A' },
				open_date: '2026-09-02T12:00:00Z'
			}
		] as Case[];
		const rows = relatedGraphToRows(graph, alerts, cases);
		expect(rows).toHaveLength(4);
		expect(rows[0]).toMatchObject({
			title: 'Exact alert title',
			status: 'Closed (Merged)',
			resolution: 'True positive',
			customer: 'Customer A',
			date: '2026-09-01T12:00:00Z'
		});
		expect(rows[2]).toMatchObject({
			title: 'Exact case title',
			status: 'Open',
			customer: 'Customer A',
			date: '2026-09-02T12:00:00Z'
		});
		expect(rows[1]).toEqual(relatedGraphToRows(graph)[1]);
		expect(rows[3]).toEqual(relatedGraphToRows(graph)[3]);
	});
});
