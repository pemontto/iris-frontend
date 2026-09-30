import type { RelatedAlert } from '$lib/services/alerts.service';
import type { AlertRelationshipsFiltersValue } from './alert-relationships-filters';

export const projectRelatedGraph = (
	graph: RelatedAlert,
	filters: AlertRelationshipsFiltersValue
): RelatedAlert => {
	if (filters.openAlerts || filters.closedAlerts) return graph;
	if (!filters.openCases && !filters.closedCases) return { nodes: [], edges: [] };

	// The API returns alerts for case discovery even when both alert chips are off.
	const caseIds = new Set(
		graph.nodes.filter((node) => node.group === 'case').map((node) => node.id)
	);
	const neighbours = new Set<string>();

	for (const edge of graph.edges) {
		if (caseIds.has(edge.from)) neighbours.add(edge.to);
		if (caseIds.has(edge.to)) neighbours.add(edge.from);
	}

	const nodes = graph.nodes.filter(
		(node) =>
			node.group === 'case' ||
			((node.group === 'ioc' || node.group === 'asset') && neighbours.has(node.id))
	);
	const nodeIds = new Set(nodes.map((node) => node.id));
	const edges = graph.edges.filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to));

	return { nodes, edges };
};
