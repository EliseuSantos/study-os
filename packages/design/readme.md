# StudyOS Design System

**StudyOS** is an offline-first study platform (pt-BR) for Brazilian exam candidates ("concurseiros") and their teachers. Core loop: goals → study tracks ("trilhas") built from pasted syllabi ("editais") → daily queue ("Hoje") → focus timer sessions ("horas líquidas") → spaced-repetition flashcards (FSRS) → stats. A **Professor mode** adds curriculum authoring, versioned exports (`.studyos.json`), classroom presentation with presenter view, and live quizzes.

The brand's own words: *"Um instrumento de foco… Calma, precisa, confiante."* — an instrument of focus; calm, precise, confident.

## Sources

- **Codebase attachment**: `StudyOS/StudyOS - Direção Visual.html` — a self-contained visual-direction & layout document (v1) containing the full palette, type spec, tokens, 15+ mobile/desktop screen mocks, a component kit, light theme, and presentation mode. This is the single ground truth; everything here is lifted from it.
- No Figma, no logo files, no production app code were provided.

## Products / surfaces represented

1. **Mobile app** (390px, dark theme default) — tabs: Hoje · Trilhas · Biblioteca · Stats; plus Foco (timer), Planner, Notas, Onboarding.
2. **Desktop app** (1180px window) — sidebar nav replaces the tab bar; Trilha shows tree + topic detail side by side; fullscreen Foco.
3. **Presentation mode (professor)** — 16:9 projection slides + presenter view + live quiz (projection + student phone).

---

## CONTENT FUNDAMENTALS

- **Language**: Brazilian Portuguese throughout. Sentence case everywhere — never Title Case. Uppercase only for letter-spaced Space Grotesk labels/eyebrows (`FILA DE HOJE · 4 ITENS`, `ESTUDANDO`).
- **Voice**: speaks *to* the user as `você`, warm but economical. Greets by name: "Boa noite, Ana".
- **Calm, never punitive**: delay is replanned, not punished — *"Ontem ficou 1h pendente — redistribuída em 3 dias. Nada acumulado."* Empty states are rewards: *"Fila zerada. … descanse a memória, ela consolida dormindo."* Explicit rules in the source: *"offline é estado normal — nunca banner alarmista"*, quiz results *"sem confete"*.
- **Precise & numeric**: copy leans on tabular numbers and middots: `≈ 8 min · retenção 71%`, `2h10 / 4h`, `42 tópicos · 18 dominados`, `terça · 9 jul · dia 34 de foco`. The `·` middot is the universal separator.
- **Buttons**: verb-first, concrete: "Começar revisão · 12 cards", "Concluir sessão", "Anexar a um tópico", "Estudar agora". Secondary escape hatches are honest: "Pular — só registrar tempo".
- **No emoji. Ever.** The only pictographic character is ✓ inside checkboxes.
- **Domain vocabulary**: trilha, edital, fila, horas líquidas, retenção, constância, dominado/estudando/pendente, ciclo, cronograma, modo professor.

## VISUAL FOUNDATIONS

- **Color**: warm near-black (`#191712` bg, `#221F19` surface) with **one accent** — âmbar `#E9A94F` (oklch(.80 .13 78)). A single dry green `#86A17C` for done/success. That's the whole chromatic budget. Light theme is *"derivado dos mesmos tokens"*: warm paper `#F6F2EA`, accent darkened to `#C98A2E` for AA contrast. Docs/spec pages use a warm paper chrome (`#ECE7DD` canvas, `#FBF8F1` cards) around dark screens.
- **Type**: Space Grotesk (display, UI chrome, ALL numbers — always `font-variant-numeric: tabular-nums`) + Literata (content: topic names, flashcards, prose). Rule from the source: *"a identidade mora aqui"* — hierarchy by weight & space. Negative tracking on large display (-.02/-.03em), wide tracking (.1–.18em) on uppercase labels.
- **Signature moment**: the focus timer — huge tabular number centered in a conic-gradient amber arc; the arc is "the only living element". Pause dims the whole screen (opacity .55–.72) and the amber recedes.
- **Spacing**: 4pt grid. Screens breathe; density comes from hairline-divided lists, not boxes. *"Hairlines, não caixas dentro de caixas."*
- **Radius**: 8px único (4px micro; 6px inner pills; 16px chips; 44px phone frame; 14px desktop window).
- **Borders/hairlines**: `#2B2721` for dividers, `#3D3830` for interactive borders. Selected/next items get a 3px amber left rail + `#221F19` raised surface.
- **Shadows**: only on device frames / windows (big soft warm drop + 1px inner white top light). In-app surfaces never carry shadow in dark theme; light theme cards get a whisper (`0 1px 2px rgba(120,100,60,.06)`).
- **Backgrounds**: flat color only. No gradients except the timer's conic arc and the diagonal-stripe placeholder texture (`repeating-linear-gradient(135deg, #2B2721, #2B2721 6px, #252118 6px, #252118 12px)`) used for video thumbnails.
- **Motion**: 120–200ms, `cubic-bezier(.2,0,0,1)`, respects reduced-motion. The checklist check is "the only healthy dopamine moment · 160ms". One pulse keyframe (`scos-pulse`, 1.1s opacity .55↔1) for text cursors.
- **Selection states**: amber tint fills `rgba(233,169,79,.08–.12)` + amber border/rail; segmented controls fill the active pill solid amber with dark ink `#2B1F09`.
- **Transparency/blur**: none. Overlays are flat scrims (`#0D0C0A` at .55); sheets are solid surfaces.
- **Imagery**: none. Media thumbnails are striped-texture placeholders with a geometric play triangle. No photos, no illustrations.
- **Data-viz**: heatmap of amber alpha steps (.22/.42/.66/1 on `#2B2721`), 4px progress bars, conic timer ring. Success bars in green, warning in amber, weak in gray.

## ICONOGRAPHY

**There is no icon set.** The source deliberately uses geometric primitives instead of icons:

- Status dots: 8–11px circles/squares — solid green (done), amber ring or solid (active/review), gray outline (pending). Square = task/rotina, circle = revisão.
- Play: a pure CSS border triangle, amber.
- Checkmark: text ✓ on amber (checklist) or green (done) rounded squares.
- Drag handle: braille char `⠿`; disclosure: `▾` / `▸`; other unicode: `→`, `×`, `–`, `·`.
- Search: a simple circle outline stands in for the loupe.
- No icon font, no SVG icon library, no emoji. **When designing new screens, do not introduce Lucide/Heroicons** — compose from dots, rings, squares, triangles, and unicode characters.

**There is no logo.** The mark is a 12px amber rounded square (3px radius) + "StudyOS" in Space Grotesk 600. Never invent a logo.

## Index

- `styles.css` → `tokens/` (fonts, colors, typography, layout) — all tokens, both themes (`[data-theme="light"]`).
- `assets/fonts/` — Space Grotesk + Literata variable woff2 (latin + latin-ext).
- `guidelines/` — foundation specimen cards (Design System tab).
- `SKILL.md` — agent-skill entry point.

### Component inventory & provenance

The source's explicit kit (section 06): Item de fila (QueueItem), Flashcard, Seletor FSRS (FsrsRating), Checklist (Checkbox), Barra de meta (GoalBar), Indicador offline (OfflineIndicator). **Intentional additions** (extracted from recurring patterns in the source's screens, not invented): Button, SegmentedControl, Chip, ProgressBar, StatusDot, TabBar, Sidebar, TimerRing, Heatmap, SubjectBar — each appears in 3+ source screens with identical values.

The original React reference implementations were removed from this directory; production components are implemented in Svelte under `apps/pwa/src/lib/components/`, styled exclusively with the tokens above. The prop/enum contracts survive in `_adherence.oxlintrc.json` and `_ds_manifest.json`.
