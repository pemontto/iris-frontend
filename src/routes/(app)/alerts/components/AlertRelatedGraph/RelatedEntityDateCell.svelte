<script lang="ts" module>
	import { formatDate, mediumDateTimeFormatter } from '$lib/utils/time-formatter';

	export const formatRelatedEntityDate = (date: string | null): string => {
		if (!date) return '-';
		return /^\d{4}-\d{2}-\d{2}$/.test(date.trim())
			? formatDate(date, { dateStyle: 'medium' })
			: mediumDateTimeFormatter(date);
	};
</script>

<script lang="ts">
	let { date }: { date: string | null } = $props();
	const formatted = $derived(formatRelatedEntityDate(date));
</script>

<span class="block truncate" title={formatted}>{formatted}</span>
