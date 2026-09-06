import { describe, expect, it } from 'vitest';
import { sessionsCsv } from './csv';
import { DEFAULT_PROGRAM } from '../engine/defaults';
import type { SessionRecord } from '../engine/types';

describe('CSV export', () => {
  it('writes one row per set with volume and escaped notes', () => {
    const s: SessionRecord = {
      id: 's1',
      dayId: 'A',
      dayName: 'Day A',
      startedAt: new Date(2026, 8, 4, 18, 5).getTime(),
      endedAt: null,
      completed: true,
      note: 'Felt "strong", oddly',
      exercises: [
        { exerciseId: 'one-arm-row', name: 'One-Arm Row', load: 'single', weightLb: 19, reps: [10, 8], note: 'grip, left' },
        { exerciseId: 'situp', name: 'Sit-Up', load: 'bodyweight', weightLb: 0, reps: [20] },
      ],
    };
    const lines = sessionsCsv([s], DEFAULT_PROGRAM).trim().split('\n');
    expect(lines[0]).toBe('date,time,day,session_id,exercise,exercise_id,load,set,weight_lb,reps,volume_lb,exercise_note,session_note');
    expect(lines[1]).toBe('2026-09-04,18:05,Day A,s1,One-Arm Row,one-arm-row,single,1,19,10,380,"grip, left","Felt ""strong"", oddly"');
    expect(lines[2]).toContain(',2,19,8,304,');
    expect(lines[3]).toContain('Sit-Up,situp,bodyweight,1,,20,0,,');
    expect(lines).toHaveLength(4);
  });
});
