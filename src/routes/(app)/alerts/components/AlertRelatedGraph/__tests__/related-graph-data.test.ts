import { describe, expect, it } from 'vitest';
import type { RelatedAlert } from '$lib/services/alerts.service';
import {
	createRelatedGraphRequests,
	currentRelatedGraph,
	relatedAlertClosed,
	relatedGraphNativeLabel
} from '../related-graph-data';

const data: RelatedAlert = {
	nodes: [
		{ id: 'ioc_10', group: 'ioc', label: 'Indicator 10' },
		{ id: 'case_1', group: 'case', label: 'Case title' }
	],
	edges: [{ from: 'ioc_10', to: 'case_1' }]
};
const focal = { id: 10, title: 'Alert 10', closed: false };

describe('relationships graph data', () => {
	it('keeps native labels in Force and suppresses them only for computed layouts', () => {
		const graph = currentRelatedGraph({ alertId: 10, data }, focal, true);
		expect(graph.nodes.map((node) => relatedGraphNativeLabel(node, 'force'))).toEqual([
			'Indicator 10',
			'Case title',
			'Alert 10'
		]);
		for (const layout of ['rings', 'hub-and-spoke'] as const) {
			expect(graph.nodes.map((node) => relatedGraphNativeLabel(node, layout))).toEqual([
				'',
				'',
				''
			]);
		}
	});

	it('returns primitive closed values that compare equally across unrelated status updates', () => {
		const open = { status_id: 1, status_name: 'Open', status_description: '' };
		expect(relatedAlertClosed({ ...open })).toBe(relatedAlertClosed(open));
		expect(relatedAlertClosed({ ...open, status_name: 'In progress' })).toBe(
			relatedAlertClosed(open)
		);
		for (const status_name of ['Closed', 'Merged', 'Escalated']) {
			expect(relatedAlertClosed({ ...open, status_name })).toBe(true);
		}
		expect(relatedAlertClosed(undefined)).toBe(false);
	});

	it('does not inject a new focal alert into data loaded for a previous alert', () => {
		const loaded = { alertId: 10, data };
		expect(currentRelatedGraph(loaded, { ...focal, id: 20 }, true)).toEqual({
			nodes: [],
			edges: []
		});
		expect(currentRelatedGraph(null, focal, true)).toEqual({ nodes: [], edges: [] });
		expect(currentRelatedGraph(loaded, focal, true).edges).toEqual([
			...data.edges,
			{ from: 'alert_10', to: 'ioc_10', dashes: true }
		]);
	});

	it('drops out-of-order responses, including older failures for the same alert', () => {
		const requests = createRelatedGraphRequests();
		const older = requests.begin();
		const newer = requests.begin();
		expect(requests.isCurrent(newer, 20, 20)).toBe(true);
		expect(requests.isCurrent(older, 10, 20)).toBe(false);
		expect(requests.isCurrent(older, 20, 20)).toBe(false);
	});

	it('rejects a response immediately after an alert switch or request invalidation', () => {
		const requests = createRelatedGraphRequests();
		const token = requests.begin();
		expect(requests.isCurrent(token, 10, 20)).toBe(false);
		expect(requests.isCurrent(token, 10, 10)).toBe(true);
		requests.invalidate();
		expect(requests.isCurrent(token, 10, 10)).toBe(false);
		expect(requests.isCurrent(requests.begin(), 10, 10)).toBe(true);
	});
});
