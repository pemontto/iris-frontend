import { describe, expect, it } from 'vitest';
import type { RelatedAlert } from '$lib/services/alerts.service';
import { isFocalRelatedAlert, relatedIndicatorLinks } from '../related-graph-layout';
import { layoutRelatedRings as layoutRelatedGraph } from '../related-graph-rings';

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

describe('relationships rings layout', () => {
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

	it('pins only the focal alert at the centre and assigns one-hop indicators and two-hop entities', () => {
		const { nodes } = layoutRelatedGraph(graph, 10);
		expect(nodes[0]).toMatchObject({ x: 0, y: 0, fixed: true, physics: false });
		for (const node of nodes.slice(1)) {
			expect(node.fixed).toBe(false);
			expect(node.physics).toBe(false);
			expect(Math.hypot(node.x!, node.y!)).toBeCloseTo(
				node.group === 'ioc' || node.group === 'asset' ? 260 : 560
			);
		}
	});

	it('places single-hub entities in their indicator sector and resolves opposite-hub ties stably', () => {
		const { nodes } = layoutRelatedGraph(graph, 10);
		const indicator = nodes.find((node) => node.group === 'ioc')!;
		const alert = nodes.find((node) => node.id === 'alert_100')!;
		expect(indicator.y).toBeGreaterThan(0);
		expect(alert.y).toBeGreaterThan(0);
		// The case shares opposite hubs, so the first sorted indicator (asset) wins.
		expect(nodes.find((node) => node.id === 'case_10')!.y).toBeLessThan(0);
	});

	it('spills a crowded 186-node graph onto extra rings with space between node centres', () => {
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
		const { nodes } = layoutRelatedGraph(crowded, 10);
		const outer = nodes.filter((node) => node.group === 'case');
		expect(
			new Set(outer.map((node) => Math.round(Math.hypot(node.x!, node.y!)))).size
		).toBeGreaterThan(1);
		for (let i = 0; i < nodes.length; i++) {
			for (const other of nodes.slice(i + 1)) {
				expect(Math.hypot(nodes[i].x! - other.x!, nodes[i].y! - other.y!)).toBeGreaterThanOrEqual(
					199.99
				);
			}
		}
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

	it('retains case-only membership and counts with an empty centre when the focal alert is absent', () => {
		const filtered = { nodes: graph.nodes.slice(2), edges: graph.edges.slice(3) };
		const result = layoutRelatedGraph(filtered, 10);
		expect(result.nodes.map((node) => node.id)).toEqual(filtered.nodes.map((node) => node.id));
		expect(result.nodes.every((node) => !node.fixed && Math.hypot(node.x!, node.y!) > 0)).toBe(
			true
		);
		expect(relatedIndicatorLinks(filtered).get('case_10')?.size).toBe(2);
		expect(layoutRelatedGraph({ nodes: [], edges: [] }, 10)).toEqual({ nodes: [], edges: [] });
	});
});
