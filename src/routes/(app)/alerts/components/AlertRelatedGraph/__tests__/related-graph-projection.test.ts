import { describe, it, expect } from 'vitest';
import type { RelatedAlert } from '$lib/services/alerts.service';
import type { AlertRelationshipsFiltersValue } from '../alert-relationships-filters';
import { projectRelatedGraph } from '../related-graph-projection';

const filters: AlertRelationshipsFiltersValue = {
	openAlerts: false,
	closedAlerts: false,
	openCases: true,
	closedCases: true,
	numberOfNodes: 100,
	daysBack: 180
};

const graph: RelatedAlert = {
	nodes: [
		{ id: 'alert_1', group: 'alert', label: '[Open] Alert 1' },
		{ id: 'alert_2', group: 'alert', label: '[Closed] Alert 2' },
		{ id: 'case_1', group: 'case', label: '[Open] Case 1' },
		{ id: 'case_2', group: 'case', label: '[Closed] Case 2' },
		{ id: 'ioc_shared', group: 'ioc', label: 'shared' },
		{ id: 'asset_shared', group: 'asset', label: 'shared', image: 'asset.svg' },
		{ id: 'ioc_alert_only', group: 'ioc', label: 'alert only' },
		{ id: 'asset_alert_only', group: 'asset', label: 'alert only' },
		{ id: 'ioc_orphan', group: 'ioc', label: 'orphan' }
	],
	edges: [
		{ from: 'alert_1', to: 'ioc_shared' },
		{ from: 'alert_2', to: 'asset_shared' },
		{ from: 'ioc_shared', to: 'case_1', dashes: true },
		{ from: 'ioc_shared', to: 'case_2', dashes: true },
		{ from: 'case_1', to: 'asset_shared', dashes: true },
		{ from: 'asset_shared', to: 'case_2', dashes: true },
		{ from: 'alert_1', to: 'ioc_alert_only' },
		{ from: 'alert_2', to: 'asset_alert_only' }
	]
};

describe('projectRelatedGraph', () => {
	it('preserves the response when only open alerts are selected', () => {
		expect(projectRelatedGraph(graph, { ...filters, openAlerts: true })).toBe(graph);
	});

	it('preserves the response when only closed alerts are selected', () => {
		expect(projectRelatedGraph(graph, { ...filters, closedAlerts: true })).toBe(graph);
	});

	it('preserves the response when both alert chips are selected', () => {
		expect(projectRelatedGraph(graph, { ...filters, openAlerts: true, closedAlerts: true })).toBe(
			graph
		);
	});

	it('hides alerts but keeps returned cases and their shared connectors when neither alert chip is selected', () => {
		const original = structuredClone(graph);
		const projected = projectRelatedGraph(graph, filters);

		expect(projected.nodes).toEqual(graph.nodes.slice(2, 6));
		expect(projected.edges).toEqual(graph.edges.slice(2, 6));
		expect(graph).toEqual(original);
	});

	it('returns an empty graph when all four chips are off', () => {
		expect(
			projectRelatedGraph(graph, { ...filters, openCases: false, closedCases: false })
		).toEqual({ nodes: [], edges: [] });
	});

	it('removes connectors and edges without a displayed case neighbour', () => {
		const withoutCases = {
			nodes: graph.nodes.filter((node) => node.group !== 'case'),
			edges: graph.edges
		};

		expect(projectRelatedGraph(withoutCases, { ...filters, closedCases: false })).toEqual({
			nodes: [],
			edges: []
		});
	});
});
