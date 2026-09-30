import { describe, expect, it } from 'vitest';
import {
	readRelationshipPreferences,
	writeRelationshipPreferences
} from '../relationship-preferences';

const storage = () => {
	const values = new Map<string, string>();
	return {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => {
			values.set(key, value);
		}
	};
};

describe('relationship preferences', () => {
	it('defaults each placement to Graph and isolates its view and sort across remounts', () => {
		const session = storage();
		expect(readRelationshipPreferences('detail', session)).toEqual({ view: 'graph', sort: null });
		const detail = { view: 'table' as const, sort: { id: 'id' as const, dir: 'desc' as const } };
		writeRelationshipPreferences('detail', detail, session);
		expect(readRelationshipPreferences('detail', session)).toEqual(detail);
		expect(readRelationshipPreferences('split', session)).toEqual({ view: 'graph', sort: null });
		writeRelationshipPreferences(
			'split',
			{ view: 'table', sort: { id: 'title', dir: 'asc' } },
			session
		);
		expect(readRelationshipPreferences('detail', session)).toEqual(detail);
		expect(readRelationshipPreferences('split', session)).toEqual({
			view: 'table',
			sort: { id: 'title', dir: 'asc' }
		});
	});

	it('clears a chosen sort while retaining the placement view', () => {
		const session = storage();
		writeRelationshipPreferences(
			'split',
			{ view: 'table', sort: { id: 'date', dir: 'desc' } },
			session
		);
		writeRelationshipPreferences('split', { view: 'table', sort: null }, session);
		expect(readRelationshipPreferences('split', session)).toEqual({ view: 'table', sort: null });
	});

	it('ignores the old global preference and handles invalid or unavailable storage', () => {
		const session = storage();
		session.setItem('iris.alert-relationships-view', 'table');
		expect(readRelationshipPreferences('split', session)).toEqual({ view: 'graph', sort: null });
		session.setItem('iris.alert-relationships:detail', '{');
		expect(readRelationshipPreferences('detail', session)).toEqual({ view: 'graph', sort: null });
		session.setItem(
			'iris.alert-relationships:detail',
			JSON.stringify({ view: 'table', sort: { id: 'unknown', dir: 'asc' } })
		);
		expect(readRelationshipPreferences('detail', session)).toEqual({ view: 'table', sort: null });
		const blocked = {
			getItem: () => {
				throw new Error('blocked');
			},
			setItem: () => {
				throw new Error('blocked');
			}
		};
		expect(readRelationshipPreferences('detail', blocked)).toEqual({ view: 'graph', sort: null });
		expect(() =>
			writeRelationshipPreferences('detail', { view: 'table', sort: null }, blocked)
		).not.toThrow();
	});
});
