import type { Program, SessionRecord } from '../engine/types';
import { setVolume, setWeights } from '../engine/records';

function cell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One row per set: enough to rebuild any chart in a spreadsheet. */
export function sessionsCsv(history: SessionRecord[], program?: Program): string {
  const rows: unknown[][] = [['date', 'time', 'day', 'session_id', 'exercise', 'exercise_id', 'load', 'set', 'weight_lb', 'reps', 'volume_lb', 'exercise_note', 'session_note']];
  for (const s of [...history].sort((a, b) => a.startedAt - b.startedAt)) {
    const d = new Date(s.startedAt);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    for (const e of s.exercises) {
      const perSide = !!program?.exercises[e.exerciseId]?.perSide;
      const ws = setWeights(e);
      e.reps.forEach((reps, i) => {
        rows.push([date, time, s.dayName, s.id, e.name, e.exerciseId, e.load, i + 1, e.load === 'bodyweight' ? '' : ws[i], reps, setVolume(ws[i], reps, e.load, perSide), e.note ?? '', s.note ?? '']);
      });
    }
  }
  return rows.map((r) => r.map(cell).join(',')).join('\n') + '\n';
}

/** Hand the browser a file to save. */
export function downloadText(filename: string, text: string, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
