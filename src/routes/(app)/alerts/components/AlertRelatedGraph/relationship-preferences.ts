import type { RelatedEntitySort } from './related-graph-rows';

export type RelationshipPlacement = 'detail' | 'split';
export type RelationshipPreferences = {
	view: 'graph' | 'table';
	sort: RelatedEntitySort;
};
type SessionStorage = Pick<Storage, 'getItem' | 'setItem'>;

export const readRelationshipPreferences = (
	placement: RelationshipPlacement,
	storage?: SessionStorage
): RelationshipPreferences => {
	try {
		const saved = JSON.parse(
			(storage ?? sessionStorage).getItem(`iris.alert-relationships:${placement}`) ?? 'null'
		);
		const sort = saved?.sort;
		return {
			view: saved?.view === 'table' ? 'table' : 'graph',
			sort:
				sort &&
				['type', 'id', 'title', 'status', 'linkedThrough', 'date'].includes(sort.id) &&
				(sort.dir === 'asc' || sort.dir === 'desc')
					? { id: sort.id, dir: sort.dir }
					: null
		};
	} catch {
		return { view: 'graph', sort: null };
	}
};

export const writeRelationshipPreferences = (
	placement: RelationshipPlacement,
	preferences: RelationshipPreferences,
	storage?: SessionStorage
) => {
	try {
		(storage ?? sessionStorage).setItem(
			`iris.alert-relationships:${placement}`,
			JSON.stringify(preferences)
		);
	} catch {
		// The controls still work when browser storage is unavailable.
	}
};
