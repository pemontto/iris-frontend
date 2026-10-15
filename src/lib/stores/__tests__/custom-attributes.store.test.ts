import { describe, expect, it } from 'vitest';
import type { CustomAttributeSchema } from '$lib/services/custom-attributes.service';
import { seedCustomAttributeValues } from '../custom-attributes.store.svelte';

const schema: CustomAttributeSchema = {
	'Threat intel': { Confidence: { type: 'input_string', value: 'default' } }
};

const seed = (previous: unknown) =>
	seedCustomAttributeValues(schema, { 'Threat intel': { Confidence: previous } })['Threat intel']
		.Confidence;

describe('seedCustomAttributeValues', () => {
	it.each(['High', '', false, 0, null, ['one'], { nested: 'value' }])(
		'uses the stored descriptor value %j',
		(value) => {
			expect(seed({ type: 'input_string', mandatory: false, value })).toEqual(value);
		}
	);

	it.each(['High', '', false, 0, null, ['one'], { nested: 'value' }, { value: 'plain object' }])(
		'preserves the plain stored value %j',
		(value) => {
			expect(seed(value)).toEqual(value);
		}
	);

	it('uses schema defaults for missing values', () => {
		expect(seedCustomAttributeValues(schema)).toEqual({
			'Threat intel': { Confidence: 'default' }
		});
		expect(seed(undefined)).toBe('default');
	});
});
