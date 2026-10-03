import type { RelatedAlert, RelatedAlertNode } from '$lib/services/alerts.service';
import type { Alert } from '$lib/types/resources/alert';
import { withFocalRelatedAlert, type FocalRelatedAlert } from './related-graph-layout';
import type { RelationshipLayout } from './relationship-layout-preference';

export type LoadedRelatedGraph = { alertId: number; data: RelatedAlert };

export const relatedAlertClosed = (status: Alert['status'] | undefined) =>
	['Closed', 'Merged', 'Escalated'].includes(status?.status_name ?? '');

export const currentRelatedGraph = (
	loaded: LoadedRelatedGraph | null,
	focal: FocalRelatedAlert,
	showFocal: boolean
): RelatedAlert =>
	loaded?.alertId === focal.id
		? withFocalRelatedAlert(loaded.data, focal, showFocal)
		: { nodes: [], edges: [] };

export const relatedGraphNativeLabel = (node: RelatedAlertNode, layout: RelationshipLayout) =>
	layout === 'force' ? node.label : '';

export const createRelatedGraphRequests = () => {
	let token = 0;
	return {
		begin: () => ++token,
		invalidate: () => {
			token++;
		},
		isCurrent: (requestToken: number, requestedAlertId: number, currentAlertId: number) =>
			requestToken === token && requestedAlertId === currentAlertId
	};
};
