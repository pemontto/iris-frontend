import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../api.service', () => ({
	ApiService: {
		withQuery: vi.fn(),
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		delete: vi.fn()
	}
}));

import { SeveritiesService } from '../severities.service';
import { ApiService } from '../api.service';
import type { ApiOptions } from '../api.service';
import type { Severity } from '../severities.service';

describe('CaseSeveritiesService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('list() hits the v2 severities endpoint', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: [
				{
					severity_id: 1,
					severity_name: 'Low',
					severity_description: 'Low severity'
				}
			] satisfies Severity[]
		};

		const urlWithQuery = '/manage/severities?per_page=10000';
		(ApiService.withQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(urlWithQuery);
		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await SeveritiesService.list(options);

		expect(ApiService.withQuery).toHaveBeenCalledWith('/manage/severities', { per_page: 10000 });
		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith(urlWithQuery, options);
		expect(res).toBe(mockResponse);
	});

	it.each(['paginated', 'flat'])('list() sorts %s severities in canonical order', async (shape) => {
		const severities = ['Medium', 'Unspecified', 'Informational', 'Low', 'High', 'Critical'].map(
			(severity_name, index) => ({
				severity_id: index + 1,
				severity_name,
				severity_description: `${severity_name} severity`
			})
		);
		const expected = [
			severities[1],
			severities[2],
			severities[3],
			severities[0],
			severities[4],
			severities[5]
		];
		const mockResponse = {
			ok: true,
			status: 200,
			data: shape === 'flat' ? severities : { total: 6, data: severities, current_page: 1 }
		};
		vi.mocked(ApiService.get).mockResolvedValueOnce(mockResponse);

		const res = await SeveritiesService.list();
		const body = res.data as unknown as Severity[] | { data: Severity[] };

		expect(Array.isArray(body) ? body : body.data).toEqual(expected);
		expect(res).toBe(mockResponse);
	});

	it('list() keeps custom severities after known severities in API order', async () => {
		const severities = ['Custom Z', 'Critical', 'Custom A', 'Unspecified'].map(
			(severity_name, index) => ({
				severity_id: index + 1,
				severity_name,
				severity_description: ''
			})
		);
		vi.mocked(ApiService.get).mockResolvedValueOnce({ status: 200, data: { data: severities } });

		const res = await SeveritiesService.list();
		const body = res.data as unknown as { data: Severity[] };

		expect(body.data.map((s) => s.severity_name)).toEqual([
			'Unspecified',
			'Critical',
			'Custom Z',
			'Custom A'
		]);
	});

	it('list() matches severity names case-insensitively and trims whitespace', async () => {
		const severities = [
			'cRiTiCaL',
			'  LOW  ',
			'UNSPECIFIED',
			'Medium',
			'informational',
			'high'
		].map((severity_name, index) => ({
			severity_id: index + 1,
			severity_name,
			severity_description: ''
		}));
		vi.mocked(ApiService.get).mockResolvedValueOnce({ status: 200, data: { data: severities } });

		const res = await SeveritiesService.list();
		const body = res.data as unknown as { data: Severity[] };

		expect(body.data.map((s) => s.severity_name)).toEqual([
			'UNSPECIFIED',
			'informational',
			'  LOW  ',
			'Medium',
			'high',
			'cRiTiCaL'
		]);
	});
});
