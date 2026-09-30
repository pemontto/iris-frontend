<script lang="ts">
	let { linkedThroughValues }: { linkedThroughValues: string[] } = $props();
</script>

{#each linkedThroughValues.slice(0, 2) as value (value)}
	<span class="block [overflow-wrap:anywhere]" title={value}>{value}</span>
{/each}

{#if linkedThroughValues.length > 2}
	<span class="block text-xs text-muted-foreground" title={linkedThroughValues.slice(2).join('\n')}
		>+{linkedThroughValues.length - 2} more</span
	>
{/if}
