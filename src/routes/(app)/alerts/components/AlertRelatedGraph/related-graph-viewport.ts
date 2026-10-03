type Point = { x: number; y: number };
type Bounds = { left: number; right: number; top: number; bottom: number };

export const centredRelatedGraphScale = (
	fittedScale: number,
	focal: Point,
	bounds: Bounds[],
	canvas: { width: number; height: number },
	margin = 16
) => {
	// A hidden canvas has no usable viewport; retain the last fitted scale.
	if (canvas.width <= 2 * margin || canvas.height <= 2 * margin) return fittedScale;
	let horizontalExtent = 0;
	let verticalExtent = 0;
	for (const node of bounds) {
		horizontalExtent = Math.max(
			horizontalExtent,
			Math.abs(node.left - focal.x),
			Math.abs(node.right - focal.x)
		);
		verticalExtent = Math.max(
			verticalExtent,
			Math.abs(node.top - focal.y),
			Math.abs(node.bottom - focal.y)
		);
	}
	return Math.min(
		fittedScale,
		horizontalExtent ? (canvas.width / 2 - margin) / horizontalExtent : Infinity,
		verticalExtent ? (canvas.height / 2 - margin) / verticalExtent : Infinity
	);
};
