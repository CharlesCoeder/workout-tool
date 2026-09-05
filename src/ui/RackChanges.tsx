import { formatLb, type RackChange } from '../engine/plates';

function list(ps: number[]) {
  return ps.map(formatLb).join(' + ');
}

interface Row {
  key: string;
  name: string;
  to: number[];
  add: number[];
  remove: number[];
}

function rows(changes: RackChange[], handles: number): Row[] {
  const out: Row[] = [];
  const sig = (c: RackChange) => JSON.stringify([c.from, c.to]);
  const seen = new Map<string, Row>();
  for (const c of changes) {
    const k = sig(c);
    const existing = seen.get(k);
    if (existing) {
      existing.name = changes.length === handles && new Set(changes.map(sig)).size === 1 ? 'Both handles' : `${existing.name} & ${c.handle + 1}`;
      continue;
    }
    const row: Row = { key: k + c.handle, name: handles > 1 ? `Handle ${c.handle + 1}` : 'Handle', to: c.to, add: c.add, remove: c.remove };
    seen.set(k, row);
    out.push(row);
  }
  return out;
}

export function RackChanges({ changes, handles }: { changes: RackChange[]; handles: number }) {
  if (!changes.length) return null;
  return (
    <div className="changes">
      {rows(changes, handles).map((c) => {
        const name = c.name;
        if (!c.to.length) {
          return (
            <div className="chg" key={c.key}>
              <b>{name}:</b> <span>strip it</span>
            </div>
          );
        }
        const fresh = !c.remove.length && c.add.length === c.to.length;
        const parts: string[] = [];
        if (c.add.length) parts.push(`add ${list(c.add)}`);
        if (c.remove.length) parts.push(`take off ${list(c.remove)}`);
        return (
          <div className="chg" key={c.key}>
            <b>{name}:</b>
            <span>{fresh ? `load ${list(c.to)} each end` : `${parts.join(', ')} → ${list(c.to)} each end`}</span>
          </div>
        );
      })}
    </div>
  );
}
