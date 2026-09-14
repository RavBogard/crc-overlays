'use client';

/**
 * X5 (Phase E) - Service log: the fallback/issue form and the CSV export, split out of
 * `/services` so the console's disconnected banner has one short page to send an operator to
 * mid-service. It reads the same dashboard the Prepared services page reads.
 */

import WorkspaceHeader from '@/components/workspace-header';
import ServiceLogPanel from '../service-log-panel';
import ServicesGate from '../services-gate';
import {useServicesDashboard} from '../use-services-dashboard';
import '../services.css';

export default function ServiceLogPage(){
 const {dashboard,error,busy,role,needsSignIn,setNeedsSignIn,load,perform}=useServicesDashboard();
 return <main className="services-shell">
  <WorkspaceHeader current="/services/log" title="Service log" role={role}/>
  <ServicesGate error={error} dashboard={dashboard} needsSignIn={needsSignIn} busy={busy} onRetry={()=>{setNeedsSignIn(false);void load()}}>{dashboard=>
   <ServiceLogPanel dashboard={dashboard} busy={busy} perform={perform}/>
  }</ServicesGate>
 </main>
}
