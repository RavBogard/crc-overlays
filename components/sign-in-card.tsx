'use client';

/* One sign-in story (I2). Every gated page that gets a 401 shows this same card, so the
   account path — not a control key, not a blank page — is the visible way back in.
   One card, one place: /health, /services, /sources-review and the author fit check all
   import it from here, so the sign-in wording can never drift between them. */
import Link from 'next/link';
import './sign-in-card.css';

export default function SignInCard({description, onRetry}: {description: string; onRetry?: () => void}) {
  return <section className="sign-in-card">
    <h2>Sign in to continue</h2>
    <p>{description}</p>
    <Link href="/access">Open account</Link>
    {onRetry && <button type="button" onClick={onRetry}>Try again</button>}
  </section>;
}
