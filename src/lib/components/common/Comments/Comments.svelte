<script lang="ts">
	import { formatDate, formatTime } from '$lib/utils/time-formatter';
	import { SquarePenIcon, Trash2Icon } from 'lucide-svelte';
	import type { Comment } from '$lib/services/comments.service';
	import UserAvatar from '$lib/components/common/UserAvatar.svelte';
	import { MarkDownPreview } from '../MarkDown';

	type Props = {
		comments: Comment[];
		onDelete: (commentId: number) => void;
		onEdit: (commentId: number) => void;
		selected?: number | null;
	};

	let { comments, onDelete, onEdit, selected }: Props = $props();

	let sortedComments = $derived(
		[...comments].sort(
			(a, b) => new Date(a.comment_date).getTime() - new Date(b.comment_date).getTime()
		)
	);
</script>

<ul class="flex flex-col gap-2">
	{#each sortedComments as comment}
		<li
			class={`rounded-lg border bg-muted/20 px-3 py-2.5 transition-colors ${selected === comment.comment_id ? 'border-orange-400/60 bg-orange-50/10' : 'border-border/40'}`}
		>
			<div class="flex items-center justify-between gap-2">
				<div class="flex items-center gap-2">
					<UserAvatar
						userId={comment.user.user_id ?? comment.user.id}
						name={comment.user.user_name}
						size="size-6"
					/>

					<span class="text-2xs font-medium text-foreground">{comment.user.user_name}</span>

					<span class="text-2xs text-muted-foreground">
						{formatDate(comment.comment_date)}
						{formatTime(comment.comment_date, {
							hour: '2-digit',
							minute: '2-digit'
						})}
					</span>
				</div>

				<div class="flex items-center gap-1.5">
					<button
						class="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
						onclick={() => onEdit(comment.comment_id)}
					>
						<SquarePenIcon size="12" />
					</button>

					{#if !comment.comment_is_immutable}
						<button
							class="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-red-500"
							onclick={() => onDelete(comment.comment_id)}
						>
							<Trash2Icon size="12" />
						</button>
					{/if}
				</div>
			</div>

			<div class="mt-1.5 pl-8 text-xs [&_.prose]:text-xs">
				<MarkDownPreview markdown={comment.comment_text} />
			</div>

			{#if comment.comment_revisions?.length}
				<details class="ml-8 mt-2 text-2xs text-muted-foreground">
					<summary class="cursor-pointer"
						>Edited · {comment.comment_revisions.length} previous {comment.comment_revisions
							.length === 1
							? 'version'
							: 'versions'}</summary
					>
					<ol class="mt-2 flex flex-col gap-2 border-l pl-3">
						{#each comment.comment_revisions as revision, index}
							<li>
								<div class="mb-1">
									Version {index + 1}{revision.user_name ? ` · ${revision.user_name}` : ''} · {new Date(
										revision.comment_date
									).toLocaleString()}
								</div>
								<div class="text-xs [&_.prose]:text-xs">
									<MarkDownPreview markdown={revision.comment_text ?? ''} />
								</div>
							</li>
						{/each}
					</ol>
				</details>
			{/if}
		</li>
	{/each}
</ul>
