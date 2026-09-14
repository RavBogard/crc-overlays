import {redirect} from 'next/navigation';

/* Layout pass (handoff #2, D2): the service log is the Log tab of System. The route stays so
   the links operators already have keep working. */
export default function ServiceLogPage() {
  redirect('/system#log');
}
