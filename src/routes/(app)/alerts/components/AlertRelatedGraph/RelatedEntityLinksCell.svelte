<script lang="ts">
	let { linkedThroughValues }: { linkedThroughValues: string[] } = $props();
</script>

{#each linkedThroughValues as value (value)}
	<span class="block [overflow-wrap:anywhere]" title={value}>{value}</span>
{/each}
