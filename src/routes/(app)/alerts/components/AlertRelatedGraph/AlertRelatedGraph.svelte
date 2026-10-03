<script lang="ts">
	import { getContext, onMount, tick } from 'svelte';
	import { mode } from 'mode-watcher';
	import DOMPurify from 'dompurify';
	import type { IdType, Network, Options } from 'vis-network';
	import { EyeIcon, ExternalLinkIcon } from 'lucide-svelte';
	import alertSvg from 'lucide-static/icons/bell.svg?raw';
	import iocSvg from 'lucide-static/icons/link.svg?raw';
	import caseSvg from 'lucide-static/icons/briefcase-business.svg?raw';
	import caseClosedSvg from 'lucide-static/icons/briefcase-business.svg?raw';
	import { goto } from '$app/navigation';
	import { ALERTS_CTX, type AlertsContext } from '$lib/contexts/alerts.context.svelte';
	import type { Alert } from '$lib/types/resources/alert';
	import VisNetwork, {
		type VisNode,
		type VisEdge,
		svgToDataUrl,
		withStroke,
		applyAssetImageTheme
	} from '$lib/components/common/VisNetwork';
	import Button from '$lib/components/ui/button/button.svelte';
	import { openAlertPivot } from '$lib/utils/alert-pivot';
	import { AlertRelationshipsFilters, defaultAlertRelationshipsFilters } from '.';
	import { projectRelatedGraph } from './related-graph-projection';
	import {
		isFocalRelatedAlert,
		forceRelatedGraph,
		layoutRelatedGraph,
		relatedGraphLabelLines
	} from './related-graph-layout';
	import { layoutRelatedRings } from './related-graph-rings';
	import { centredRelatedGraphScale } from './related-graph-viewport';
	import {
		relatedAlertClosed,
		currentRelatedGraph,
		relatedGraphNativeLabel,
		createRelatedGraphRequests,
		type LoadedRelatedGraph
	} from './related-graph-data';
	import {
		readRelationshipPreferences,
		writeRelationshipPreferences,
		type RelationshipLayout,
		type RelationshipPlacement
	} from './relationship-layout-preference';

	type ContextMenuState = {
		open: boolean;
		x: number;
		y: number;
		node?: VisNode;
	};

	const createTooltip = (html: string) => {
		if (typeof document === 'undefined') return html;

		const el = document.createElement('div');

		el.className = 'related-alert-tooltip';
		el.innerHTML = DOMPurify.sanitize(html, {
			ALLOWED_TAGS: ['b', 'br', 'i', 'em', 'strong', 'span'],
			ALLOWED_ATTR: []
		});

		return el;
	};

	let {
		alert,
		fill = false,
		placement = 'detail'
	}: {
		alert: Pick<Alert, 'alert_id' | 'alert_title' | 'status'>;
		/** Stretch the canvas to the parent's height instead of a fixed 32rem. */
		fill?: boolean;
		placement?: RelationshipPlacement;
	} = $props();

	const alertId = $derived(alert.alert_id);
	const focalTitle = $derived(alert.alert_title);
	const focalClosed = $derived(relatedAlertClosed(alert.status));
	const alerts = getContext<AlertsContext>(ALERTS_CTX);

	const isDark = $derived($mode === 'dark');
	const strokeColor = $derived(isDark ? '#f9fafb' : '#111827');
	const caseOpenColor = $derived(isDark ? '#4ade80' : '#16a34a');
	const caseClosedColor = $derived(isDark ? '#fb923c' : '#c2410c');
	const alertClosedColor = $derived(isDark ? '#fb923c' : '#c2410c');
	const focalColor = $derived(isDark ? '#60a5fa' : '#2563eb');

	const alertIcon = $derived(svgToDataUrl(withStroke(alertSvg, strokeColor)));
	const alertClosedIcon = $derived(svgToDataUrl(withStroke(alertSvg, alertClosedColor)));
	const iocIcon = $derived(svgToDataUrl(withStroke(iocSvg, strokeColor)));
	const caseOpenIcon = $derived(svgToDataUrl(withStroke(caseSvg, caseOpenColor)));
	const caseClosedIcon = $derived(svgToDataUrl(withStroke(caseClosedSvg, caseClosedColor)));

	let loading = $state(false);
	let error = $state<string | null>(null);
	let graph = $state<LoadedRelatedGraph | null>(null);
	const requests = createRelatedGraphRequests();
	let graphContainer = $state<HTMLDivElement | null>(null);
	let canvasSize = $state({ width: 2, height: 1 });
	const aspectRatio = $derived(canvasSize.width / canvasSize.height);

	let filters = $state(defaultAlertRelationshipsFilters());
	const showFocal = $derived(focalClosed ? filters.closedAlerts : filters.openAlerts);
	let layout = $state<RelationshipLayout>('force');
	onMount(() => {
		const observer = new ResizeObserver(([entry]) => {
			const { width, height } = entry.contentRect;
			if (width && height) canvasSize = { width, height };
		});
		if (graphContainer) observer.observe(graphContainer);
		const saved = readRelationshipPreferences(placement);
		layout = saved.layout;
		return () => observer.disconnect();
	});
	const selectLayout = (next: RelationshipLayout) => {
		layout = next;
		closeContextMenu();
		writeRelationshipPreferences(placement, { layout });
	};

	let contextMenu = $state<ContextMenuState>({
		open: false,
		x: 0,
		y: 0
	});

	const displayedGraph = $derived(
		projectRelatedGraph(
			currentRelatedGraph(
				graph,
				{ id: alertId, title: focalTitle, closed: focalClosed },
				showFocal
			),
			filters
		)
	);
	const positionedGraph = $derived(
		layout === 'force'
			? forceRelatedGraph(displayedGraph, alertId)
			: layout === 'rings'
				? layoutRelatedRings(displayedGraph, alertId)
				: layoutRelatedGraph(displayedGraph, alertId, aspectRatio)
	);
	// Remount the network for every new data set, theme and selected layout. Freezing is
	// tied to `stabilizationIterationsDone`, which only fires for the
	// stabilization run at construction — fresh data fed into a live,
	// frozen network would never be laid out, and a theme change rebuilds
	// every node (see `VisNetwork`), dropping their positions.
	const layoutKey = $derived({ graph: displayedGraph, isDark, layout });
	// The `layoutKey` whose layout has settled; see `options.physics`. Raw:
	// a deep `$state` would proxy the key and never equal `layoutKey` again.
	let frozenKey = $state.raw<object | null>(null);

	const options = $derived({
		autoResize: true,
		layout: {
			improvedLayout: layout === 'force',
			randomSeed: alertId
		},
		nodes: {
			font: {
				color: strokeColor
			}
		},
		clickToUse: true,
		interaction: {
			zoomView: true,
			hover: true
		},
		// Physics only computes the initial layout, off screen: `handleReady`
		// freezes it as soon as stabilization ends. Left running, forceAtlas2 never quite
		// settles and the graph keeps drifting and spinning on its own, and
		// dragging a node drags the whole graph along with it. Keyed on the
		// layout rather than a plain flag so the next mount starts unfrozen,
		// and so an `alertId` change (which re-applies these options to the
		// still-mounted graph while the new one loads) can't wake it up.
		physics: {
			enabled: layout === 'force' && frozenKey !== layoutKey,
			solver: 'forceAtlas2Based',
			forceAtlas2Based: {
				avoidOverlap: 1
			},
			stabilization: {
				enabled: layout === 'force',
				fit: true
			}
		}
	} satisfies Options);

	const load = async () => {
		if (!alertId) return;

		const token = requests.begin();
		const loadedAlertId = alertId;
		loading = true;
		error = null;
		contextMenu = { open: false, x: 0, y: 0 };

		const data = await alerts.getRelatedAlerts(loadedAlertId, {
			open_alerts: filters.openAlerts,
			closed_alerts: filters.closedAlerts,
			open_cases: filters.openCases,
			closed_cases: filters.closedCases,
			number_of_nodes: filters.numberOfNodes,
			days_back: filters.daysBack
		});

		if (!requests.isCurrent(token, loadedAlertId, alertId)) return;

		if (!data) {
			graph = null;
			error = 'Failed to load relationships';
			loading = false;
			return;
		}

		graph = { alertId: loadedAlertId, data };
		loading = false;
	};

	$effect(() => {
		if (!alertId) return;

		load();
		return () => {
			requests.invalidate();
		};
	});

	let network = $state<Network | null>(null);
	const handleReady = (next: Network | null) => {
		network = next;
		const key = layoutKey;
		const id = alertId;
		next?.once('stabilizationIterationsDone', () => {
			// Freeze before vis starts the live simulation after this event.
			next.setOptions({ physics: { enabled: false } });
			frozenKey = key;
			tick().then(() => {
				if (network === next) centreOnFocal(next, id, true);
			});
		});
	};
	const centreOnFocal = (current: Network, id: number, fitAroundFocal = false) => {
		const point = current.getPositions([`alert_${id}`])[`alert_${id}`];
		if (!point) return;
		const fittedScale = current.getScale();
		const scale = fitAroundFocal
			? centredRelatedGraphScale(
					fittedScale,
					point,
					Object.keys(current.getPositions()).map((nodeId) => current.getBoundingBox(nodeId)),
					canvasSize
				)
			: fittedScale;
		current.moveTo({ position: point, scale });
	};
	$effect(() => {
		const current = network;
		const currentGraph = positionedGraph;
		if (layout === 'force' || !canvasSize.width) return;
		const id = alertId;
		let cancelled = false;
		let frame: number;
		let timer: ReturnType<typeof setTimeout>;
		// Refit after data changes. Centre on the next frame so the wrapper's
		// deferred ResizeObserver fit finishes first; cap zoom to keep every node visible.
		tick().then(() => {
			if (cancelled || !current || !currentGraph.nodes.length) return;
			frame = requestAnimationFrame(() => {
				timer = setTimeout(() => {
					current.fit();
					frame = requestAnimationFrame(() => centreOnFocal(current, id, true));
				});
			});
		});
		return () => {
			cancelled = true;
			cancelAnimationFrame(frame);
			clearTimeout(timer);
		};
	});
	$effect(() => {
		const current = network;
		const labelledGraph = displayedGraph;
		const colour = strokeColor;
		const background = isDark ? '#111827' : '#f9fafb';
		if (!current || layout === 'force') return;
		let hovered: IdType | null = null;
		const drawLabels = (ctx: CanvasRenderingContext2D) => {
			const scale = current.getScale();
			const positions = current.getPositions(labelledGraph.nodes.map((node) => node.id));
			for (const node of labelledGraph.nodes) {
				const lines = relatedGraphLabelLines(node, alertId, scale, node.id === hovered);
				if (!lines.length) continue;
				const point = positions[node.id];
				if (!point) continue;
				ctx.save();
				ctx.translate(point.x, point.y);
				// Canvas labels stay readable at fitted zoom without changing node bounds or positions.
				ctx.scale(1 / scale, 1 / scale);
				ctx.font = `${isFocalRelatedAlert(node, alertId) ? 'bold ' : ''}14px arial`;
				ctx.textAlign = 'center';
				ctx.textBaseline = 'top';
				ctx.fillStyle = colour;
				ctx.strokeStyle = background;
				ctx.lineWidth = 4;
				lines.forEach((line, index) => {
					const y = (isFocalRelatedAlert(node, alertId) ? 36 : 25) * scale + 6 + index * 17;
					ctx.strokeText(line, 0, y);
					ctx.fillText(line, 0, y);
				});
				ctx.restore();
			}
		};
		const hover = ({ node }: { node: IdType }) => {
			hovered = node;
			current.redraw();
		};
		const blur = () => {
			hovered = null;
			current.redraw();
		};
		current.on('afterDrawing', drawLabels);
		current.on('hoverNode', hover);
		current.on('blurNode', blur);
		current.redraw();
		return () => {
			current.off('afterDrawing', drawLabels);
			current.off('hoverNode', hover);
			current.off('blurNode', blur);
		};
	});

	const nodes = $derived(
		positionedGraph.nodes.map((node) => {
			const font = {
				color: strokeColor
			};

			const tooltip = layout === 'force' ? node.title : node.title || node.label;
			const title = tooltip?.includes('<') ? createTooltip(tooltip) : tooltip;
			const labelled = { ...node, label: relatedGraphNativeLabel(node, layout) };

			if (node.group === 'alert') {
				const isClosed = typeof node.label === 'string' && node.label.startsWith('[Closed]');
				const focal = isFocalRelatedAlert(node, alertId);
				return {
					...labelled,
					title,
					shape: focal ? 'circularImage' : 'image',
					image: isClosed ? alertClosedIcon : alertIcon,
					...(focal
						? {
								size: 36,
								borderWidth: 4,
								color: {
									border: focalColor,
									background: isDark ? '#172554' : '#dbeafe',
									highlight: { border: focalColor, background: isDark ? '#172554' : '#dbeafe' },
									hover: { border: focalColor, background: isDark ? '#172554' : '#dbeafe' }
								}
							}
						: {}),
					font
				};
			}

			if (node.group === 'ioc') {
				return {
					...labelled,
					title,
					shape: 'image',
					image: iocIcon,
					font
				};
			}

			if (node.group === 'case') {
				return {
					...labelled,
					title,
					shape: 'image',
					image:
						typeof node.label === 'string' && node.label.startsWith('[Closed]')
							? caseClosedIcon
							: caseOpenIcon,
					font
				};
			}

			if (node.group === 'asset' && typeof node.image === 'string') {
				return {
					...labelled,
					title,
					image: applyAssetImageTheme(node.image, isDark),
					font
				};
			}

			return {
				...labelled,
				title,
				font
			};
		}) as VisNode[]
	);

	const edges = $derived(positionedGraph.edges as VisEdge[]);

	const closeContextMenu = () => (contextMenu = { open: false, x: 0, y: 0 });

	const openContextMenu = (detail: { x: number; y: number; nodeId?: IdType }) => {
		if (!detail.nodeId) {
			closeContextMenu();
			return;
		}

		const node = displayedGraph.nodes.find((n) => n.id === detail.nodeId);

		if (!node) {
			closeContextMenu();
			return;
		}

		contextMenu = {
			...detail,
			open: true,
			node
		};
	};

	const getId = (nodeId: string): string => nodeId.split(/_/)[1];

	const handleNodeAction = () => {
		if (!contextMenu.node) return;

		if (contextMenu.node.group === 'case') {
			goto(`/case/${getId(contextMenu.node.id as string)}`);
		} else if (contextMenu.node.group === 'alert') {
			goto(`/alerts/${getId(contextMenu.node.id as string)}`);
		} else if (contextMenu.node.group === 'asset' || contextMenu.node.group === 'ioc') {
			// The pivot has to carry the IOC/asset *value* — that is what the alerts
			// list matches on server-side. This graph's ids do embed the value
			// (`ioc_<ioc_value>`, `asset_<asset_name>`), but `getId` splits on the
			// first underscore, so `evil_domain.com` pivoted as `evil` and matched
			// nothing. The label is the same value, whole.
			//
			// New tab, unlike the case/alert branches above: the pivot is a lookup
			// made *while* reading the graph, so keep the graph where it is. A
			// labelless node is a no-op rather than an early `return` — the menu
			// below still has to close either way.
			openAlertPivot(
				contextMenu.node.group,
				contextMenu.node.label as string | undefined,
				window.location.href
			);
		}

		closeContextMenu();
	};
</script>

<div class={fill ? 'flex h-full min-h-0 flex-col' : 'contents'}>
	<div class="mb-4 flex flex-wrap items-start justify-between gap-4">
		<AlertRelationshipsFilters bind:value={filters} />
		<div class="flex flex-wrap items-center gap-2">
			<div role="group" aria-label="Graph layout" class="flex gap-1">
				{#each [{ id: 'force', label: 'Force' }, { id: 'rings', label: 'Rings' }, { id: 'hub-and-spoke', label: 'Hub and spoke' }] as choice}
					<Button
						type="button"
						size="xs"
						variant={layout === choice.id ? 'default' : 'outline'}
						aria-pressed={layout === choice.id}
						onclick={() => selectLayout(choice.id as RelationshipLayout)}>{choice.label}</Button
					>
				{/each}
			</div>
		</div>
	</div>

	{#if layout !== 'force' && displayedGraph.nodes.length}
		<p class="mb-2 text-sm text-muted-foreground">
			{#if layout === 'rings'}
				Centre: this alert. Inner ring: its IOCs and assets (one hop). Outer rings: related alerts
				and cases (two hops). Extra rings provide space, not more hops.
			{:else if layout === 'hub-and-spoke'}
				Centre: this alert. Hubs: its IOCs and assets (one hop). Fans: related alerts and cases (two
				hops). Items between hubs share multiple indicators.
			{/if}
			Thicker edges mean more shared indicators. Hover or zoom in to read item labels.
			{#if !showFocal}
				This alert is hidden by the alert filters.
			{/if}
		</p>
	{/if}

	<div
		bind:this={graphContainer}
		class={[
			'relative w-full rounded-md border bg-muted/20',
			fill ? 'min-h-[24rem] flex-1' : 'h-[32rem]'
		]}
	>
		{#if displayedGraph.nodes.length}
			{#key layoutKey}
				<VisNetwork
					{nodes}
					{edges}
					{options}
					className="h-full w-full"
					onReady={handleReady}
					onClick={closeContextMenu}
					onContextMenu={openContextMenu}
				/>
			{/key}
		{/if}

		{#if contextMenu.open && contextMenu.node}
			<div
				class="absolute z-20 rounded-2xl border bg-background px-2 shadow-xl"
				style={`left:${contextMenu.x}px;top:${contextMenu.y}px;transform:translate(8px, 8px);`}
			>
				<!--
			  The icon says where the click lands: the eye for viewing a case or
			  alert in this tab, the external-link glyph for the pivot, which
			  opens a new tab (see `handleNodeAction`).
			-->
				{#if contextMenu.node.group === 'case' || contextMenu.node.group === 'alert'}
					<Button variant="link" size="xs" onclick={() => handleNodeAction()}>
						<EyeIcon class="size-4" />
						View {contextMenu.node.group}
						#{getId(contextMenu.node.id as string)}
					</Button>
				{:else}
					<Button
						size="xs"
						variant="link"
						title="Opens the filtered alert list in a new tab"
						onclick={() => handleNodeAction()}
					>
						<ExternalLinkIcon class="size-4" />
						Pivot on {contextMenu.node.group}
						{contextMenu.node.label}
						<span class="sr-only">(opens in a new tab)</span>
					</Button>
				{/if}
			</div>
		{/if}

		{#if loading}
			<div class="absolute inset-0 flex items-center justify-center text-sm opacity-70">
				Loading relationships...
			</div>
		{:else if error}
			<div class="absolute inset-0 flex items-center justify-center text-sm text-red-500">
				{error}
			</div>
		{:else if !displayedGraph.nodes.length}
			<div class="absolute inset-0 flex items-center justify-center text-sm opacity-70">
				No related entities found.
			</div>
		{/if}
	</div>
</div>
