<script lang="ts">
	let { status, resolution }: { status: string; resolution: string | null } = $props();
</script>

<span class="block [overflow-wrap:anywhere]" title={status}>{status}</span>
{#if resolution}
	<span class="block truncate text-xs text-muted-foreground" title={resolution}>{resolution}</span>
{/if}
