import type { RelatedAlert, RelatedAlertNode } from '$lib/services/alerts.service';
import { isFocalRelatedAlert, relatedIndicatorLinks } from './related-graph-layout';

const spacing = 200;
const fullCircle = 2 * Math.PI;
const position = (radius: number, angle: number) => ({
	x: radius * Math.cos(angle),
	y: radius * Math.sin(angle)
});

export const layoutRelatedRings = (graph: RelatedAlert, alertId: number) => {
	const links = relatedIndicatorLinks(graph);
	const indicators = graph.nodes
		.filter((node) => node.group === 'ioc' || node.group === 'asset')
		.slice()
		.sort((a, b) => a.id.localeCompare(b.id));
	const sector = fullCircle / Math.max(1, indicators.length);
	const innerRadius = Math.max(
		260,
		indicators.length > 1 ? spacing / (2 * Math.sin(Math.PI / indicators.length)) : 260
	);
	const angles = new Map(indicators.map((node, index) => [node.id, index * sector - Math.PI / 2]));
	const positions = new Map<string, { x: number; y: number }>(
		indicators.map((node) => [node.id, position(innerRadius, angles.get(node.id)!)])
	);
	const clusters: RelatedAlertNode[][] = Array.from(
		{ length: Math.max(1, indicators.length) },
		() => []
	);
	const outer = graph.nodes
		.filter((node) => !angles.has(node.id) && !isFocalRelatedAlert(node, alertId))
		.slice()
		.sort((a, b) => a.id.localeCompare(b.id));

	for (const node of outer) {
		const shared = [...(links.get(node.id) ?? [])].sort();
		const x = shared.reduce((sum, id) => sum + Math.cos(angles.get(id)!), 0);
		const y = shared.reduce((sum, id) => sum + Math.sin(angles.get(id)!), 0);
		// Opposite hubs have no mean direction. Use the first stable ID as the tie-break.
		const angle =
			Math.hypot(x, y) > 0.001 ? Math.atan2(y, x) : (angles.get(shared[0]) ?? -Math.PI / 2);
		const cluster = Math.round((angle + Math.PI / 2 + fullCircle) / sector) % clusters.length;
		clusters[cluster].push(node);
	}

	clusters.forEach((cluster, index) => {
		let offset = 0;
		let radius = innerRadius + 300;
		while (offset < cluster.length) {
			// Reserve a slot's width at sector boundaries. Chord spacing avoids collisions.
			const capacity = Math.max(1, Math.floor(sector / (2 * Math.asin(spacing / (2 * radius)))));
			const count = Math.min(capacity, cluster.length - offset);
			for (let slot = 0; slot < count; slot++) {
				const angle = index * sector - Math.PI / 2 + ((slot + 0.5) / count - 0.5) * sector;
				positions.set(cluster[offset + slot].id, position(radius, angle));
			}
			offset += count;
			radius += spacing;
		}
	});

	return {
		nodes: graph.nodes.map((node) => ({
			...node,
			...(isFocalRelatedAlert(node, alertId) ? { x: 0, y: 0 } : positions.get(node.id)),
			physics: false,
			fixed: isFocalRelatedAlert(node, alertId)
		})),
		edges: graph.edges.map((edge) => {
			const entity = links.has(edge.from) ? edge.from : edge.to;
			const focal = entity === `alert_${alertId}`;
			return { ...edge, width: focal ? 1 : Math.min(6, Math.max(1, links.get(entity)?.size ?? 0)) };
		})
	};
};
