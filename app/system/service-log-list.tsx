'use client';

/**
 * Layout pass (handoff #2, D2) — the Log tab: the entries the Service log never showed on
 * screen, and its CSV export. The entry form is gone from here; notes now come from the one
 * text box in the status dot, which attaches the time, the on-air graphic and the connection
 * state by itself.
 */

import {useServicesDashboard} from '../services/use-services-dashboard';
import '../services/services.css';

const when = (value: number) => new Intl.DateTimeFormat(undefined, {dateStyle: 'medium', timeStyle: 'short'}).format(value);

export default function ServiceLogList() {
  const {dashboard, error, busy, needsSignIn} = useServicesDashboard();
  if (needsSignIn) return <p className="empty-card">Sign in again to read the log.</p>;
  if (error) return <p className="empty-card">{error}</p>;
  if (!dashboard) return <p className="empty-card">{busy ? 'Loading the log…' : 'The log is unavailable.'}</p>;
  const entries = dashboard.feedback;
  return <section className="feedback-section">
    <div className="section-heading">
      <div><h2>What operators reported</h2><p>Every note sent from the status dot, newest first.</p></div>
      <a className="export-link" href="/api/services?export=feedback.csv">Export CSV</a>
    </div>
    {entries.length === 0
      ? <p className="empty-card">No notes yet.</p>
      : <div className="feedback-list">{entries.map(item => <article key={item.id}><span>{item.kind} · {item.impact}</span><strong>{item.context}</strong><p>{item.reason}</p><small>{when(item.createdAt)}</small></article>)}</div>}
  </section>;
}
