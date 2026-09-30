import { describe, expect, it } from 'vitest';
import { readRelationshipView, writeRelationshipView } from '../relationship-view-preference';

const storage = () => {
	const values = new Map<string, string>();
	return {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => {
			values.set(key, value);
		}
	};
};

describe('relationship view preference', () => {
	it('defaults to Graph and saves only the view independently for each placement', () => {
		const session = storage();
		expect(readRelationshipView('detail', session)).toBe('graph');
		writeRelationshipView('detail', 'table', session);
		expect(session.getItem('iris.alert-relationships.view:detail')).toBe('table');
		expect(readRelationshipView('detail', session)).toBe('table');
		expect(readRelationshipView('split', session)).toBe('graph');
		writeRelationshipView('split', 'table', session);
		writeRelationshipView('detail', 'graph', session);
		expect(readRelationshipView('detail', session)).toBe('graph');
		expect(readRelationshipView('split', session)).toBe('table');
	});

	it('ignores graph-layout preferences and invalid view values', () => {
		const session = storage();
		session.setItem('iris.alert-relationships:detail', JSON.stringify({ view: 'table' }));
		expect(readRelationshipView('detail', session)).toBe('graph');
		for (const value of ['{', 'unknown', JSON.stringify({ view: 'table', sort: null })]) {
			session.setItem('iris.alert-relationships.view:detail', value);
			expect(readRelationshipView('detail', session)).toBe('graph');
		}
	});

	it('handles unavailable storage', () => {
		const blocked = {
			getItem: () => {
				throw new Error('blocked');
			},
			setItem: () => {
				throw new Error('blocked');
			}
		};
		expect(readRelationshipView('detail', blocked)).toBe('graph');
		expect(() => writeRelationshipView('detail', 'table', blocked)).not.toThrow();
	});
});
