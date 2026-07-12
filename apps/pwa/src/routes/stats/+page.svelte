<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';

  // Merged into the Hoje dashboard — keep old links/bookmarks working.
  onMount(() => void goto('/', { replaceState: true }));
</script>
