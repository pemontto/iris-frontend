import type { RelatedAlert, RelatedAlertNode } from '$lib/services/alerts.service';

export const isFocalRelatedAlert = (node: RelatedAlertNode, alertId: number) =>
	node.group === 'alert' && node.id === `alert_${alertId}`;

export const relatedIndicatorLinks = (graph: RelatedAlert) => {
	// The API only returns indicators matching the focal alert, even when it is omitted.
	const indicators = new Set(
		graph.nodes
			.filter((node) => node.group === 'ioc' || node.group === 'asset')
			.map((node) => node.id)
	);
	const nodes = new Set(graph.nodes.map((node) => node.id));
	const links = new Map<string, Set<string>>();
	for (const edge of graph.edges) {
		for (const [entity, indicator] of [
			[edge.from, edge.to],
			[edge.to, edge.from]
		]) {
			if (!nodes.has(entity) || indicators.has(entity) || !indicators.has(indicator)) continue;
			const values = links.get(entity) ?? new Set<string>();
			values.add(indicator);
			links.set(entity, values);
		}
	}
	return links;
};

export type FocalRelatedAlert = { id: number; title: string; closed: boolean };

export const relatedGraphLabelLines = (
	node: RelatedAlertNode,
	alertId: number,
	zoom: number,
	hovered: boolean
) => {
	const focal = isFocalRelatedAlert(node, alertId);
	const hub = node.group === 'ioc' || node.group === 'asset';
	if (!focal && !hub && !hovered && zoom < 0.8) return [];
	const label = focal ? `This alert #${alertId}\n${node.label}` : node.label;
	return label
		.split('\n')
		.slice(0, 3)
		.map((line) => (line.length > 40 ? `${line.slice(0, 39)}…` : line));
};

export const withFocalRelatedAlert = (
	graph: RelatedAlert,
	alert: FocalRelatedAlert,
	show: boolean
): RelatedAlert => {
	const id = `alert_${alert.id}`;
	if (!show) {
		return {
			nodes: graph.nodes.filter((node) => !isFocalRelatedAlert(node, alert.id)),
			edges: graph.edges.filter((edge) => edge.from !== id && edge.to !== id)
		};
	}
	const nodes = graph.nodes.some((node) => isFocalRelatedAlert(node, alert.id))
		? graph.nodes
		: [
				...graph.nodes,
				{ id, group: 'alert', label: `${alert.closed ? '[Closed] ' : ''}${alert.title}` }
			];
	const connected = new Set(
		graph.edges.flatMap((edge) =>
			edge.from === id ? [edge.to] : edge.to === id ? [edge.from] : []
		)
	);
	// get_related_alerts_details retains only the focal alert's matching indicators.
	const edges = [...graph.edges];
	for (const node of nodes) {
		if ((node.group === 'ioc' || node.group === 'asset') && !connected.has(node.id)) {
			edges.push({ from: id, to: node.id, ...(node.group === 'ioc' ? { dashes: true } : {}) });
		}
	}
	return { nodes, edges };
};

const spacing = 70;
const fullCircle = 2 * Math.PI;
const fanAngle = Math.PI * 0.9;
const position = (radius: number, angle: number) => ({
	x: radius * Math.cos(angle),
	y: radius * Math.sin(angle)
});
const fanCapacity = (radius: number) =>
	Math.max(1, Math.floor(fanAngle / (2 * Math.asin(spacing / (2 * radius)))));

export const layoutRelatedGraph = (graph: RelatedAlert, alertId: number, aspectRatio = 2) => {
	const links = relatedIndicatorLinks(graph);
	const indicators = graph.nodes
		.filter((node) => node.group === 'ioc' || node.group === 'asset')
		.slice()
		.sort((a, b) => a.id.localeCompare(b.id));
	const exclusive = new Map(indicators.map((node) => [node.id, [] as RelatedAlertNode[]]));
	const shared: RelatedAlertNode[] = [];
	const leaves = graph.nodes
		.filter((node) => !exclusive.has(node.id) && !isFocalRelatedAlert(node, alertId))
		.slice()
		.sort((a, b) => a.id.localeCompare(b.id));
	for (const node of leaves) {
		const neighbours = [...(links.get(node.id) ?? [])];
		if (neighbours.length === 1) exclusive.get(neighbours[0])!.push(node);
		else shared.push(node);
	}
	let maxFanRadius = 100;
	for (const cluster of exclusive.values()) {
		let remaining = cluster.length;
		let radius = 100;
		while (remaining > 0) {
			remaining -= fanCapacity(radius);
			maxFanRadius = Math.max(maxFanRadius, radius);
			radius += spacing;
		}
	}
	const hubRadius = Math.max(
		shared.length ? 280 : 180,
		indicators.length > 1 ? maxFanRadius / Math.sin(Math.PI / indicators.length) : maxFanRadius,
		spacing * Math.sqrt(shared.length + 1) * 1.4
	);
	const angles = new Map(
		indicators.map((node, index) => [
			node.id,
			(index * fullCircle) / indicators.length - Math.PI / 4
		])
	);
	const positions = new Map<string, { x: number; y: number }>(
		indicators.map((node) => [node.id, position(hubRadius, angles.get(node.id)!)])
	);
	positions.set(`alert_${alertId}`, { x: 0, y: 0 });
	for (const [id, cluster] of exclusive) {
		const hub = positions.get(id)!;
		let offset = 0;
		let radius = 100;
		while (offset < cluster.length) {
			const count = Math.min(fanCapacity(radius), cluster.length - offset);
			for (let slot = 0; slot < count; slot++) {
				const angle = angles.get(id)! + ((slot + 0.5) / count - 0.5) * fanAngle;
				const delta = position(radius, angle);
				positions.set(cluster[offset + slot].id, { x: hub.x + delta.x, y: hub.y + delta.y });
			}
			offset += count;
			radius += spacing;
		}
	}
	const usedSlots = new Set<string>();
	const maxSlotRadiusSquared = ((hubRadius * 0.8) / spacing) ** 2;
	for (const node of shared) {
		const hubs = [...(links.get(node.id) ?? [])].sort().map((id) => positions.get(id)!);
		const centre = {
			x: (hubs.reduce((sum, hub) => sum + hub.x, 0) / Math.max(1, hubs.length)) * 0.55,
			y: (hubs.reduce((sum, hub) => sum + hub.y, 0) / Math.max(1, hubs.length)) * 0.55
		};
		const target = { x: centre.x / spacing, y: centre.y / spacing };
		const origin = { x: Math.round(target.x), y: Math.round(target.y) };
		let nearest = { x: 0, y: 0, distance: Infinity };
		const visit = (x: number, y: number) => {
			const radiusSquared = x * x + y * y;
			if (radiusSquared < 9 || radiusSquared > maxSlotRadiusSquared || usedSlots.has(`${x},${y}`)) {
				return;
			}
			const distance = Math.hypot(x - target.x, y - target.y);
			if (
				distance < nearest.distance ||
				(distance === nearest.distance && (x < nearest.x || (x === nearest.x && y < nearest.y)))
			) {
				nearest = { x, y, distance };
			}
		};
		// Expand near the centroid only until unvisited slots cannot be closer.
		for (let radius = 0; ; radius++) {
			for (let x = -radius; x <= radius; x++) {
				visit(origin.x + x, origin.y - radius);
				if (radius > 0) visit(origin.x + x, origin.y + radius);
			}
			for (let y = -radius + 1; y < radius; y++) {
				visit(origin.x - radius, origin.y + y);
				visit(origin.x + radius, origin.y + y);
			}
			if (nearest.distance < radius + 0.5) break;
		}
		usedSlots.add(`${nearest.x},${nearest.y}`);
		positions.set(node.id, { x: nearest.x * spacing, y: nearest.y * spacing });
	}
	const ratio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 2;
	return {
		nodes: graph.nodes.map((node) => {
			const point = positions.get(node.id)!;
			return {
				...node,
				x: point.x * Math.max(1, ratio),
				y: point.y * Math.max(1, 1 / ratio),
				physics: false,
				fixed: isFocalRelatedAlert(node, alertId)
			};
		}),
		edges: graph.edges.map((edge) => {
			const entity = links.has(edge.from) ? edge.from : edge.to;
			const focal = entity === `alert_${alertId}`;
			return { ...edge, width: focal ? 1 : Math.min(6, Math.max(1, links.get(entity)?.size ?? 0)) };
		})
	};
};

export const forceRelatedGraph = (graph: RelatedAlert, alertId: number) => {
	return {
		nodes: graph.nodes.map((node) =>
			isFocalRelatedAlert(node, alertId) ? { ...node, x: 0, y: 0, fixed: true } : node
		),
		edges: graph.edges
	};
};
