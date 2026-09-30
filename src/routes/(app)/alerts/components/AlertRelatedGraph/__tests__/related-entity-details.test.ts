import { beforeEach, describe, it, expect, vi } from 'vitest';
import { AlertService } from '$lib/services/alerts.service';
import { CaseService } from '$lib/services/case.service';
import {
	createRelatedEntityDetailsLoader,
	loadRelatedEntityDetails
} from '../related-entity-details';
import { relatedGraphToRows } from '../related-graph-rows';

vi.mock('$lib/services/alerts.service', () => ({ AlertService: { list: vi.fn() } }));
vi.mock('$lib/services/case.service', () => ({ CaseService: { list: vi.fn() } }));

const rows = relatedGraphToRows({
	nodes: [
		{ id: 'alert_1', group: 'alert', label: 'Alert 1' },
		{ id: 'alert_2', group: 'alert', label: 'Alert 2' },
		{ id: 'case_3', group: 'case', label: 'Case #3' },
		{ id: 'case_4', group: 'case', label: 'Case #4' }
	],
	edges: []
});

describe('loadRelatedEntityDetails', () => {
	beforeEach(() => vi.resetAllMocks());

	it('fetches all displayed IDs in one request per type with cancellation options', async () => {
		const alerts = [{ alert_id: 1 }, { alert_id: 2 }];
		const cases = [{ case_id: 3 }, { case_id: 4 }];
		vi.mocked(AlertService.list).mockResolvedValue({
			ok: true,
			status: 200,
			data: {
				data: alerts,
				total: 2,
				current_page: 1,
				last_page: 1,
				next_page: null
			}
		} as unknown as Awaited<ReturnType<typeof AlertService.list>>);
		vi.mocked(CaseService.list).mockResolvedValue({
			ok: true,
			status: 200,
			data: {
				data: cases,
				total: 2,
				current_page: 1,
				last_page: 1,
				next_page: null
			}
		} as Awaited<ReturnType<typeof CaseService.list>>);
		const options = { signal: new AbortController().signal };
		expect(await loadRelatedEntityDetails(rows, options)).toEqual({
			alerts,
			cases,
			incomplete: false
		});
		expect(AlertService.list).toHaveBeenCalledExactlyOnceWith(
			{ alert_ids: [1, 2], page: 1, per_page: 2 },
			options
		);
		expect(CaseService.list).toHaveBeenCalledExactlyOnceWith(
			{ case_ids: '3,4', page: 1, per_page: 2 },
			options
		);
	});

	it('does not request a type without displayed rows', async () => {
		expect(await loadRelatedEntityDetails([])).toEqual({
			alerts: [],
			cases: [],
			incomplete: false
		});
		expect(AlertService.list).not.toHaveBeenCalled();
		expect(CaseService.list).not.toHaveBeenCalled();
		await loadRelatedEntityDetails(rows.slice(2));
		expect(AlertService.list).not.toHaveBeenCalled();
		expect(CaseService.list).toHaveBeenCalledTimes(1);
	});

	it('keeps successful details when the other type fails', async () => {
		vi.mocked(AlertService.list).mockRejectedValue(new Error('Unavailable'));
		const cases = [{ case_id: 3 }, { case_id: 4 }];
		vi.mocked(CaseService.list).mockResolvedValue({
			ok: true,
			status: 200,
			data: {
				data: cases,
				total: 2,
				current_page: 1,
				last_page: 1,
				next_page: null
			}
		} as Awaited<ReturnType<typeof CaseService.list>>);
		expect(await loadRelatedEntityDetails(rows)).toEqual({ alerts: [], cases, incomplete: true });
	});

	it('flags missing IDs and failed responses as incomplete', async () => {
		const alerts = [{ alert_id: 1 }];
		vi.mocked(AlertService.list).mockResolvedValue({
			ok: true,
			status: 200,
			data: {
				data: alerts,
				total: 2,
				current_page: 1,
				last_page: 2,
				next_page: 2
			}
		} as unknown as Awaited<ReturnType<typeof AlertService.list>>);
		vi.mocked(CaseService.list).mockResolvedValue({ ok: false, status: 403, data: 'Forbidden' });
		expect(await loadRelatedEntityDetails(rows)).toEqual({ alerts, cases: [], incomplete: true });
	});

	it('reuses in-flight and completed lookups across graph changes and ID ordering', async () => {
		const cases = [{ case_id: 3 }, { case_id: 4 }];
		let resolveCases!: (value: Awaited<ReturnType<typeof CaseService.list>>) => void;
		vi.mocked(CaseService.list).mockReturnValue(new Promise((resolve) => (resolveCases = resolve)));
		const load = createRelatedEntityDetailsLoader();
		const first = load(rows);
		const projected = load(rows.slice(2).reverse());
		expect(CaseService.list).toHaveBeenCalledTimes(1);
		resolveCases({
			ok: true,
			status: 200,
			data: {
				data: cases,
				total: 2,
				current_page: 1,
				last_page: 1,
				next_page: null
			}
		} as Awaited<ReturnType<typeof CaseService.list>>);
		await first;
		expect(await projected).toEqual({ alerts: [], cases, incomplete: false });
		expect(await load(rows.slice(2))).toEqual({ alerts: [], cases, incomplete: false });
		expect(CaseService.list).toHaveBeenCalledTimes(1);
	});

	it('fetches changed ID sets and does not share lookup state between mounted tables', async () => {
		const load = createRelatedEntityDetailsLoader();
		await load(rows);
		await load(rows.slice(0, 3));
		expect(AlertService.list).toHaveBeenCalledTimes(1);
		expect(CaseService.list).toHaveBeenCalledTimes(2);
		await createRelatedEntityDetailsLoader()(rows);
		expect(AlertService.list).toHaveBeenCalledTimes(2);
		expect(CaseService.list).toHaveBeenCalledTimes(3);
	});
});
