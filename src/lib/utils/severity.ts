/** Board column ranks, keyed by lower-cased name because ids vary between deployments. */
export const SEVERITY_RANK: Readonly<Record<string, number>> = {
	critical: 0,
	high: 10,
	medium: 20,
	low: 30,
	informational: 40,
	unspecified: 90
};

/** Rank for a lookup name, with unknown entries parked before `Unspecified`. */
export const rankOf = (ranks: Readonly<Record<string, number>>, name: string): number =>
	ranks[name.toLowerCase().trim()] ?? 50;
