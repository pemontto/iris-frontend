export type RelationshipPlacement = 'detail' | 'split';
export type RelationshipView = 'graph' | 'table';
type SessionStorage = Pick<Storage, 'getItem' | 'setItem'>;

export const readRelationshipView = (
	placement: RelationshipPlacement,
	storage?: SessionStorage
): RelationshipView => {
	try {
		return (storage ?? sessionStorage).getItem(`iris.alert-relationships.view:${placement}`) ===
			'table'
			? 'table'
			: 'graph';
	} catch {
		return 'graph';
	}
};

export const writeRelationshipView = (
	placement: RelationshipPlacement,
	view: RelationshipView,
	storage?: SessionStorage
) => {
	try {
		(storage ?? sessionStorage).setItem(`iris.alert-relationships.view:${placement}`, view);
	} catch {
		// The controls still work when browser storage is unavailable.
	}
};
