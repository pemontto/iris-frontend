<script lang="ts">
	let {
		type,
		id,
		unavailable = false
	}: { type: string; id: number; unavailable?: boolean } = $props();
</script>

<span class="whitespace-nowrap">{type} {id}</span>
{#if unavailable}
	<span class="block text-xs text-muted-foreground" title="Details are unavailable for this item"
		>Unavailable</span
	>
{/if}
