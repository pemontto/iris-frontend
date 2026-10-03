export type RelationshipLayout = 'force' | 'rings' | 'hub-and-spoke';
export type RelationshipPlacement = 'detail' | 'split';
export type RelationshipPreferences = { layout: RelationshipLayout };
type SessionStorage = Pick<Storage, 'getItem' | 'setItem'>;

export const readRelationshipPreferences = (
	placement: RelationshipPlacement,
	storage?: SessionStorage
): RelationshipPreferences => {
	try {
		const saved = JSON.parse(
			(storage ?? sessionStorage).getItem(`iris.alert-relationships.layout:${placement}`) ?? 'null'
		);
		return {
			layout:
				saved?.layout === 'rings' || saved?.layout === 'hub-and-spoke' ? saved.layout : 'force'
		};
	} catch {
		return { layout: 'force' };
	}
};

export const writeRelationshipPreferences = (
	placement: RelationshipPlacement,
	preferences: RelationshipPreferences,
	storage?: SessionStorage
) => {
	try {
		(storage ?? sessionStorage).setItem(
			`iris.alert-relationships.layout:${placement}`,
			JSON.stringify(preferences)
		);
	} catch {
		// The controls still work when browser storage is unavailable.
	}
};
