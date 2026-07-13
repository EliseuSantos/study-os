export interface GoalRow {
  id: string;
  title: string;
  description: string | null;
  target_date: number | null;
  /** exam mode: a dated goal linked to a track drives its retention ramp */
  track_id: string | null;
  status: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export interface TrackRow {
  id: string;
  goal_id: string | null;
  title: string;
  description: string | null;
  mode: string;
  origin: string | null;
  origin_version: string | null;
  /** guided review: teacher's focus window (ISO week) + topic ids (JSON array) */
  focus_week: string | null;
  focus_topic_ids: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export interface TopicRow {
  id: string;
  track_id: string;
  parent_id: string | null;
  title: string;
  notes_md: string | null;
  position: number;
  status: string;
  /** publisher's topic sid saved at import — merge identity across republishes */
  origin_key: string | null;
  updated_at: number;
  deleted_at: number | null;
}

export interface TopicDepRow {
  topic_id: string;
  depends_on_id: string;
}

export interface CycleSlotRow {
  id: string;
  track_id: string;
  topic_id: string;
  weight: number;
  position: number;
  updated_at: number;
  deleted_at: number | null;
}

export interface LessonRow {
  id: string;
  track_id: string;
  title: string;
  presenter_notes_md: string | null;
  estimated_duration_min: number | null;
  position: number;
  updated_at: number;
  deleted_at: number | null;
}

export interface LessonItemRow {
  id: string;
  lesson_id: string;
  topic_id: string | null;
  content_item_id: string | null;
  kind: string;
  body_md: string | null;
  /** roteiro do apresentador — nunca sai no snapshot/share */
  presenter_notes_md: string | null;
  position: number;
  updated_at: number;
  deleted_at: number | null;
}

export interface ContentItemRow {
  id: string;
  topic_id: string | null;
  source: string;
  external_id: string | null;
  url: string | null;
  title: string;
  kind: string;
  meta_json: string | null;
  added_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export interface CardRow {
  id: string;
  topic_id: string;
  kind: string;
  front_md: string;
  back_md: string | null;
  options_json: string | null;
  /** JSON CardSourceRef — where this card was born (reading, video, error log). */
  source_ref: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

/** Parsed shape of CardRow.source_ref. */
export interface CardSourceRef {
  content_item_id?: string;
  url?: string;
  /** video timestamp in seconds */
  ts?: number;
  kind?: 'reading' | 'video' | 'error';
}

export interface AnnotationRow {
  id: string;
  content_item_id: string;
  kind: string; // 'highlight' (note_md optional on it)
  anchor_json: string;
  note_md: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export interface FsrsStateRow {
  id: string;
  ref_kind: string;
  ref_id: string;
  state: string;
  stability: number;
  difficulty: number;
  due_at: number | null;
  last_review: number | null;
  reps: number;
  lapses: number;
  updated_at: number;
}

export interface ReviewLogRow {
  id: string;
  fsrs_id: string;
  rating: number;
  reviewed_at: number;
  elapsed_ms: number | null;
}

export interface RoutineRow {
  id: string;
  title: string;
  track_id: string | null;
  rrule: string;
  start_time: string;
  duration_min: number;
  active: number;
  updated_at: number;
  deleted_at: number | null;
}

export interface SessionRow {
  id: string;
  track_id: string | null;
  topic_id: string | null;
  type: string;
  started_at: number;
  ended_at: number | null;
  net_seconds: number;
  focused: number;
  pages_read: number | null;
  videos_watched: number | null;
  questions_total: number | null;
  questions_correct: number | null;
  notes: string | null;
  updated_at: number;
  deleted_at: number | null;
}

export interface ChecklistItemRow {
  id: string;
  ref_kind: string;
  ref_id: string;
  title: string;
  done: number;
  position: number;
  updated_at: number;
  deleted_at: number | null;
}

export interface TargetRow {
  id: string;
  track_id: string | null;
  metric: string;
  period: string;
  value: number;
  updated_at: number;
  deleted_at: number | null;
}

export interface ReminderRow {
  id: string;
  title: string;
  ref_kind: string | null;
  ref_id: string | null;
  notify_at: number;
  rrule: string | null;
  updated_at: number;
  deleted_at: number | null;
}

export interface SettingRow {
  key: string;
  value: string;
  updated_at: number;
}

export interface OplogRow {
  seq: number;
  tbl: string;
  row_id: string;
  op: string;
  payload: string;
  updated_at: number;
  device_id: string;
  synced: number;
}

export interface ClassRow {
  id: string;
  track_id: string;
  name: string;
  share_id: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}
