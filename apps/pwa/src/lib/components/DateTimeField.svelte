<script lang="ts">
  // flatpickr wrapper themed to the brand tokens — replaces the native
  // datetime-local input (whose popup ignores the app theme entirely).
  import { onDestroy, onMount } from 'svelte';
  import flatpickr from 'flatpickr';
  import { Portuguese } from 'flatpickr/dist/l10n/pt';
  import 'flatpickr/dist/flatpickr.css';

  let {
    value = $bindable(null),
    id,
    testid,
    ariaLabel,
    placeholder = 'escolha data e hora',
  }: {
    value?: number | null; // epoch ms
    id?: string;
    testid?: string;
    ariaLabel?: string;
    placeholder?: string;
  } = $props();

  let input = $state<HTMLInputElement | null>(null);
  let fp: flatpickr.Instance | null = null;
  // Distinguishes picker-driven updates from external value changes.
  let internal = false;

  onMount(() => {
    if (input === null) return;
    fp = flatpickr(input, {
      enableTime: true,
      time_24hr: true,
      minuteIncrement: 5,
      dateFormat: 'D · d M · H:i',
      // typing/pasting works too — ISO-like strings parse directly
      allowInput: true,
      parseDate: (str, fmt) => {
        const iso = new Date(str);
        if (!Number.isNaN(iso.getTime())) return iso;
        return flatpickr.parseDate(str, fmt) ?? new Date();
      },
      locale: Portuguese,
      ...(value !== null ? { defaultDate: value } : {}),
      onChange: (dates) => {
        internal = true;
        value = dates[0] ? dates[0].getTime() : null;
      },
    });
  });

  $effect(() => {
    const next = value;
    if (internal) {
      internal = false;
      return;
    }
    if (fp === null) return;
    if (next === null) fp.clear(false);
    else fp.setDate(next, false);
  });

  onDestroy(() => fp?.destroy());
</script>

<input
  bind:this={input}
  {id}
  data-testid={testid}
  type="text"
  aria-label={ariaLabel}
  {placeholder}
  autocomplete="off"
  class="type-item h-(--h-button-md) w-full cursor-pointer rounded-base border border-border bg-surface px-3 text-text-body placeholder:text-text-low"
/>

<style>
  /* brand theme for the flatpickr popup */
  :global(.flatpickr-calendar) {
    background: var(--bg-deep);
    border: 1px solid var(--border);
    border-radius: var(--radius-panel);
    box-shadow: 0 12px 32px rgb(0 0 0 / 0.35);
    font-family: var(--font-display);
    color: var(--text-body);
  }
  :global(.flatpickr-calendar.arrowTop::before),
  :global(.flatpickr-calendar.arrowTop::after),
  :global(.flatpickr-calendar.arrowBottom::before),
  :global(.flatpickr-calendar.arrowBottom::after) {
    display: none;
  }
  :global(.flatpickr-months .flatpickr-month),
  :global(.flatpickr-current-month),
  :global(.flatpickr-monthDropdown-months),
  :global(.flatpickr-current-month input.cur-year) {
    background: transparent;
    color: var(--text-hi);
    fill: var(--text-hi);
  }
  :global(.flatpickr-months .flatpickr-prev-month),
  :global(.flatpickr-months .flatpickr-next-month) {
    color: var(--text-low);
    fill: var(--text-low);
  }
  :global(.flatpickr-months .flatpickr-prev-month:hover svg),
  :global(.flatpickr-months .flatpickr-next-month:hover svg) {
    fill: var(--accent);
  }
  :global(span.flatpickr-weekday) {
    background: transparent;
    color: var(--text-low);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  :global(.flatpickr-day) {
    color: var(--text-body);
    border-radius: var(--radius-base);
    font-variant-numeric: tabular-nums;
  }
  :global(.flatpickr-day:hover),
  :global(.flatpickr-day.prevMonthDay:hover),
  :global(.flatpickr-day.nextMonthDay:hover) {
    background: var(--surface);
    border-color: var(--surface);
  }
  :global(.flatpickr-day.today) {
    border-color: var(--accent);
  }
  :global(.flatpickr-day.selected),
  :global(.flatpickr-day.selected:hover) {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-ink);
  }
  :global(.flatpickr-day.prevMonthDay),
  :global(.flatpickr-day.nextMonthDay),
  :global(.flatpickr-day.flatpickr-disabled) {
    color: var(--text-low);
  }
  :global(.flatpickr-time) {
    border-top: 1px solid var(--hairline) !important;
  }
  :global(.flatpickr-time input),
  :global(.flatpickr-time .flatpickr-time-separator),
  :global(.flatpickr-time .flatpickr-am-pm) {
    background: transparent;
    color: var(--text-hi);
    font-variant-numeric: tabular-nums;
  }
  :global(.flatpickr-time input:hover),
  :global(.flatpickr-time input:focus) {
    background: var(--surface);
  }
  :global(.numInputWrapper span) {
    border-color: var(--hairline);
  }
  :global(.numInputWrapper span.arrowUp::after) {
    border-bottom-color: var(--text-low);
  }
  :global(.numInputWrapper span.arrowDown::after) {
    border-top-color: var(--text-low);
  }
</style>
