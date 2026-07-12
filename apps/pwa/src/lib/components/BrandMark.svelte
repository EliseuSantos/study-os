<script lang="ts">
  // The focus ring: a 270° sweep with the next step waiting in the gap —
  // the timer/progress signature distilled into the brand mark.
  let { size = 16 }: { size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <path
    d="M12 3.5 A8.5 8.5 0 1 1 3.5 12"
    stroke="var(--accent)"
    stroke-width="3"
    stroke-linecap="round"
  />
  <circle cx="6" cy="6" r="2" fill="var(--accent)" />
</svg>
