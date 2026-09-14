import {redirect} from 'next/navigation';

/* Layout pass (handoff #2, D2): workspace health is the Status tab of System. The route stays
   so bookmarks and the older Companion documentation keep working. */
export default function HealthPage() {
  redirect('/system#status');
}
