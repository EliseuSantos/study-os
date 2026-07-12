<script lang="ts">
  import { fly } from 'svelte/transition';
  import { dismissToast, toastState } from '$lib/stores/toast.svelte';
  import NavIcon from '$lib/components/NavIcon.svelte';
</script>

<div
  class="pointer-events-none fixed inset-x-0 bottom-5 z-80 flex flex-col items-center gap-2 px-4"
  aria-live="polite"
  aria-atomic="false"
>
  {#each toastState.items as toast (toast.id)}
    <div
      data-testid="toast"
      data-kind={toast.kind}
      transition:fly={{ y: 10, duration: 200 }}
      class="toast pointer-events-auto flex max-w-[420px] items-center gap-2.5 rounded-base border border-border bg-bg-deep py-2.5 pr-2 pl-3.5 {toast.kind}"
    >
      <span
        class="shrink-0 {toast.kind === 'success'
          ? 'text-success'
          : toast.kind === 'error'
            ? 'text-accent'
            : 'text-text-low'}"
      >
        <NavIcon
          name={toast.kind === 'success' ? 'check' : toast.kind === 'error' ? 'bell' : 'list'}
          size={14}
        />
      </span>
      <p class="type-item min-w-0 text-text-body">{toast.message}</p>
      <button
        type="button"
        aria-label="fechar aviso"
        onclick={() => dismissToast(toast.id)}
        class="icon-btn h-6 w-6 border-transparent"
      >
        <NavIcon name="x" size={12} />
      </button>
    </div>
  {/each}
</div>

<style>
  .toast {
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.35);
    border-left-width: 3px;
  }
  .toast.success {
    border-left-color: var(--success);
  }
  .toast.error {
    border-left-color: var(--accent);
  }
  .toast.info {
    border-left-color: var(--border);
  }
</style>
