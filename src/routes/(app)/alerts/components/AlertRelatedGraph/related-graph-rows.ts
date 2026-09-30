import type { RelatedAlert } from '$lib/services/alerts.service';
import type { Alert } from '$lib/types/resources/alert';
import type { Case } from '$lib/types/resources/case';

export type RelatedEntityRow = {
	type: 'Alert' | 'Case';
	id: number;
	href: string;
	title: string;
	status: string;
	resolution: string | null;
	customer: string | null;
	linkedThrough: string;
	linkedThroughValues: string[];
	date: string | null;
};

export type RelatedEntitySort = {
	id: 'type' | 'id' | 'title' | 'status' | 'linkedThrough' | 'date';
	dir: 'asc' | 'desc';
} | null;

const defaultOrder = (a: RelatedEntityRow, b: RelatedEntityRow) => {
	const lifecycle = Number(b.status.startsWith('Open')) - Number(a.status.startsWith('Open'));
	if (lifecycle) return lifecycle;
	const date = (row: RelatedEntityRow) => {
		const value = row.date ? Date.parse(row.date) : NaN;
		return Number.isFinite(value) ? value : -Infinity;
	};
	const aDate = date(a);
	const bDate = date(b);
	if (aDate !== bDate) return aDate > bDate ? -1 : 1;
	return a.id - b.id || a.type.localeCompare(b.type);
};

export const sortRelatedEntityRows = (rows: RelatedEntityRow[], sort: RelatedEntitySort = null) =>
	rows.slice().sort((a, b) => {
		if (!sort) return defaultOrder(a, b);
		const av = a[sort.id];
		const bv = b[sort.id];
		// Match the shared DataTable's numeric and text comparisons.
		const comparison =
			typeof av === 'number' && typeof bv === 'number'
				? av - bv
				: String(av ?? '').localeCompare(String(bv ?? ''));
		return comparison * (sort.dir === 'asc' ? 1 : -1) || defaultOrder(a, b);
	});

export const relatedGraphToRows = (
	graph: RelatedAlert,
	alerts: Alert[] = [],
	cases: Case[] = [],
	focalAlertId?: number
): RelatedEntityRow[] => {
	const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
	const alertDetails = new Map(alerts.map((alert) => [alert.alert_id, alert]));
	const caseDetails = new Map(cases.map((item) => [item.case_id, item]));
	const links = new Map<string, Set<string>>();

	for (const edge of graph.edges) {
		for (const [entityId, connectorId] of [
			[edge.from, edge.to],
			[edge.to, edge.from]
		]) {
			const connector = nodes.get(connectorId);
			if (connector?.group !== 'ioc' && connector?.group !== 'asset') continue;
			const values = links.get(entityId) ?? new Set<string>();
			values.add(`${connector.group === 'ioc' ? 'IOC' : 'Asset'}: ${connector.label}`);
			links.set(entityId, values);
		}
	}

	const rows: RelatedEntityRow[] = [];
	for (const node of nodes.values()) {
		if (node.group !== 'alert' && node.group !== 'case') continue;
		const id = Number(node.id.slice(`${node.group}_`.length));
		if (!Number.isSafeInteger(id) || id <= 0) continue;
		if (node.group === 'alert' && id === focalAlertId) continue;
		const closed = node.label.startsWith('[Closed]');
		let title = node.label.replace(/^\[Closed\]\s*/, '');
		// Alert resolution is a bracketed line before the title in the API label.
		const resolution = node.group === 'alert' ? title.match(/^\[([^\]\n]+)\]\n\s*/) : null;
		if (resolution) title = title.slice(resolution[0].length);
		const alert = node.group === 'alert' ? alertDetails.get(id) : undefined;
		const item = node.group === 'case' ? caseDetails.get(id) : undefined;
		const lifecycle = item ? (item.close_date ? 'Closed' : 'Open') : closed ? 'Closed' : 'Open';
		const exactStatus = alert?.status?.status_name;
		const entityTitle = alert?.alert_title ?? item?.case_name ?? title;
		const casePrefix = `#${id} - `;
		const linkedThroughValues = [...(links.get(node.id) ?? [])].sort();

		rows.push({
			type: node.group === 'alert' ? 'Alert' : 'Case',
			id,
			href: node.group === 'alert' ? `/alerts/${id}` : `/case/${id}`,
			title:
				node.group === 'case' && entityTitle.startsWith(casePrefix)
					? entityTitle.slice(casePrefix.length)
					: entityTitle,
			status:
				exactStatus && exactStatus !== lifecycle ? `${lifecycle} (${exactStatus})` : lifecycle,
			resolution: alert?.resolution_status?.resolution_status_name ?? resolution?.[1] ?? null,
			customer: alert?.customer?.customer_name ?? item?.case_customer?.customer_name ?? null,
			linkedThrough: linkedThroughValues.join('; '),
			linkedThroughValues,
			date: alert?.alert_source_event_time ?? item?.open_date ?? null
		});
	}
	return rows;
};
