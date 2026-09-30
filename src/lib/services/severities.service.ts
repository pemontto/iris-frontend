import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';
import { SEVERITY_RANK, rankOf } from '$lib/utils/severity';

export type SeverityIdentifier = number;

export interface Severity {
	severity_id: number;
	severity_name: string;
	severity_description: string;
}

export class SeveritiesService {
	static async list(options: ApiOptions = {}): Promise<RequestResponse<Severity[]>> {
		// Hits the v2 read-only endpoint. The v2 surface returns a
		// paginated envelope (`{total, data, ...}`); consumers already
		// reach into `.data.data` to unwrap the legacy
		// `{status, data: T[]}` shape and get the same array.
		//
		// Pass a large per_page so the default per_page=10 doesn't
		// silently truncate severity dropdowns on deployments with
		// custom severities.
		const url = ApiService.withQuery('/manage/severities', { per_page: 10000 });
		const res = await ApiService.get<Severity[]>(url, options);
		const body = res.data as unknown as Severity[] | { data?: Severity[] } | null;
		const severities = Array.isArray(body) ? body : body?.data;
		if (Array.isArray(severities)) {
			// Reverse the board ranks for least-to-most severe pickers.
			// Equal custom ranks preserve their API order in the stable sort.
			const pickerRank = (severity: Severity): number =>
				Object.hasOwn(SEVERITY_RANK, severity.severity_name.toLowerCase().trim())
					? -rankOf(SEVERITY_RANK, severity.severity_name)
					: Number.MAX_SAFE_INTEGER;
			severities.sort((a, b) => pickerRank(a) - pickerRank(b));
		}
		return res;
	}
}
