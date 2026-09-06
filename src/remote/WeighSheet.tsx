import { BottomSheet } from './Sheet';
import { WeighIn } from '../body/BodyPage';
import { Link } from '../lib/router';

/** Morning weigh-in from the phone's home screen. */
export function WeighSheet({ onClose, onDone }: { onClose: () => void; onDone: (m: string) => void }) {
  return (
    <BottomSheet onClose={onClose} title="Body weight">
      <WeighIn
        compact
        onSaved={(lb) => {
          onDone(`Logged ${lb.toFixed(1)} lb`);
          onClose();
        }}
      />
      <p className="faint" style={{ fontSize: 13, margin: 0 }}>
        Trend and history are on the <Link to="/body">Body</Link> page.
      </p>
    </BottomSheet>
  );
}
