import { describe, expect, it } from 'vitest';
import { centredRelatedGraphScale } from '../related-graph-viewport';

const canvas = { width: 800, height: 400 };
const focal = { x: 0, y: 0 };

describe('centred relationships graph scale', () => {
	it('reduces fitted zoom so a lopsided drawing fits on both sides of the focal node', () => {
		const bounds = [
			{ left: -625, right: -575, top: -25, bottom: 25 },
			{ left: -36, right: 36, top: -36, bottom: 36 },
			{ left: 75, right: 125, top: -25, bottom: 25 }
		];
		const fittedScale = 0.9;
		expect(Math.abs(bounds[0].left) * fittedScale).toBeGreaterThan(canvas.width / 2);
		const scale = centredRelatedGraphScale(fittedScale, focal, bounds, canvas);
		expect(scale).toBeCloseTo((400 - 16) / 625);
		for (const node of bounds) {
			expect(Math.max(Math.abs(node.left), Math.abs(node.right)) * scale).toBeLessThanOrEqual(384);
			expect(Math.max(Math.abs(node.top), Math.abs(node.bottom)) * scale).toBeLessThanOrEqual(184);
		}
	});

	it('accounts for node size and the margin rather than only node centres', () => {
		const bounds = [{ left: 325, right: 375, top: -25, bottom: 25 }];
		expect(centredRelatedGraphScale(2, focal, bounds, canvas)).toBeCloseTo(384 / 375);
	});

	it('uses the more restrictive vertical extent on tall or asymmetric drawings', () => {
		const bounds = [{ left: -25, right: 25, top: -300, bottom: 40 }];
		expect(centredRelatedGraphScale(1, focal, bounds, canvas)).toBeCloseTo(184 / 300);
	});

	it('never increases the fitted zoom when all extents already fit', () => {
		const bounds = [{ left: -100, right: 100, top: -50, bottom: 50 }];
		expect(centredRelatedGraphScale(0.5, focal, bounds, canvas)).toBe(0.5);
	});

	it('measures extents relative to the focal position', () => {
		const bounds = [{ left: -625, right: 125, top: -300, bottom: 40 }];
		const translated = bounds.map((node) => ({
			left: node.left + 90,
			right: node.right + 90,
			top: node.top - 70,
			bottom: node.bottom - 70
		}));
		expect(centredRelatedGraphScale(1, { x: 90, y: -70 }, translated, canvas)).toBe(
			centredRelatedGraphScale(1, focal, bounds, canvas)
		);
	});

	it('retains fitted zoom for empty bounds or a hidden canvas', () => {
		expect(centredRelatedGraphScale(0.75, focal, [], canvas)).toBe(0.75);
		expect(centredRelatedGraphScale(0.75, focal, [], { width: 0, height: 0 })).toBe(0.75);
	});
});
