import { describe, expect, it } from 'vitest';
import {
	readRelationshipPreferences,
	writeRelationshipPreferences
} from '../relationship-layout-preference';

const storage = () => {
	const values = new Map<string, string>();
	return {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => {
			values.set(key, value);
		}
	};
};

describe('relationship layout preferences', () => {
	it('defaults each placement to Force', () => {
		const session = storage();
		expect(readRelationshipPreferences('detail', session)).toEqual({ layout: 'force' });
		expect(readRelationshipPreferences('split', session)).toEqual({ layout: 'force' });
	});

	it.each(['force', 'rings', 'hub-and-spoke'] as const)(
		'persists %s layout per placement across remounts',
		(layout) => {
			const session = storage();
			const preferences = { layout };
			writeRelationshipPreferences('detail', preferences, session);
			expect(readRelationshipPreferences('detail', session)).toEqual(preferences);
			expect(readRelationshipPreferences('split', session)).toEqual({ layout: 'force' });
			writeRelationshipPreferences('split', { layout: 'hub-and-spoke' }, session);
			expect(readRelationshipPreferences('detail', session)).toEqual(preferences);
			expect(readRelationshipPreferences('split', session)).toEqual({ layout: 'hub-and-spoke' });
		}
	);

	it('uses a layout-specific key and leaves table-view preferences untouched', () => {
		const session = storage();
		const tablePreferences = JSON.stringify({ view: 'table', layout: 'rings' });
		session.setItem('iris.alert-relationships:detail', tablePreferences);
		expect(readRelationshipPreferences('detail', session)).toEqual({ layout: 'force' });
		writeRelationshipPreferences('detail', { layout: 'hub-and-spoke' }, session);
		expect(session.getItem('iris.alert-relationships.layout:detail')).toBe(
			JSON.stringify({ layout: 'hub-and-spoke' })
		);
		expect(session.getItem('iris.alert-relationships:detail')).toBe(tablePreferences);
	});

	it('defaults missing or invalid layout choices to Force', () => {
		const session = storage();
		for (const layout of [undefined, null, 'unknown']) {
			session.setItem('iris.alert-relationships.layout:detail', JSON.stringify({ layout }));
			expect(readRelationshipPreferences('detail', session)).toEqual({ layout: 'force' });
		}
	});

	it('handles malformed or unavailable storage', () => {
		const session = storage();
		session.setItem('iris.alert-relationships.layout:detail', '{');
		expect(readRelationshipPreferences('detail', session)).toEqual({ layout: 'force' });
		const blocked = {
			getItem: () => {
				throw new Error('blocked');
			},
			setItem: () => {
				throw new Error('blocked');
			}
		};
		expect(readRelationshipPreferences('detail', blocked)).toEqual({ layout: 'force' });
		expect(() =>
			writeRelationshipPreferences('detail', { layout: 'rings' }, blocked)
		).not.toThrow();
	});
});
