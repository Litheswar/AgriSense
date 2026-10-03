import { AlertCircle, LoaderCircle, Sprout } from 'lucide-react';

export function LoadingState({ label = 'Loading…', fullPage = false }) {
  return <div className={`loading-state${fullPage ? ' loading-state--full' : ''}`} role="status" aria-live="polite"><LoaderCircle size={20} className="spin" aria-hidden="true" /><span>{label}</span></div>;
}

export function ErrorState({ title = 'Something went wrong', message, onRetry }) {
  return (
    <div className="feedback-card feedback-card--error" role="alert">
      <span className="feedback-icon"><AlertCircle size={19} /></span>
      <div><strong>{title}</strong><p>{message || 'We could not load this information right now.'}</p></div>
      {onRetry && <button type="button" className="text-button" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function EmptyState({ title, message, action }) {
  return (
    <div className="empty-state">
      <span className="empty-state__icon"><Sprout size={23} /></span>
      <h3>{title}</h3><p>{message}</p>{action}
    </div>
  );
}
