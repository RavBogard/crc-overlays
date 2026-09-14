'use client';

/**
 * X5 (Phase E) - the error banner, the sign-in card and the loading line that stand in front
 * of both service pages. Every string here is the one the single `/services` page showed
 * before the split; the two pages share this component rather than repeat them.
 */

import type {ReactNode} from 'react';
import SignInCard from '@/components/sign-in-card';
import type {Dashboard} from './services-data';

type Props={
 error:string;
 dashboard:Dashboard|null;
 needsSignIn:boolean;
 busy:boolean;
 onRetry:()=>void;
 children:(dashboard:Dashboard)=>ReactNode;
};

export default function ServicesGate({error,dashboard,needsSignIn,busy,onRetry,children}:Props){
 return <>
  {error&&<div className="services-error" role="alert">{error}</div>}
  {!dashboard&&needsSignIn&&!busy?<SignInCard description="Prepared services list the graphics your congregation has ready and the source material behind them. Sign in to open the service workspace." onRetry={onRetry}/>:!dashboard?<p className="services-loading">{busy?'Loading service workspace…':'Unable to load.'}</p>:children(dashboard)}
 </>;
}
