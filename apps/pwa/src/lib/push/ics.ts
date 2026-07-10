import { DAY_MS, parseRrule, routineOccurrences, type RoutineSpec } from '@studyos/core';
import type { RoutineRow } from '@studyos/shared';

const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Floating local DTSTART: the routine's next occurrence at its start_time. */
function nextOccurrenceStamp(spec: RoutineSpec, now: number): string {
  const todayMidnight = new Date(now).setHours(0, 0, 0, 0);
  const days = routineOccurrences(spec, todayMidnight, todayMidnight + 6 * DAY_MS);
  const day = days[0] ?? todayMidnight;
  const d = new Date(day);
  const [hh = '00', mm = '00'] = spec.start_time.split(':');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${hh}${mm}00`;
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/** VCALENDAR text with one weekly VEVENT per routine (invalid rrules skipped). */
export function buildIcs(routines: RoutineRow[], now: number): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//StudyOS//planner//PT-BR'];
  for (const routine of routines) {
    let days: number[];
    try {
      days = parseRrule(routine.rrule);
    } catch {
      continue;
    }
    const spec: RoutineSpec = {
      id: routine.id,
      track_id: routine.track_id,
      days,
      start_time: routine.start_time,
      duration_min: routine.duration_min,
    };
    const byday = days
      .map((d) => BYDAY[d])
      .filter((t) => t !== undefined)
      .join(',');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${routine.id}@studyos`,
      `SUMMARY:${escapeText(routine.title)}`,
      `DTSTART:${nextOccurrenceStamp(spec, now)}`,
      `DURATION:PT${routine.duration_min}M`,
      `RRULE:FREQ=WEEKLY;BYDAY=${byday}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
