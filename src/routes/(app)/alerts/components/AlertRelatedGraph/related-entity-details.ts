import { AlertService } from '$lib/services/alerts.service';
import { CaseService } from '$lib/services/case.service';
import type { ApiOptions, Paginated } from '$lib/services/api.service';
import type { Alert } from '$lib/types/resources/alert';
import type { Case } from '$lib/types/resources/case';
import type { RelatedEntityRow } from './related-graph-rows';

const reuseLookup = <T>(lookup: (ids: number[]) => Promise<T>) => {
	let key: string | null = null;
	let request: Promise<T> | null = null;
	return (ids: number[]) => {
		if (!ids.length) return Promise.resolve(null);
		const nextKey = ids.join(',');
		if (nextKey !== key) {
			key = nextKey;
			request = lookup(ids);
		}
		return request;
	};
};

// Keep reuse scoped to the mounted table, including requests still in flight.
export const createRelatedEntityDetailsLoader = (options: ApiOptions = {}) => {
	const lookupAlerts = reuseLookup((ids) =>
		AlertService.list({ alert_ids: ids, page: 1, per_page: ids.length }, options)
	);
	const lookupCases = reuseLookup((ids) =>
		CaseService.list({ case_ids: ids.join(','), page: 1, per_page: ids.length }, options)
	);
	return async (
		rows: RelatedEntityRow[]
	): Promise<{ alerts: Alert[]; cases: Case[]; incomplete: boolean }> => {
		const alertIds = rows
			.filter((row) => row.type === 'Alert')
			.map((row) => row.id)
			.sort((a, b) => a - b);
		const caseIds = rows
			.filter((row) => row.type === 'Case')
			.map((row) => row.id)
			.sort((a, b) => a - b);
		// One lookup per type, never an unfiltered request for an empty ID list.
		const [alertResult, caseResult] = await Promise.allSettled([
			lookupAlerts(alertIds),
			lookupCases(caseIds)
		]);
		const alertResponse = alertResult.status === 'fulfilled' ? alertResult.value : null;
		const caseResponse = caseResult.status === 'fulfilled' ? caseResult.value : null;
		// AlertService's legacy return type differs from beta.4's paginated list.
		const alertData = (alertResponse?.ok && !alertResponse.error ? alertResponse.data : null) as
			| Paginated<Alert>
			| string
			| null;
		const caseData = caseResponse?.ok && !caseResponse.error ? caseResponse.data : null;
		const alerts =
			alertData && typeof alertData !== 'string' && Array.isArray(alertData.data)
				? alertData.data
				: [];
		const cases =
			caseData && typeof caseData !== 'string' && Array.isArray(caseData.data) ? caseData.data : [];
		const returnedAlertIds = new Set(alerts.map((alert) => alert.alert_id));
		const returnedCaseIds = new Set(cases.map((item) => item.case_id));
		return {
			alerts,
			cases,
			incomplete:
				alertIds.some((id) => !returnedAlertIds.has(id)) ||
				caseIds.some((id) => !returnedCaseIds.has(id))
		};
	};
};

export const loadRelatedEntityDetails = (rows: RelatedEntityRow[], options: ApiOptions = {}) =>
	createRelatedEntityDetailsLoader(options)(rows);
