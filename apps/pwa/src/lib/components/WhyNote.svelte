<script lang="ts">
  // First-touch "why" for each mechanism: one calm line, dismissed forever.
  // Flags live in local-only settings (each device shows it once).
  import { getSetting, setSettingStmt } from '@studyos/db';
  import { getDb } from '$lib/db/client';

  let { flag, text }: { flag: string; text: string } = $props();

  let visible = $state(false);

  $effect(() => {
    const key = `why_${flag}`;
    void getDb()
      .then((db) => getSetting(db, key))
      .then((seen) => {
        if (seen === null) visible = true;
      })
      .catch(() => {});
  });

  async function dismiss(): Promise<void> {
    visible = false;
    const db = await getDb();
    await db.batch([setSettingStmt(`why_${flag}`, '1')]);
  }
</script>

{#if visible}
  <div
    data-testid="why-note"
    data-flag={flag}
    class="mb-3 flex items-baseline gap-3 rounded-base border border-hairline bg-surface-2 px-3.5 py-2.5"
  >
    <p class="type-item min-w-0 flex-1 text-text-soft">{text}</p>
    <button
      data-testid="why-dismiss"
      type="button"
      onclick={() => void dismiss()}
      class="type-meta shrink-0 cursor-pointer text-text-mid transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
    >
      entendi
    </button>
  </div>
{/if}
