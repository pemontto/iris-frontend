<script lang="ts">
	let { href, title }: { href: string; title: string } = $props();
</script>

<a
	{href}
	class="block truncate text-primary underline-offset-2 hover:underline focus-visible:underline"
	{title}
>
	{title}
</a>
