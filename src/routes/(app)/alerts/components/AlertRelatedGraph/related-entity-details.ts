import { AlertService } from '$lib/services/alerts.service';
import { CaseService } from '$lib/services/case.service';
import type { ApiOptions, Paginated } from '$lib/services/api.service';
import type { Alert } from '$lib/types/resources/alert';
import type { Case } from '$lib/types/resources/case';
import type { RelatedEntityRow } from './related-graph-rows';

const reuseLookup = <T>(
	lookup: (ids: number[]) => Promise<T>,
	isCacheable: (value: T) => boolean
) => {
	let key: string | null = null;
	let request: Promise<T> | null = null;
	return (ids: number[]) => {
		if (!ids.length) return Promise.resolve(null);
		const nextKey = ids.join(',');
		if (nextKey !== key) {
			key = nextKey;
			let nextRequest: Promise<T>;
			try {
				nextRequest = Promise.resolve(lookup(ids));
			} catch (error) {
				nextRequest = Promise.reject(error);
			}
			request = nextRequest;
			void nextRequest.then(
				(value) => {
					if (!isCacheable(value) && key === nextKey && request === nextRequest) {
						key = null;
						request = null;
					}
				},
				() => {
					if (key === nextKey && request === nextRequest) {
						key = null;
						request = null;
					}
				}
			);
		}
		return request;
	};
};

const isSuccessfulPaginatedResponse = (
	response: unknown,
	idField: 'alert_id' | 'case_id'
): boolean => {
	if (typeof response !== 'object' || response === null) return false;
	const result = response as { ok?: unknown; error?: unknown; data?: unknown };
	if (result.ok !== true || result.error) return false;
	if (typeof result.data !== 'object' || result.data === null) return false;
	const items = (result.data as { data?: unknown }).data;
	return (
		Array.isArray(items) &&
		items.every(
			(item) =>
				typeof item === 'object' &&
				item !== null &&
				typeof (item as Record<string, unknown>)[idField] === 'number'
		)
	);
};

// Keep reuse scoped to the mounted table, including requests still in flight.
export const createRelatedEntityDetailsLoader = (options: ApiOptions = {}) => {
	const lookupAlerts = reuseLookup(
		(ids) => {
			const params = {
				alert_ids: ids,
				page: 1,
				per_page: ids.length,
				fields: 'alert_id,alert_title,status,resolution_status,alert_source_event_time'
			} satisfies Parameters<typeof AlertService.list>[0] & { fields: string };
			return AlertService.list(params, options);
		},
		(value) => isSuccessfulPaginatedResponse(value, 'alert_id')
	);
	const lookupCases = reuseLookup(
		(ids) => CaseService.list({ case_ids: ids.join(','), page: 1, per_page: ids.length }, options),
		(value) => isSuccessfulPaginatedResponse(value, 'case_id')
	);
	return async (
		rows: RelatedEntityRow[]
	): Promise<{
		alerts: Alert[];
		cases: Case[];
		incomplete: boolean;
		unavailableAlertIds: number[];
		unavailableCaseIds: number[];
	}> => {
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
		const alertResponseValid =
			!alertIds.length ||
			(alertResponse !== null && isSuccessfulPaginatedResponse(alertResponse, 'alert_id'));
		const caseResponseValid =
			!caseIds.length ||
			(caseResponse !== null && isSuccessfulPaginatedResponse(caseResponse, 'case_id'));
		const alertData =
			alertResponseValid && alertResponse !== null
				? (alertResponse.data as unknown as Paginated<Alert>)
				: null;
		const caseData =
			caseResponseValid && caseResponse !== null ? (caseResponse.data as Paginated<Case>) : null;
		const alerts = alertData?.data ?? [];
		const cases = caseData?.data ?? [];
		const returnedAlertIds = new Set(alerts.map((alert) => alert.alert_id));
		const returnedCaseIds = new Set(cases.map((item) => item.case_id));
		const unavailableAlertIds = alertResponseValid
			? alertIds.filter((id) => !returnedAlertIds.has(id))
			: [];
		const unavailableCaseIds = caseResponseValid
			? caseIds.filter((id) => !returnedCaseIds.has(id))
			: [];
		return {
			alerts,
			cases,
			incomplete:
				alertResult.status === 'rejected' ||
				caseResult.status === 'rejected' ||
				!alertResponseValid ||
				!caseResponseValid,
			unavailableAlertIds,
			unavailableCaseIds
		};
	};
};

export const loadRelatedEntityDetails = (rows: RelatedEntityRow[], options: ApiOptions = {}) =>
	createRelatedEntityDetailsLoader(options)(rows);
