import { afterEach, describe, expect, it } from 'vitest';
import { formatRelatedEntityDate } from '../RelatedEntityDateCell.svelte';
import { timezone, TIMEZONE_BROWSER } from '$lib/stores/timezone.store.svelte';
import { timeFormat, TIME_FORMAT_24H } from '$lib/stores/time-format.store.svelte';

afterEach(() => {
	timezone.set(TIMEZONE_BROWSER);
	timeFormat.set(TIME_FORMAT_24H);
});

describe('formatRelatedEntityDate', () => {
	it('renders date-only values without inventing a time or shifting the calendar day', () => {
		timezone.set('America/Los_Angeles');
		const formatted = formatRelatedEntityDate('2026-09-28');
		expect(formatted).toContain('28');
		expect(formatted).toContain('2026');
		expect(formatted).not.toMatch(/\d{1,2}:\d{2}/);
	});

	it('preserves recorded times, including midnight, and handles missing dates', () => {
		timezone.set('UTC');
		timeFormat.set(TIME_FORMAT_24H);
		expect(formatRelatedEntityDate('2026-09-28T00:00:00Z')).toContain('00:00');
		expect(formatRelatedEntityDate('2026-09-28T12:30:00Z')).toContain('12:30');
		expect(formatRelatedEntityDate(null)).toBe('-');
	});
});
