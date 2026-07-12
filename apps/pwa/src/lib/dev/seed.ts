// Demo seed: populates the local db through the real repo layer (oplog intact,
// so everything also syncs). Dev tool — run from the browser console:
//   (await import('/src/lib/dev/seed.ts')).seedDemo()
import {
  attachContent,
  createCard,
  createGoal,
  createLesson,
  addLessonItem,
  createReminder,
  createRoutine,
  createTarget,
  createTopicTree,
  createTrack,
  getOrCreateDeviceId,
  listTopics,
  localWrite,
  setCycleSlots,
  setTopicStatus,
  updateGoal,
  updateTrack,
} from '@studyos/db';
import { newId, type FsrsStateRow, type SessionRow } from '@studyos/shared';
import { getDb } from '$lib/db/client';

const DAY = 86_400_000;

// deterministic LCG so re-runs look the same
let randState = 42;
function rand(): number {
  randState = (randState * 1_103_515_245 + 12_345) % 2_147_483_648;
  return randState / 2_147_483_648;
}
function pick<T>(arr: T[]): T {
  const item = arr[Math.floor(rand() * arr.length)];
  if (item === undefined) throw new Error('pick from empty array');
  return item;
}
function between(min: number, max: number): number {
  return Math.floor(min + rand() * (max - min));
}

const TRACKS: { title: string; topics: [string, string[]][] }[] = [
  {
    title: 'Direito Constitucional — TRF',
    topics: [
      ['Princípios fundamentais', ['Fundamentos da república', 'Separação dos poderes']],
      [
        'Direitos e garantias fundamentais',
        ['Direitos individuais', 'Direitos sociais', 'Nacionalidade', 'Direitos políticos'],
      ],
      ['Organização do Estado', ['União', 'Estados e municípios', 'Intervenção federal']],
      ['Organização dos poderes', ['Poder legislativo', 'Poder executivo', 'Poder judiciário']],
      ['Controle de constitucionalidade', ['Difuso', 'Concentrado', 'ADI, ADC e ADPF']],
    ],
  },
  {
    title: 'Português para concursos',
    topics: [
      ['Morfologia', ['Classes de palavras', 'Formação de palavras']],
      ['Sintaxe', ['Período simples', 'Período composto', 'Concordância', 'Regência', 'Crase']],
      ['Interpretação de texto', ['Tipologia textual', 'Coesão e coerência']],
      ['Ortografia e acentuação', []],
    ],
  },
  {
    title: 'Raciocínio lógico',
    topics: [
      ['Lógica proposicional', ['Conectivos', 'Tabelas-verdade', 'Equivalências', 'Negações']],
      ['Argumentação', ['Validade de argumentos', 'Diagramas lógicos']],
      ['Matemática básica', ['Porcentagem', 'Razão e proporção', 'Regra de três']],
    ],
  },
];

const CARD_FRONTS = [
  'O que caracteriza a %s?',
  'Cite os requisitos de %s.',
  'Qual a regra geral de %s?',
  'Diferencie os casos de %s.',
  'Quando NÃO se aplica %s?',
];

export async function seedDemo(): Promise<string> {
  const db = await getDb();
  const deviceId = await getOrCreateDeviceId(db);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();

  // ---- tracks + topic trees ----
  const trackIds: string[] = [];
  const allTopicIds: { id: string; trackId: string; title: string }[] = [];
  for (const spec of TRACKS) {
    const track = await createTrack(db, deviceId, { title: spec.title });
    trackIds.push(track.id);
    await createTopicTree(
      db,
      deviceId,
      track.id,
      spec.topics.map(([title, children]) => ({
        title,
        children: children.map((c) => ({ title: c, children: [] })),
      })),
    );
    const topics = await listTopics(db, track.id);
    for (const t of topics) {
      allTopicIds.push({ id: t.id, trackId: track.id, title: t.title });
      const roll = rand();
      if (roll < 0.35) await setTopicStatus(db, deviceId, t.id, 'done');
      else if (roll < 0.55) await setTopicStatus(db, deviceId, t.id, 'studying');
    }
  }

  // first track runs on cycle mode with weighted slots
  const firstTrack = trackIds[0];
  if (firstTrack !== undefined) {
    await updateTrack(db, deviceId, firstTrack, { mode: 'cycle' });
    const cycleTopics = allTopicIds.filter((t) => t.trackId === firstTrack).slice(0, 5);
    await setCycleSlots(
      db,
      deviceId,
      firstTrack,
      cycleTopics.map((t, i) => ({ topic_id: t.id, weight: i < 2 ? 2 : 1 })),
    );
  }

  // ---- cards + fsrs state (mix of overdue, due today and future) ----
  let cards = 0;
  for (const topic of allTopicIds) {
    if (rand() < 0.4) continue;
    const n = between(1, 4);
    for (let i = 0; i < n; i++) {
      const front = pick(CARD_FRONTS).replace('%s', topic.title.toLowerCase());
      const card = await createCard(db, deviceId, {
        topic_id: topic.id,
        front_md: front,
        back_md: `Resposta modelo sobre **${topic.title.toLowerCase()}** — revisar na dúvida.`,
      });
      cards += 1;
      const reps = between(1, 9);
      const dueRoll = rand();
      const dueAt =
        dueRoll < 0.25
          ? todayMs - between(1, 5) * DAY // overdue
          : dueRoll < 0.5
            ? todayMs + between(8, 20) * 3_600_000 // today
            : todayMs + between(1, 21) * DAY; // future
      const state: FsrsStateRow = {
        id: newId(),
        ref_kind: 'card',
        ref_id: card.id,
        state: 'review',
        stability: 2 + rand() * 40,
        difficulty: 3 + rand() * 5,
        due_at: dueAt,
        last_review: todayMs - between(1, 12) * DAY,
        reps,
        lapses: between(0, 3),
        updated_at: todayMs - between(0, 3) * DAY,
      };
      await localWrite(db, 'fsrs_state', state as unknown as Record<string, unknown>, deviceId);
    }
  }

  // ---- 90 days of sessions (skip ~20% of days; streak alive this week) ----
  const types = ['theory', 'theory', 'questions', 'review', 'reading'];
  let sessions = 0;
  for (let d = 90; d >= 0; d--) {
    const dayStart = todayMs - d * DAY;
    const isRecent = d <= 6;
    if (!isRecent && rand() < 0.22) continue;
    const blocks = between(1, isRecent ? 4 : 3);
    for (let b = 0; b < blocks; b++) {
      const type = pick(types);
      const startedAt = Math.min(
        dayStart + between(7, 21) * 3_600_000 + between(0, 50) * 60_000,
        Date.now() - 3_600_000,
      );
      const netSeconds = between(20, 95) * 60;
      const isQuestions = type === 'questions';
      const total = isQuestions ? between(10, 40) : null;
      const session: SessionRow = {
        id: newId(),
        track_id: pick(trackIds),
        topic_id: pick(allTopicIds).id,
        type,
        started_at: startedAt,
        ended_at: startedAt + netSeconds * 1000,
        net_seconds: netSeconds,
        focused: 1,
        pages_read: type === 'reading' ? between(5, 30) : null,
        videos_watched: null,
        questions_total: total,
        questions_correct: total === null ? null : Math.round(total * (0.55 + rand() * 0.4)),
        notes: null,
        updated_at: startedAt + netSeconds * 1000,
        deleted_at: null,
      };
      await localWrite(db, 'sessions', session as unknown as Record<string, unknown>, deviceId);
      sessions += 1;
    }
  }

  // ---- routines (weekly grid) ----
  const routineSpecs: [string, string, string, number, string | null][] = [
    ['revisão de constitucional', 'FREQ=WEEKLY;BYDAY=MO,WE', '07:00', 60, trackIds[0] ?? null],
    ['questões de português', 'FREQ=WEEKLY;BYDAY=TU,TH', '19:30', 90, trackIds[1] ?? null],
    ['raciocínio lógico', 'FREQ=WEEKLY;BYDAY=FR', '08:00', 60, trackIds[2] ?? null],
    ['revisão da semana', 'FREQ=WEEKLY;BYDAY=SA', '09:00', 120, null],
    ['leitura de lei seca', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', '12:30', 30, trackIds[0] ?? null],
  ];
  for (const [title, rrule, start, dur, trackId] of routineSpecs) {
    await createRoutine(db, deviceId, {
      title,
      rrule,
      start_time: start,
      duration_min: dur,
      track_id: trackId,
    });
  }

  // ---- reminders (upcoming) ----
  await createReminder(db, deviceId, {
    title: 'inscrição do edital fecha',
    notify_at: todayMs + 3 * DAY + 10 * 3_600_000,
  });
  await createReminder(db, deviceId, {
    title: 'simulado completo',
    notify_at: todayMs + 6 * DAY + 8 * 3_600_000,
    rrule: 'FREQ=WEEKLY;BYDAY=SA',
  });
  await createReminder(db, deviceId, {
    title: 'revisar caderno de erros',
    notify_at: todayMs + 1 * DAY + 20 * 3_600_000,
  });

  // ---- goals ----
  const goalSpecs: [string, number | null, boolean][] = [
    ['passar no TRF na primeira fase', todayMs + 158 * DAY, false],
    ['fechar constitucional até setembro', todayMs + 60 * DAY, false],
    ['300 questões de português no mês', todayMs + 20 * DAY, false],
    ['manter 5 dias de foco por semana', null, false],
    ['terminar o curso de lógica', todayMs - 10 * DAY, true],
    ['montar o ciclo de estudos', null, true],
  ];
  for (const [title, target, done] of goalSpecs) {
    const goal = await createGoal(db, deviceId, { title, target_date: target });
    if (done) await updateGoal(db, deviceId, goal.id, { status: 'done' });
  }

  // ---- weekly targets (metas) ----
  await createTarget(db, deviceId, { metric: 'hours', period: 'week', value: 20 });
  await createTarget(db, deviceId, { metric: 'questions', period: 'week', value: 150 });

  // ---- saved content + a lesson ----
  const constTopics = allTopicIds.filter((t) => t.trackId === trackIds[0]);
  const contentTopic = constTopics[1] ?? allTopicIds[0];
  if (contentTopic !== undefined) {
    await attachContent(db, deviceId, {
      topic_id: contentTopic.id,
      source: 'web',
      url: 'https://pt.wikipedia.org/wiki/Controle_de_constitucionalidade',
      title: 'Controle de constitucionalidade — visão geral',
      kind: 'article',
    });
    await attachContent(db, deviceId, {
      topic_id: contentTopic.id,
      source: 'youtube',
      external_id: 'dQw4w9WgXcQ',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      title: 'Aula — direitos fundamentais em 40 minutos',
      kind: 'video',
    });
  }
  if (firstTrack !== undefined) {
    const lesson = await createLesson(db, deviceId, {
      track_id: firstTrack,
      title: 'Revisão dirigida — controle de constitucionalidade',
      estimated_duration_min: 35,
    });
    await addLessonItem(db, deviceId, {
      lesson_id: lesson.id,
      kind: 'heading',
      body_md: 'Panorama do controle',
    });
    await addLessonItem(db, deviceId, {
      lesson_id: lesson.id,
      kind: 'text',
      body_md:
        'O controle pode ser **difuso** (qualquer juiz, caso concreto) ou **concentrado** (STF, via ações diretas).',
    });
    await addLessonItem(db, deviceId, {
      lesson_id: lesson.id,
      kind: 'quiz',
      body_md: JSON.stringify({
        q: 'Quem pode exercer o controle difuso?',
        options: ['Apenas o STF', 'Qualquer juiz ou tribunal', 'Apenas tribunais superiores'],
        answer: 1,
      }),
    });
  }

  return `seed ok: ${TRACKS.length} trilhas, ${allTopicIds.length} tópicos, ${cards} cards, ${sessions} sessões`;
}

declare global {
  interface Window {
    __seedDemo?: () => Promise<string>;
  }
}
if (typeof window !== 'undefined') window.__seedDemo = seedDemo;
