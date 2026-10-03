import { describe, expect, it, vi } from 'vitest';
import type { RelatedAlert } from '$lib/services/alerts.service';
import {
	isFocalRelatedAlert,
	forceRelatedGraph,
	layoutRelatedGraph,
	relatedIndicatorLinks,
	withFocalRelatedAlert,
	relatedGraphLabelLines
} from '../related-graph-layout';

const graph: RelatedAlert = {
	nodes: [
		{ id: 'alert_10', group: 'alert', label: '[Closed] Focal' },
		{ id: 'alert_100', group: 'alert', label: 'Other alert' },
		{ id: 'case_10', group: 'case', label: 'Case #10' },
		{ id: 'ioc_value_with_underscores', group: 'ioc', label: 'value_with_underscores' },
		{ id: 'asset_host', group: 'asset', label: 'host' }
	],
	edges: [
		{ from: 'alert_10', to: 'ioc_value_with_underscores', dashes: true },
		{ from: 'alert_10', to: 'asset_host' },
		{ from: 'alert_100', to: 'ioc_value_with_underscores', dashes: true },
		{ from: 'ioc_value_with_underscores', to: 'case_10', dashes: true },
		{ from: 'asset_host', to: 'case_10', dashes: true }
	]
};

describe('relationships graph layout', () => {
	it('detects the focal alert by exact group and ID, independently of label or node order', () => {
		expect(graph.nodes.map((node) => isFocalRelatedAlert(node, 10))).toEqual([
			true,
			false,
			false,
			false,
			false
		]);
		expect(isFocalRelatedAlert({ id: 'alert_10_suffix', group: 'alert', label: 'Focal' }, 10)).toBe(
			false
		);
		expect(isFocalRelatedAlert({ id: 'alert_10', group: 'case', label: 'Focal' }, 10)).toBe(false);
	});

	it('pins only the Force-mode focal alert and preserves native peer options and edge widths', () => {
		const native = {
			nodes: graph.nodes.map((node, index) =>
				index === 1
					? { ...node, x: 12, y: 24, fixed: false, physics: true, font: '18px serif' }
					: node
			),
			edges: graph.edges.map((edge, index) => (index === 2 ? { ...edge, width: 3 } : edge))
		};
		const originalNative = structuredClone(native);
		const original = structuredClone(graph);
		const result = forceRelatedGraph(graph, 10);
		expect(result.nodes[0]).toEqual({ ...graph.nodes[0], x: 0, y: 0, fixed: true });
		expect(result.nodes[0]).not.toHaveProperty('physics');
		expect(result.nodes.slice(1)).toEqual(graph.nodes.slice(1));
		expect(result.edges).toBe(graph.edges);
		const nativeResult = forceRelatedGraph(native, 10);
		nativeResult.nodes.slice(1).forEach((node, index) => {
			expect(node).toBe(native.nodes[index + 1]);
		});
		expect(nativeResult.edges).toBe(native.edges);
		expect(native).toEqual(originalNative);
		expect(graph).toEqual(original);
	});

	it('pins an injected Force-mode focal alert and leaves the centre empty only when explicitly hidden', () => {
		const missing = { nodes: graph.nodes.slice(1), edges: graph.edges.slice(2) };
		const focal = { id: 10, title: 'Page title', closed: false };
		const visible = forceRelatedGraph(withFocalRelatedAlert(missing, focal, true), 10);
		expect(visible.nodes.find((node) => node.id === 'alert_10')).toMatchObject({
			x: 0,
			y: 0,
			fixed: true
		});
		expect(visible.nodes.find((node) => node.id === 'alert_10')).not.toHaveProperty('physics');
		const hidden = forceRelatedGraph(withFocalRelatedAlert(missing, focal, false), 10);
		expect(hidden.nodes).toEqual(missing.nodes);
	});

	it('adds a missing focal alert from page data and connects every returned indicator', () => {
		const missing = { nodes: graph.nodes.slice(1), edges: graph.edges.slice(2) };
		const original = structuredClone(missing);
		const result = withFocalRelatedAlert(
			missing,
			{ id: 10, title: 'Page title', closed: false },
			true
		);
		expect(result.nodes.find((node) => node.id === 'alert_10')).toEqual({
			id: 'alert_10',
			group: 'alert',
			label: 'Page title'
		});
		expect(result.edges.slice(-2)).toEqual([
			{ from: 'alert_10', to: 'ioc_value_with_underscores', dashes: true },
			{ from: 'alert_10', to: 'asset_host' }
		]);
		expect(missing).toEqual(original);
	});

	it('preserves an existing focal node and completes its connections without duplicate edges', () => {
		const partial = {
			...graph,
			edges: graph.edges.filter((edge) => edge.to !== 'asset_host' || edge.from !== 'alert_10')
		};
		const result = withFocalRelatedAlert(
			partial,
			{ id: 10, title: 'Page title', closed: true },
			true
		);
		expect(result.nodes.filter((node) => isFocalRelatedAlert(node, 10))).toEqual([graph.nodes[0]]);
		expect(result.edges).toHaveLength(graph.edges.length);
		expect(
			withFocalRelatedAlert(result, { id: 10, title: 'Page title', closed: true }, true)
		).toEqual(result);
	});

	it('respects a filter that genuinely hides the focal alert and removes only its edges', () => {
		const result = withFocalRelatedAlert(
			graph,
			{ id: 10, title: 'Page title', closed: true },
			false
		);
		expect(result.nodes).toEqual(graph.nodes.slice(1));
		expect(result.edges).toEqual(graph.edges.slice(2));
		expect(
			withFocalRelatedAlert(result, { id: 10, title: 'Page title', closed: true }, false)
		).toEqual(result);
	});

	it('pins the focal alert and fans exclusive items on the far side of their own hub', () => {
		const { nodes } = layoutRelatedGraph(graph, 10, 1);
		expect(nodes[0]).toMatchObject({ x: 0, y: 0, fixed: true, physics: false });
		const hub = nodes.find((node) => node.group === 'ioc')!;
		const leaf = nodes.find((node) => node.id === 'alert_100')!;
		expect((leaf.x - hub.x) * hub.x + (leaf.y - hub.y) * hub.y).toBeGreaterThan(0);
		expect(Math.hypot(leaf.x - hub.x, leaf.y - hub.y)).toBeCloseTo(100);
		expect(nodes.slice(1).every((node) => !node.fixed && !node.physics)).toBe(true);
	});

	it('uses several fan arcs for a crowded 186-node graph with space between node centres', () => {
		const crowded: RelatedAlert = {
			nodes: [
				graph.nodes[0],
				...graph.nodes.slice(3),
				...Array.from({ length: 183 }, (_, index) => ({
					id: `case_${index + 20}`,
					group: 'case',
					label: `Case #${index + 20}`
				}))
			],
			edges: Array.from({ length: 183 }, (_, index) => ({
				from: 'asset_host',
				to: `case_${index + 20}`
			}))
		};
		const { nodes } = layoutRelatedGraph(crowded, 10, 1);
		const hub = nodes.find((node) => node.id === 'asset_host')!;
		const leaves = nodes.filter((node) => node.group === 'case');
		expect(
			new Set(leaves.map((node) => Math.round(Math.hypot(node.x - hub.x, node.y - hub.y)))).size
		).toBeGreaterThan(1);
		for (let i = 0; i < nodes.length; i++) {
			for (const other of nodes.slice(i + 1)) {
				expect(Math.hypot(nodes[i].x - other.x, nodes[i].y - other.y)).toBeGreaterThanOrEqual(
					69.99
				);
			}
		}
	});

	it('places shared items between their hubs and closer to the centre with distinct central slots', () => {
		const sharedGraph: RelatedAlert = {
			nodes: [
				graph.nodes[0],
				...Array.from({ length: 4 }, (_, index) => ({
					id: `ioc_${index}`,
					group: 'ioc',
					label: `${index}`
				})),
				...Array.from({ length: 40 }, (_, index) => ({
					id: `case_${index}`,
					group: 'case',
					label: `${index}`
				}))
			],
			edges: Array.from({ length: 40 }, (_, index) => [
				{ from: `ioc_0`, to: `case_${index}` },
				{ from: `ioc_1`, to: `case_${index}` }
			]).flat()
		};
		const original = structuredClone(sharedGraph);
		const { nodes } = layoutRelatedGraph(sharedGraph, 10, 1);
		const hubs = nodes.filter((node) => node.group === 'ioc');
		const cases = nodes.filter((node) => node.group === 'case');
		const radius = Math.hypot(hubs[0].x, hubs[0].y);
		expect(cases.every((node) => Math.hypot(node.x, node.y) <= radius * 0.8)).toBe(true);
		expect(cases.reduce((sum, node) => sum + node.x, 0)).toBeGreaterThan(0);
		expect(new Set(cases.map((node) => `${node.x},${node.y}`)).size).toBe(40);
		expect(cases.every((node) => Math.hypot(node.x, node.y) >= 210)).toBe(true);
		const reversed = layoutRelatedGraph(
			{ nodes: [...sharedGraph.nodes].reverse(), edges: [...sharedGraph.edges].reverse() },
			10,
			1
		);
		expect(reversed.nodes).toEqual([...nodes].reverse());
		expect(sharedGraph).toEqual(original);
	});

	it.each([0, 4])(
		'limits shared-slot searches for 100 hubs, 1,000 exclusive leaves and %i shared leaves',
		(sharedCount) => {
			const large: RelatedAlert = {
				nodes: [
					graph.nodes[0],
					...Array.from({ length: 100 }, (_, index) => ({
						id: `ioc_${index}`,
						group: 'ioc',
						label: `${index}`
					})),
					...Array.from({ length: 1000 }, (_, index) => ({
						id: `case_${index}`,
						group: 'case',
						label: `${index}`
					})),
					...Array.from({ length: sharedCount }, (_, index) => ({
						id: `shared_${index}`,
						group: 'case',
						label: `${index}`
					}))
				],
				edges: [
					...Array.from({ length: 1000 }, (_, index) => ({
						from: `ioc_${index % 100}`,
						to: `case_${index}`
					})),
					...Array.from({ length: sharedCount }, (_, index) => [
						{ from: 'ioc_0', to: `shared_${index}` },
						{ from: 'ioc_1', to: `shared_${index}` }
					]).flat()
				]
			};
			const hypot = vi.spyOn(Math, 'hypot');
			try {
				layoutRelatedGraph(large, 10, 1);
				expect(hypot.mock.calls.length).toBeLessThanOrEqual(sharedCount ? 500 : 0);
				hypot.mockClear();
				layoutRelatedGraph(large, 10, 2);
				expect(hypot.mock.calls.length).toBeLessThanOrEqual(sharedCount ? 500 : 0);
			} finally {
				hypot.mockRestore();
			}
		}
	);

	it('stretches positions to wide and tall canvas aspect ratios without changing topology', () => {
		const square = layoutRelatedGraph(graph, 10, 1);
		const wide = layoutRelatedGraph(graph, 10, 2);
		const tall = layoutRelatedGraph(graph, 10, 0.5);
		square.nodes.forEach((node, index) => {
			expect(wide.nodes[index].x).toBeCloseTo(node.x * 2);
			expect(wide.nodes[index].y).toBeCloseTo(node.y);
			expect(tall.nodes[index].x).toBeCloseTo(node.x);
			expect(tall.nodes[index].y).toBeCloseTo(node.y * 2);
		});
		expect(wide.edges).toEqual(square.edges);
		expect(layoutRelatedGraph(graph, 10, NaN)).toEqual(wide);
	});

	it('always labels the focal alert and hubs and reveals leaf labels on hover or zoom', () => {
		expect(relatedGraphLabelLines(graph.nodes[0], 10, 0.1, false)[0]).toBe('This alert #10');
		expect(relatedGraphLabelLines(graph.nodes[3], 10, 0.1, false)).toEqual([
			'value_with_underscores'
		]);
		expect(relatedGraphLabelLines(graph.nodes[1], 10, 0.1, false)).toEqual([]);
		expect(relatedGraphLabelLines(graph.nodes[1], 10, 0.1, true)).toEqual(['Other alert']);
		expect(relatedGraphLabelLines(graph.nodes[1], 10, 0.8, false)).toEqual(['Other alert']);
	});

	it('produces deterministic positions and weights without mutating or depending on response order', () => {
		const original = structuredClone(graph);
		const first = layoutRelatedGraph(graph, 10);
		const reversed = layoutRelatedGraph(
			{ nodes: [...graph.nodes].reverse(), edges: [...graph.edges].reverse() },
			10
		);
		const byId = (nodes: typeof first.nodes) =>
			nodes.slice().sort((a, b) => a.id.localeCompare(b.id));
		expect(byId(reversed.nodes)).toEqual(byId(first.nodes));
		expect(reversed.edges).toEqual([...first.edges].reverse());
		expect(layoutRelatedGraph(graph, 10)).toEqual(first);
		expect(graph).toEqual(original);
	});

	it('caps widths at six for entities sharing many distinct indicators and retains IOC dashes', () => {
		const indicators = Array.from({ length: 8 }, (_, index) => ({
			id: `indicator_${index}`,
			group: index % 2 ? 'asset' : 'ioc',
			label: `${index}`
		}));
		const edges = indicators.flatMap((node) => [
			{ from: 'alert_10', to: node.id, dashes: node.group === 'ioc' },
			{ from: 'case_10', to: node.id, dashes: node.group === 'ioc' }
		]);
		const many: RelatedAlert = {
			nodes: [graph.nodes[0], graph.nodes[2], ...indicators],
			edges: [...edges, edges[1]]
		};
		expect(relatedIndicatorLinks(many).get('case_10')?.size).toBe(8);
		expect(layoutRelatedGraph(many, 10).edges).toEqual(
			many.edges.map((edge) => ({ ...edge, width: edge.from === 'alert_10' ? 1 : 6 }))
		);
	});

	it('counts distinct indicator IDs and weights every related edge while retaining IOC dashes', () => {
		const duplicate = {
			...graph,
			edges: [...graph.edges, graph.edges[4], { from: 'case_10', to: 'missing' }]
		};
		const links = relatedIndicatorLinks(duplicate);
		expect(links.get('case_10')?.size).toBe(2);
		expect(links.get('alert_100')?.size).toBe(1);
		expect(layoutRelatedGraph(duplicate, 10).edges.slice(0, 5)).toEqual([
			{ ...graph.edges[0], width: 1 },
			{ ...graph.edges[1], width: 1 },
			{ ...graph.edges[2], width: 1 },
			{ ...graph.edges[3], width: 2 },
			{ ...graph.edges[4], width: 2 }
		]);
	});

	it('keeps empty and connector-only layouts finite when filters hide all alerts', () => {
		expect(layoutRelatedGraph({ nodes: [], edges: [] }, 10)).toEqual({ nodes: [], edges: [] });
		const { nodes } = layoutRelatedGraph({ nodes: graph.nodes.slice(3), edges: [] }, 10);
		expect(
			nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y) && !node.fixed)
		).toBe(true);
	});
});
