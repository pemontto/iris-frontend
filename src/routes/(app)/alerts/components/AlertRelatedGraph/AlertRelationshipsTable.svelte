<script lang="ts">
	import { onDestroy } from 'svelte';
	import { renderComponent, type ColumnDef } from '@tanstack/svelte-table';
	import DataTable from '$lib/components/ui/data-table-tanstack/data-table.svelte';
	import type { RelatedAlert } from '$lib/services/alerts.service';
	import {
		relatedGraphToRows,
		sortRelatedEntityRows,
		type RelatedEntityRow,
		type RelatedEntitySort
	} from './related-graph-rows';
	import { createRelatedEntityDetailsLoader } from './related-entity-details';
	import RelatedEntityTitleCell from './RelatedEntityTitleCell.svelte';
	import RelatedEntityStatusCell from './RelatedEntityStatusCell.svelte';
	import RelatedEntityDateCell from './RelatedEntityDateCell.svelte';
	import RelatedEntityLinksCell from './RelatedEntityLinksCell.svelte';

	let {
		graph,
		alertId,
		refreshing = false,
		error = null,
		sort,
		onSortChange
	}: {
		graph: RelatedAlert;
		alertId: number;
		refreshing?: boolean;
		error?: string | null;
		sort: RelatedEntitySort;
		onSortChange: (sort: RelatedEntitySort) => void;
	} = $props();
	const controller = new AbortController();
	const loadDetails = createRelatedEntityDetailsLoader({ signal: controller.signal });
	onDestroy(() => controller.abort());
	let details = $state<Awaited<ReturnType<typeof loadDetails>> | null>(null);
	let loading = $state(false);
	const rows = $derived(
		sortRelatedEntityRows(relatedGraphToRows(graph, details?.alerts, details?.cases, alertId), sort)
	);

	$effect(() => {
		const currentGraph = graph;
		let cancelled = false;
		loading = true;
		loadDetails(relatedGraphToRows(currentGraph, [], [], alertId)).then((result) => {
			if (cancelled) return;
			details = result;
			loading = false;
		});
		return () => {
			cancelled = true;
		};
	});

	const columns: ColumnDef<RelatedEntityRow>[] = [
		{
			accessorKey: 'type',
			header: 'Type',
			meta: { thClass: 'relationship-type', tdClass: 'relationship-type' }
		},
		{ accessorKey: 'id', header: 'ID', meta: { thClass: 'w-16', tdClass: 'tabular-nums' } },
		{
			accessorKey: 'title',
			header: 'Title',
			meta: { thClass: 'relationship-title', tdClass: 'max-w-0' },
			cell: (cell) => renderComponent(RelatedEntityTitleCell, cell.row.original)
		},
		{
			accessorKey: 'status',
			header: 'Status',
			meta: { thClass: 'w-28', tdClass: 'max-w-0' },
			cell: (cell) => renderComponent(RelatedEntityStatusCell, cell.row.original)
		},
		{
			accessorKey: 'linkedThrough',
			header: 'Linked through',
			meta: { tdClass: 'max-w-0' },
			cell: (cell) => renderComponent(RelatedEntityLinksCell, cell.row.original)
		},
		{
			accessorKey: 'date',
			header: 'Date',
			meta: { thClass: 'relationship-date', tdClass: 'relationship-date max-w-0' },
			cell: (cell) => renderComponent(RelatedEntityDateCell, cell.row.original)
		}
	];
</script>

<div class="relationship-table min-w-0 rounded-md border bg-card p-2">
	{#if error}
		<p role="alert" class="p-2 text-sm text-red-500">{error}</p>
	{:else}
		{#if refreshing}
			<p role="status" class="p-2 text-sm text-muted-foreground">Loading relationships...</p>
		{:else if loading}
			<p role="status" class="p-2 text-sm text-muted-foreground">Loading relationship details...</p>
		{:else if details?.incomplete}
			<p role="status" class="p-2 text-sm text-muted-foreground">
				Some details could not be loaded. Graph labels are shown where details are unavailable.
			</p>
		{/if}
		{#if rows.length}
			<DataTable
				columns={columns as ColumnDef<unknown>[]}
				data={rows}
				tableClass="w-full table-fixed text-sm"
				{sort}
				onSortChange={(next) => onSortChange(next as RelatedEntitySort)}
				pageSize={25}
				showColumnFilters={false}
			/>
		{:else if !refreshing && !loading}
			<p class="p-4 text-center text-sm text-muted-foreground">No related alerts or cases found.</p>
		{/if}
	{/if}
</div>

<style>
	.relationship-table {
		container-type: inline-size;
	}
	.relationship-table :global(th.relationship-type) {
		width: 6rem;
	}
	.relationship-table :global(th.relationship-title) {
		width: 22%;
	}
	.relationship-table :global(th.relationship-date) {
		width: 10rem;
	}
	@container (max-width: 44rem) {
		.relationship-table :global(.relationship-type),
		.relationship-table :global(.relationship-date) {
			display: none;
		}
		.relationship-table :global(th.relationship-title) {
			width: 28%;
		}
	}
</style>
