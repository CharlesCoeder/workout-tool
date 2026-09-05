import { formatLb } from '../engine/plates';

/**
 * A dumbbell drawn from the plates on one end, mirrored. Sized by font-size of
 * the container, so it scales from phone to TV.
 */
export function PlateBar({ perEnd, tone = '' }: { perEnd: number[]; tone?: 'accent' | 'dim' | '' }) {
  const heavy = Math.max(5, ...perEnd);
  const plates = [...perEnd].sort((a, b) => b - a); // inside-out: heaviest nearest the grip
  const side = (reverse: boolean) => {
    const list = reverse ? [...plates].reverse() : plates;
    return list.map((p, i) => (
      <div key={i} className="plate" style={{ height: `${0.45 + (p / heavy) * 0.55}em` }} title={formatLb(p)} />
    ));
  };
  return (
    <div className={`plates ${tone}`} aria-label={plates.length ? `${plates.map(formatLb).join(' + ')} each end` : 'empty handle'}>
      <div className="collar" />
      {side(true)}
      <div className="bar" />
      <div className="grip" />
      <div className="bar" />
      {side(false)}
      <div className="collar" />
    </div>
  );
}
