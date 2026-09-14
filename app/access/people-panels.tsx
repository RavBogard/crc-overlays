'use client';
/* This panel loads itself on mount, so the first render is intentionally empty and upgrades
   from an effect. */
/* eslint-disable react-hooks/set-state-in-effect */

/**
 * Layout pass (handoff #2, D2) — People, moved out of Account and onto the System page.
 *
 * Account keeps what belongs to the person signed in: their password and their Google
 * sign-in. Everything about *other* people — invitations, who has access, and the devices
 * that hold their own credential — is administration, and lives here. The markup, the strings
 * and the requests are the ones the Account page used; only their address changed.
 */

import {Copy, MonitorUp, ShieldCheck, UserMinus, UserPlus, Users} from 'lucide-react';
import {useCallback, useEffect, useState} from 'react';
import {DEVICE_REVOKED_NOTICE, activeDevices, deviceKindLabel, deviceStandingText, readDeviceList, type PairedDevice} from './devices-copy';
import {memberStanding, requestAgeText, standingText, type PendingInvitation} from './member-status';
import './access.css';

type Role = 'owner' | 'editor' | 'operator';
type Member = {id: string; name: string; email: string; role: Role; enabled: boolean};
type AccessRequest = {id: string; email: string; name: string; requestedAt: number; lastSeenAt: number; attempts: number};
type ApiBody = {user?: Member | null; members?: Member[]; member?: Member; invitations?: PendingInvitation[]; requests?: AccessRequest[]; url?: string; error?: string};

const roleLabel: Record<Role, string> = {owner: 'Administrator', editor: 'Editor', operator: 'Operator'};

async function bodyOf(response: Response): Promise<ApiBody> {
  try { return await response.json() as ApiBody; } catch { return {error: 'The server returned an unreadable response.'}; }
}

export default function PeoplePanels() {
  const [user, setUser] = useState<Member | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [devices, setDevices] = useState<PairedDevice[]>([]);
  const [deviceRevision, setDeviceRevision] = useState(0);
  const [deviceMessage, setDeviceMessage] = useState('');
  const [deviceMessageKind, setDeviceMessageKind] = useState<'error' | 'success'>('success');
  const [requestRoles, setRequestRoles] = useState<Record<string, Role>>({});
  const [message, setMessage] = useState('');
  const [messageKind, setMessageKind] = useState<'error' | 'success'>('success');
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('editor');
  const [now, setNow] = useState(0);

  const notice = (text: string, kind: 'error' | 'success' = 'success') => { setMessage(text); setMessageKind(kind); };
  const deviceNotice = (text: string, kind: 'error' | 'success' = 'success') => { setDeviceMessage(text); setDeviceMessageKind(kind); };

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/access?manage=1', {cache: 'no-store'});
      const body = await bodyOf(response);
      if (!response.ok) throw Error(body.error || 'Your sign-in could not be checked.');
      setUser(body.user ?? null);
      setMembers(body.members ?? []);
      setInvitations(body.invitations ?? []);
      setRequests(body.requests ?? []);
      setNow(Date.now());
    } catch (error) {
      notice(error instanceof Error ? error.message : 'Your sign-in could not be checked.', 'error');
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  // The device list is its own read: /api/devices is a separate route, and a workspace whose
  // migrations have not run yet must not break the members and requests panels above.
  useEffect(() => {
    if (user?.role !== 'owner') return;
    let active = true;
    void (async () => {
      try {
        const response = await fetch('/api/devices', {cache: 'no-store'});
        if (!response.ok) return;
        const body = await response.json() as unknown;
        if (active) { setDevices(readDeviceList(body)); setNow(Date.now()); }
      } catch {}
    })();
    return () => { active = false; };
  }, [user?.role, deviceRevision]);

  async function revokeDevice(device: PairedDevice) {
    setBusy(true); setDeviceMessage('');
    try {
      const response = await fetch('/api/devices', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action: 'revoke', id: device.id})});
      const body = await bodyOf(response);
      if (!response.ok) throw Error(body.error || 'This action could not be completed.');
      deviceNotice(DEVICE_REVOKED_NOTICE);
      setDeviceRevision(revision => revision + 1);
    } catch (error) {
      deviceNotice(error instanceof Error ? error.message : 'Connection unavailable.', 'error');
    } finally { setBusy(false); }
  }

  async function act(payload: Record<string, unknown>) {
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/access', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)});
      const body = await bodyOf(response);
      if (!response.ok) throw Error(body.error || 'This action could not be completed.');
      if (payload.action === 'approve_request') notice(`${body.member?.name ?? 'Member'} approved. Continue with Google now signs them in.`);
      else if (payload.action === 'decline_request') notice('Request declined. Nothing else changed.');
      else if (payload.action === 'set_role') notice(`${body.member?.name ?? 'Member'} is now ${roleLabel[body.member?.role ?? 'editor']}.`);
      else if (payload.action === 'restore') notice(`${body.member?.name ?? 'Member'} can sign in again.`);
      else if (body.url) {
        setInvite(body.url);
        setName(''); setEmail(''); setRole('editor');
        notice('Private sign-in link ready. It expires in 24 hours and works once.');
      }
      await refresh();
    } catch (error) {
      notice(error instanceof Error ? error.message : 'Connection unavailable.', 'error');
    } finally { setBusy(false); }
  }

  async function copyInvite() {
    try { await navigator.clipboard.writeText(invite); notice('Private sign-in link copied.'); }
    catch { notice('Copy was blocked. Select the link below and copy it manually.', 'error'); }
  }

  if (user && user.role !== 'owner') return <p className="member-empty">People is managed by an administrator.</p>;

  return <div className="access-page access-embedded">
    {message && <div className={`access-notice ${messageKind}`} role={messageKind === 'error' ? 'alert' : 'status'}><span><ShieldCheck size={16}/></span>{message}</div>}

    {requests.length > 0 && <section className="access-panel access-requests">
      <div className="access-panel-heading"><span><UserPlus size={18}/></span><div><h2>Waiting for approval</h2><p>These people signed in with Google but aren’t members yet. Approving one creates their membership and links that Google account.</p></div></div>
      <div className="member-list">{requests.map(request => <article className="member-row request-row" key={request.id}><div className="member-avatar" aria-hidden>{(request.name || request.email).slice(0, 1).toUpperCase()}</div><div><strong>{request.name || request.email}</strong><small>{request.email}</small><span>Asked {requestAgeText(request.requestedAt, now)}{request.attempts > 1 ? ` · tried ${request.attempts} times` : ''}</span></div><div className="member-actions"><select aria-label={`Access for ${request.name || request.email}`} value={requestRoles[request.id] ?? 'editor'} disabled={busy} onChange={event => setRequestRoles(current => ({...current, [request.id]: event.target.value as Role}))}><option value="editor">Editor</option><option value="operator">Operator</option><option value="owner">Administrator</option></select><button className="access-primary member-approve" disabled={busy} onClick={() => void act({action: 'approve_request', requestId: request.id, role: requestRoles[request.id] ?? 'editor'})}>Approve</button><button className="member-remove" disabled={busy} onClick={() => void act({action: 'decline_request', requestId: request.id})}>Decline</button></div></article>)}</div>
    </section>}

    <div className="access-owner-grid">
      <section className="access-panel">
        <div className="access-panel-heading"><span><Users size={18}/></span><div><h2>Invite someone</h2><p>Create a private, one-time link. Nothing is sent automatically.</p></div></div>
        <form onSubmit={event => { event.preventDefault(); void act({action: 'invite', name, email, role}); }}>
          <label>Name<input required value={name} onChange={event => setName(event.target.value)} maxLength={80} autoComplete="name"/></label>
          <label>Email<input required type="email" value={email} onChange={event => setEmail(event.target.value)} maxLength={200} autoComplete="email"/></label>
          <label>Access<select value={role} onChange={event => setRole(event.target.value as Role)}><option value="editor">Editor — create, publish, and operate</option><option value="operator">Operator — use approved graphics</option><option value="owner">Administrator — manage people and graphics</option></select></label>
          <button className="access-primary" disabled={busy}>Create private link</button>
        </form>
        {invite && <div className="invite-result"><div><strong>Ready to share</strong><small>Expires in 24 hours · works once</small></div><button onClick={() => void copyInvite()}><Copy size={15}/>Copy link</button><input aria-label="Private sign-in link" readOnly value={invite} onFocus={event => event.currentTarget.select()}/></div>}
      </section>

      <section className="access-panel member-panel">
        <div className="access-panel-heading"><span><ShieldCheck size={18}/></span><div><h2>People with access</h2><p>Change someone’s access with the menu, or remove them. Removing access ends their sessions and links; Restore brings a removed person back with the same role.</p></div></div>
        <div className="member-list">{members.length ? members.map(member => <article className="member-row" key={member.id}><div className="member-avatar" aria-hidden>{member.name.slice(0, 1).toUpperCase()}</div><div><strong>{member.name}</strong><small>{member.email}</small><span>{roleLabel[member.role]} · {standingText(member, invitations, now)}</span></div><div className="member-actions">{member.enabled && member.id !== user?.id && <select aria-label={`Access for ${member.name}`} value={member.role} disabled={busy} onChange={event => void act({action: 'set_role', memberId: member.id, role: event.target.value as Role})}><option value="editor">Editor</option><option value="operator">Operator</option><option value="owner">Administrator</option></select>}{member.enabled && member.id !== user?.id && <button className="member-remove" disabled={busy} onClick={() => void act({action: 'disable', memberId: member.id})} aria-label={`Remove ${member.name}`}><UserMinus size={16}/><span>Remove</span></button>}{memberStanding(member, invitations, now) === 'removed' && <button className="member-restore" disabled={busy} onClick={() => void act({action: 'restore', memberId: member.id})} aria-label={`Restore ${member.name}`}><UserPlus size={16}/><span>Restore</span></button>}</div></article>) : <p className="member-empty">No members to show.</p>}</div>
      </section>
    </div>

    <section className="access-panel access-devices">
      <div className="access-panel-heading"><span><MonitorUp size={18}/></span><div><h2>Paired devices</h2><p>Companion installations and graphics outputs that hold their own credential. Revoking one takes effect the next time that device reconnects; a connection that is already open is not interrupted.</p></div></div>
      {deviceMessage && <div className={`access-device-notice ${deviceMessageKind}`} role="status" aria-live="polite">{deviceMessage}</div>}
      {/* Revoked devices leave the list: the panel is about what can still connect. */}
      <div className="member-list">{activeDevices(devices).length ? activeDevices(devices).map(device => <article className="member-row device-row" key={device.id}><div className="member-avatar" aria-hidden>{(device.name || '?').slice(0, 1).toUpperCase()}</div><div><strong>{device.name}</strong><span>{deviceStandingText(device, now)}</span></div><div className="member-actions"><button className="member-remove" disabled={busy} onClick={() => void revokeDevice(device)} aria-label={`Revoke ${deviceKindLabel(device.kind)} ${device.name}`}>Revoke</button></div></article>) : <p className="member-empty">No paired devices yet.</p>}</div>
    </section>
  </div>;
}
