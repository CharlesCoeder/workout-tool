const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Seven pills, Monday to Sunday: filled for days with a session, dashed for days still to come. */
export function WeekDots({ days, today }: { days: number[]; today: number }) {
  return (
    <div className="weekdots">
      {DAY_LETTERS.map((l, i) => {
        const done = days.includes(i);
        const cls = done ? 'done' : i > today ? 'future' : '';
        return (
          <div key={i} className={`wd ${cls} ${i === today ? 'today' : ''}`}>
            <i />
            <span>{l}</span>
          </div>
        );
      })}
    </div>
  );
}
