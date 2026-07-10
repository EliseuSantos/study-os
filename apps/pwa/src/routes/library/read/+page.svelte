<script lang="ts">
  import { page } from '$app/state';
  import { authedFetch } from '$lib/stores/library.svelte';

  interface Article {
    url: string;
    title: string;
    markdown: string;
  }

  type Block =
    | { kind: 'heading'; level: 1 | 2 | 3; text: string }
    | { kind: 'paragraph'; text: string }
    | { kind: 'list'; items: string[] };

  const target = $derived(page.url.searchParams.get('url') ?? '');

  let article = $state<Article | null>(null);
  let error = $state<string | null>(null);
  let loading = $state(false);

  // Minimal markdown rendering — headings, paragraphs and flat lists, no lib.
  // Inline markup (links, bold) renders as plain text; the original stays a click away.
  function toBlocks(markdown: string): Block[] {
    const blocks: Block[] = [];
    for (const chunk of markdown.split(/\n{2,}/)) {
      const lines = chunk
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l !== '');
      if (lines.length === 0) continue;
      const heading = /^(#{1,3})\s+(.*)$/.exec(lines[0] ?? '');
      if (heading && lines.length === 1) {
        blocks.push({
          kind: 'heading',
          level: heading[1]?.length as 1 | 2 | 3,
          text: stripInline(heading[2] ?? ''),
        });
        continue;
      }
      if (lines.every((l) => /^([-*]|\d+[.)])\s+/.test(l))) {
        blocks.push({
          kind: 'list',
          items: lines.map((l) => stripInline(l.replace(/^([-*]|\d+[.)])\s+/, ''))),
        });
        continue;
      }
      blocks.push({ kind: 'paragraph', text: stripInline(lines.join(' ')) });
    }
    return blocks;
  }

  function stripInline(text: string): string {
    return text
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1');
  }

  const blocks = $derived(article === null ? [] : toBlocks(article.markdown));

  $effect(() => {
    const url = target;
    article = null;
    error = null;
    if (url === '') {
      error = 'artigo não encontrado.';
      return;
    }
    loading = true;
    let cancelled = false;
    void (async () => {
      try {
        const res = await authedFetch(`/proxy/firecrawl/scrape?url=${encodeURIComponent(url)}`);
        if (cancelled) return;
        if (res.status === 429) {
          error = 'limite mensal de leitura atingido — renova no próximo mês.';
        } else if (res.status === 503) {
          error = 'leitura de artigos não configurada.';
        } else if (!res.ok) {
          error = 'não foi possível carregar o artigo — abra o original.';
        } else {
          article = (await res.json()) as Article;
        }
      } catch {
        if (!cancelled) error = 'não foi possível carregar o artigo — abra o original.';
      } finally {
        if (!cancelled) loading = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  });
</script>

<svelte:head>
  <title>StudyOS — leitura</title>
</svelte:head>

<section data-testid="article-reader" class="mx-auto w-full max-w-[65ch] px-4 py-8">
  <div class="flex items-baseline justify-between gap-3">
    <a
      href="/library"
      class="type-meta text-text-mid transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
    >
      ← biblioteca
    </a>
    {#if target !== ''}
      <a
        href={target}
        target="_blank"
        rel="noopener noreferrer"
        class="type-meta text-text-mid transition-colors duration-(--dur-base) ease-brand hover:text-text-hi"
      >
        abrir original →
      </a>
    {/if}
  </div>

  {#if loading}
    <p class="type-item mt-8 text-text-soft" aria-live="polite">carregando artigo…</p>
  {:else if error !== null}
    <p class="type-item mt-8 text-text-soft">{error}</p>
  {:else if article !== null}
    <h1 data-testid="article-title" class="type-h1 mt-8 text-text-hi">{article.title}</h1>
    <article
      data-testid="article-body"
      class="mt-6 font-body text-[17px] leading-7 text-text-reading"
    >
      {#each blocks as block, i (i)}
        {#if block.kind === 'heading'}
          {#if block.level === 1}
            <h2 class="mt-8 font-display text-[22px] font-semibold text-text-hi">{block.text}</h2>
          {:else if block.level === 2}
            <h3 class="mt-6 font-display text-[19px] font-semibold text-text-hi">{block.text}</h3>
          {:else}
            <h4 class="mt-5 font-display text-[16px] font-semibold text-text-hi">{block.text}</h4>
          {/if}
        {:else if block.kind === 'list'}
          <ul class="mt-4 list-disc pl-5">
            {#each block.items as item, j (j)}
              <li class="mt-1">{item}</li>
            {/each}
          </ul>
        {:else}
          <p class="mt-4">{block.text}</p>
        {/if}
      {/each}
    </article>
  {/if}
</section>
