<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';

  // Merged into the agenda — keep old links/bookmarks working.
  onMount(() => void goto('/routines', { replaceState: true }));
</script>
