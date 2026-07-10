<script lang="ts">
  let {
    label,
    placeholder = 'ex.: princípios fundamentais',
    focusOnOpen = false,
    oncreate,
    oncancel,
  }: {
    label: string;
    placeholder?: string;
    focusOnOpen?: boolean;
    oncreate: (title: string) => Promise<void> | void;
    oncancel?: () => void;
  } = $props();

  let title = $state('');

  function init(node: HTMLInputElement) {
    if (focusOnOpen) node.focus();
  }

  function onsubmit(event: SubmitEvent) {
    event.preventDefault();
    const value = title.trim();
    if (!value) return;
    title = '';
    void oncreate(value);
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') oncancel?.();
  }
</script>

<form data-testid="topic-form" {onsubmit}>
  <label class="type-label block text-text-low" for="topic-title">{label}</label>
  <div class="mt-2 flex gap-2">
    <input
      id="topic-title"
      data-testid="topic-title-input"
      type="text"
      bind:value={title}
      {placeholder}
      autocomplete="off"
      use:init
      {onkeydown}
      class="type-item h-(--h-button-md) min-w-0 flex-1 rounded-base border border-border bg-surface px-3 text-text-body placeholder:text-text-low"
    />
    <button
      data-testid="topic-submit"
      type="submit"
      class="h-(--h-button-md) shrink-0 cursor-pointer rounded-base bg-accent px-4 font-semibold text-accent-ink transition-opacity duration-(--dur-base) ease-brand hover:opacity-90"
    >
      adicionar
    </button>
    {#if oncancel}
      <button
        type="button"
        onclick={oncancel}
        class="type-meta h-(--h-button-md) shrink-0 cursor-pointer rounded-base border border-border px-3 text-text-mid transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
      >
        cancelar
      </button>
    {/if}
  </div>
</form>
