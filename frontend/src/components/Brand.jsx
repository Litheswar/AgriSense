import { Sprout } from 'lucide-react';

export function Brand({ inverse = false, compact = false }) {
  return (
    <span className={`brand${inverse ? ' brand--inverse' : ''}${compact ? ' brand--compact' : ''}`}>
      <span className="brand__mark"><Sprout size={21} strokeWidth={2.1} aria-hidden="true" /></span>
      <span className="brand__word">Agri<span>Sense</span><small>FARM INTELLIGENCE</small></span>
    </span>
  );
}
