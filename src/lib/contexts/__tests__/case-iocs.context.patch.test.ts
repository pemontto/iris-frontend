import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/services/case-iocs.service', () => ({
	CaseIocsService: { list: vi.fn(), update: vi.fn() }
}));

const { CaseIocsService } = await import('$lib/services/case-iocs.service');
const { createCaseIocsContext } = await import('../case-iocs.context.svelte');
const list = vi.mocked(CaseIocsService.list);
const update = vi.mocked(CaseIocsService.update);
const stored = { ioc_id: 253, ioc_value: 'example.test', custom_attributes: null };

beforeEach(() => {
	vi.clearAllMocks();
	list.mockResolvedValue({
		ok: true,
		data: { data: [stored], total: 1, current_page: 1, next_page: null, last_page: 1 }
	} as never);
});

describe('patchIoc', () => {
	it.each([
		{ ok: false, error: { message: 'Internal server error' }, data: null },
		{ ok: false, data: null }
	])('reports a failed save while preserving the refreshed IOC return value', async (response) => {
		const iocs = createCaseIocsContext(() => 74);
		await iocs.listPaginated();
		update.mockResolvedValue(response as never);

		const result = await iocs.patchIoc(253, {
			custom_attributes: { 'Threat intel': { Confidence: 'High' } }
		});

		expect(iocs.mutation.error).toBe(response.error?.message ?? 'Failed to update IOC');
		expect(result).toEqual(stored);
		expect(list).toHaveBeenCalledTimes(2);
	});

	it('clears an earlier error and returns the updated IOC on success', async () => {
		const iocs = createCaseIocsContext(() => 74);
		iocs.mutation.error = 'Previous failure';
		const saved = { ...stored, custom_attributes: { 'Threat intel': { Confidence: 'High' } } };
		update.mockResolvedValue({ ok: true, data: saved } as never);

		const result = await iocs.patchIoc(253, { custom_attributes: saved.custom_attributes });

		expect(iocs.mutation.error).toBeNull();
		expect(result).toEqual(saved);
		expect(list).not.toHaveBeenCalled();
	});
});
