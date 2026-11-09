import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { api, apiResponse, ApiError, errorMessage } from './api';
import { Brand, DateText, Info, Panel } from './components';
import { CustomerAccount, CustomerApplication, CustomerHelp, CustomerHome, CustomerPayments } from './Customer';
import { Hardware, Trials } from './Hardware';
import { Applications, Audit, Billing, ReadinessWorkspace, StaffHome, Support } from './Staff';
import { createSessionDownloadScope, humanize, makeRetryKeys, mergeRecordPage } from './helpers.mjs';
import { createSessionOperationScope, StaleWorkspaceOperationError } from './session-operations.mjs';
import type { Collection, CustomerData, Item, Session, StaffData, Surface, WorkspaceContext } from './types';
import './workspace.css';

type WorkspaceData = CustomerData | StaffData;
interface RecordPage { items: {id:string;revision?:number}[]; total:number; nextCursor:string|null }
const collectionNames:Record<Collection,string>={sites:'Sites',assets:'Equipment',trials:'Trials',gates:'Evidence',applications:'Applications',tickets:'Support cases',ledger:'Test ledger entries',requests:'Account requests',billingAccounts:'Billing application choices',audit:'Audit actions'};
const collectionKeys=Object.keys(collectionNames) as Collection[];
const sectionCollections:Record<string,Collection[]>={home:[],hardware:['sites','assets'],trials:['sites','assets','trials','gates'],readiness:['gates'],applications:['applications'],support:['tickets','requests'],billing:['ledger','billingAccounts'],audit:['audit'],application:['applications'],payments:['ledger'],help:['tickets'],account:['requests']};
function collectionRows(data:WorkspaceData,kind:Collection):{id:string;revision?:number}[] {
  const value=(data as unknown as Record<string,unknown>)[kind];return Array.isArray(value)?value:[];
}
function pagePath(surface:Surface,kind:Collection,cursor:string):string {return `/v1/${surface==='staff'?'ops':'me'}/records/${kind}?limit=50&cursor=${encodeURIComponent(cursor)}`;}
async function readPage(surface:Surface,kind:Collection,cursor:string,signal:AbortSignal):Promise<RecordPage> {
  const page=await api<RecordPage>(pagePath(surface,kind,cursor),{signal});
  if(!Array.isArray(page?.items)||page.items.some(item=>typeof item?.id!=='string')||!Number.isInteger(page.total)||page.total<0||(page.nextCursor!==null&&typeof page.nextCursor!=='string')||page.nextCursor===cursor)throw new ApiError(0,'RESPONSE_UNREADABLE','The record page could not be read. Refresh before trying again.');
  return page;
}
function addPage(data:WorkspaceData,kind:Collection,page:RecordPage):WorkspaceData {
  return {...data,[kind]:mergeRecordPage(collectionRows(data,kind),page.items),counts:{...data.counts,[kind]:page.total},cursors:{...data.cursors,[kind]:page.nextCursor}};
}
interface Section { key: string; label: string; description: string; permission?: string }
const customerSections: Section[] = [
  {key:'home',label:'Overview',description:'Your service status and next step.'},
  {key:'application',label:'Pilot application',description:'Plan concept, review and next steps.'},
  {key:'payments',label:'Payment records',description:'Your test records and receipt downloads.'},
  {key:'help',label:'Help & support',description:'Ask a question and follow its progress.'},
  {key:'account',label:'Account & requests',description:'Your details, records and service requests.'},
];
const staffSections: Section[] = [
  {key:'home',label:'Overview',description:'The work that needs your attention.'},
  {key:'hardware',label:'Sites & equipment',description:'Plan, receive and commission physical hardware.',permission:'hardware.read'},
  {key:'trials',label:'Field trials',description:'Test plans and sourced observations.',permission:'hardware.read'},
  {key:'readiness',label:'Readiness evidence',description:'Scoped evidence and independent review.',permission:'readiness.read'},
  {key:'applications',label:'Pilot applications',description:'Customer review and host handoff records.',permission:'subscribers.read'},
  {key:'support',label:'Support & requests',description:'Case assignment, customer replies and account requests.',permission:'support.read'},
  {key:'billing',label:'Test ledger',description:'Lab payment records, test refunds and receipts.',permission:'billing'},
  {key:'audit',label:'Audit trail',description:'Recorded actions and audit-chain consistency.',permission:'audit.read'},
];
const roleNames = ['admin','operations','support','finance','agent','auditor','customer'];
function validSession(value: Session): boolean {
  return typeof value?.authenticated==='boolean'&&['lab','production'].includes(value.mode)&&['lab','onesa'].includes(value.authMode)&&typeof value.ssoAvailable==='boolean'&&(!value.authenticated||Boolean(value.user&&typeof value.user.subject==='string'&&typeof value.user.displayName==='string'&&roleNames.includes(value.user.role)&&typeof value.csrfToken==='string'&&value.csrfToken.length>0));
}
function validData(data: WorkspaceData, surface: Surface): boolean {
  const lists=surface==='staff'?['sites','assets','trials','gates','applications','tickets','requests','ledger','audit','billingAccounts','permissions']:['applications','tickets','ledger','requests'];
  return Boolean(data&&data.status&&lists.every(key=>Array.isArray((data as unknown as Record<string,unknown>)[key]))&&(surface==='staff'||'network' in data));
}
function sameSurface(session: Session, surface: Surface): boolean {
  return Boolean(session.user&&(surface==='customer'?session.user.role==='customer':session.user.role!=='customer'));
}

export default function WorkspaceApp({surface}:{surface:Surface}) {
  const [session,setSession]=useState<Session|null>(null),[data,setData]=useState<WorkspaceData|null>(null);
  const [refreshing,setRefreshing]=useState(true),[busy,setBusy]=useState(false),[stale,setStale]=useState(false);
  const [pageError,setPageError]=useState<string|null>(null),[notice,setNotice]=useState<string|null>(null),[loadedAt,setLoadedAt]=useState<string|null>(null);
  const [loadingPages,setLoadingPages]=useState<Partial<Record<Collection,boolean>>>({});
  const [section,setSection]=useState(()=>window.location.hash.slice(1)||'home');
  const sessionRef=useRef<Session|null>(null),requestSequence=useRef(0),controller=useRef<AbortController|null>(null),operationInProgress=useRef(false);
  const loadedData=useRef<WorkspaceData|null>(null),pageControllers=useRef(new Map<Collection,AbortController>());
  const retryKeys=useRef(makeRetryKeys()),heading=useRef<HTMLHeadingElement|null>(null),focusHeading=useRef(false);
  const downloadScope=useRef(createSessionDownloadScope());
  const operationScope=useRef(createSessionOperationScope());

  const publishData=useCallback((next:WorkspaceData|null)=>{loadedData.current=next;setData(next);},[]);
  const acceptSession = useCallback((next: Session) => {
    const previous=sessionRef.current;
    const changed=previous?.authenticated!==next.authenticated||previous?.user?.subject!==next.user?.subject||previous?.user?.role!==next.user?.role||previous?.user?.source!==next.user?.source||previous?.csrfToken!==next.csrfToken;
    if(changed){downloadScope.current.invalidate();operationScope.current.invalidate();publishData(null);setLoadedAt(null);setNotice(null);setPageError(null);retryKeys.current.clear();}
    sessionRef.current=next;setSession(next);
    if(!next.authenticated){publishData(null);setLoadedAt(null);retryKeys.current.clear();}
  },[publishData]);
  const expireSession = useCallback(() => {
    downloadScope.current.invalidate();
    operationScope.current.invalidate();
    controller.current?.abort();for(const pending of pageControllers.current.values())pending.abort();pageControllers.current.clear();requestSequence.current++;
    setRefreshing(false);setLoadingPages({});
    const known=sessionRef.current;
    if(known)acceptSession({...known,authenticated:false,user:null,csrfToken:null});
    else {publishData(null);setLoadedAt(null);}
    setNotice('Your session has ended. Sign in again to continue.');
  },[acceptSession,publishData]);

  const refresh = useCallback(async () => {
    controller.current?.abort(); const active=new AbortController(); controller.current=active;
    for(const pending of pageControllers.current.values())pending.abort();pageControllers.current.clear();setLoadingPages({});
    const sequence=++requestSequence.current;setRefreshing(true);setPageError(null);
    try {
      const next=await api<Session>('/v1/session',{signal:active.signal});
      if(active.signal.aborted||sequence!==requestSequence.current)return false;
      if(!validSession(next))throw new ApiError(0,'RESPONSE_UNREADABLE','The sign-in service returned an unreadable response. Please retry.');
      acceptSession(next);
      if(!next.authenticated||!sameSurface(next,surface)){setStale(false);return true;}
      let snapshot=await api<WorkspaceData>(surface==='staff'?'/v1/ops/snapshot':'/v1/me',{signal:active.signal});
      if(active.signal.aborted||sequence!==requestSequence.current)return false;
      if(!validData(snapshot,surface))throw new ApiError(0,'RESPONSE_UNREADABLE','The workspace returned an unreadable response. Please retry.');
      // Retain the user's loaded range on refresh. This also keeps an older
      // record in view after it is edited, without retaining a stale revision.
      const previous=loadedData.current;
      const expanded=await Promise.all(collectionKeys.map(async kind=>{
        const target=previous?collectionRows(previous,kind).length:0;
        let rows=collectionRows(snapshot,kind),cursor=snapshot.cursors?.[kind],total=snapshot.counts?.[kind]??rows.length;
        while(cursor&&rows.length<target){
          const page=await readPage(surface,kind,cursor,active.signal),merged=mergeRecordPage(rows,page.items);
          if(merged.length===rows.length&&page.nextCursor!==null)throw new ApiError(0,'RESPONSE_UNREADABLE','The record page made no progress. Refresh before trying again.');
          rows=merged;cursor=page.nextCursor;total=page.total;
        }
        return {kind,items:rows,total,nextCursor:cursor??null};
      }));
      if(active.signal.aborted||sequence!==requestSequence.current)return false;
      for(const page of expanded)if(page.kind in snapshot)snapshot=addPage(snapshot,page.kind,page);
      publishData(snapshot);setLoadedAt(new Date().toISOString());setStale(false);return true;
    } catch(error) {
      if(active.signal.aborted||sequence!==requestSequence.current)return false;
      if(error instanceof ApiError&&error.status===401)expireSession();
      else {
        if(error instanceof ApiError&&(error.status===403||error.code==='AUTH_PROVIDER_UNAVAILABLE')){downloadScope.current.invalidate();publishData(null);}
        setStale(true);setPageError(errorMessage(error));
      }
      return false;
    } finally {if(sequence===requestSequence.current&&!active.signal.aborted)setRefreshing(false);}
  },[surface,acceptSession,expireSession,publishData]);

  useEffect(()=>{
    const cancelDownloads=()=>{downloadScope.current.invalidate();operationScope.current.invalidate();};
    window.addEventListener('pagehide',cancelDownloads);void refresh();
    return()=>{window.removeEventListener('pagehide',cancelDownloads);cancelDownloads();controller.current?.abort();for(const pending of pageControllers.current.values())pending.abort();requestSequence.current++;};
  },[refresh]);
  useEffect(()=>{
    if(!session?.authenticated||!session.user)return;
    const remaining=session.user.expiresAt*1000-Date.now();
    const timer=setTimeout(()=>expireSession(),Math.max(0,Math.min(remaining,2147483647)));return()=>clearTimeout(timer);
  },[session?.authenticated,session?.user?.expiresAt,expireSession]);
  useEffect(()=>{
    const changed=()=>{const value=window.location.hash.slice(1);if(value!=='mw-main')setSection(value||'home');};
    window.addEventListener('hashchange',changed);window.addEventListener('popstate',changed);return()=>{window.removeEventListener('hashchange',changed);window.removeEventListener('popstate',changed);};
  },[]);

  const staffData=surface==='staff'?data as StaffData|null:null;
  const sections=surface==='staff'?staffSections.filter(item=>!item.permission||(item.permission==='billing'?staffData?.permissions.some(p=>p==='billing.read'||p==='billing.write'):staffData?.permissions.includes(item.permission))):customerSections;
  const selected=sections.find(item=>item.key===section)??sections[0];
  useEffect(()=>{
    document.title=`${selected.label} · Onesa Mobile ${surface==='staff'?'Operations':'Account'}`;
    if(focusHeading.current){heading.current?.focus();focusHeading.current=false;}
  },[selected.key,selected.label,surface]);
  function go(next: string) {
    if(next===selected.key)return;
    focusHeading.current=true;setSection(next);window.history.pushState(null,'','#'+next);
  }
  async function loadMore(kind:Collection) {
    const current=loadedData.current,cursor=current?.cursors?.[kind];
    if(!current||!cursor||busy||refreshing||stale||pageControllers.current.has(kind))return;
    const active=new AbortController(),sequence=requestSequence.current;pageControllers.current.set(kind,active);
    setLoadingPages(previous=>({...previous,[kind]:true}));setPageError(null);
    try {
      const page=await readPage(surface,kind,cursor,active.signal);
      if(active.signal.aborted||sequence!==requestSequence.current||!loadedData.current)return;
      publishData(addPage(loadedData.current,kind,page));
    } catch(error) {
      if(active.signal.aborted||sequence!==requestSequence.current)return;
      if(error instanceof ApiError&&error.status===401)expireSession();
      else {if(error instanceof ApiError&&(error.status===403||error.code==='AUTH_PROVIDER_UNAVAILABLE')){downloadScope.current.invalidate();publishData(null);setStale(true);}setPageError(errorMessage(error));}
    } finally {
      if(pageControllers.current.get(kind)===active){pageControllers.current.delete(kind);setLoadingPages(previous=>({...previous,[kind]:false}));}
    }
  }

  async function login(username:string,password:string,totp:string) {
    if(operationInProgress.current)return;
    downloadScope.current.invalidate();
    operationInProgress.current=true;setBusy(true);setPageError(null);setNotice(null);
    try {
      const issued=await api<{authenticated:boolean;mode:'lab'|'production';user:Session['user'];csrfToken:string}>('/v1/session/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password,...(totp?{totp}:{}),surface,transport:'cookie'})});
      const known=sessionRef.current;
      if(issued.authenticated&&known)acceptSession({...known,authenticated:true,user:issued.user,csrfToken:issued.csrfToken});
      await refresh();
    } finally {operationInProgress.current=false;setBusy(false);}
  }
  async function logout() {
    if(operationInProgress.current)return;
    downloadScope.current.invalidate();
    operationInProgress.current=true;setBusy(true);setPageError(null);
    try {
      const result=await api<{signedOut:boolean;centralRevocation:string}>('/v1/session/logout',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':sessionRef.current?.csrfToken??''},body:'{}'});
      controller.current?.abort();for(const pending of pageControllers.current.values())pending.abort();pageControllers.current.clear();setLoadingPages({});requestSequence.current++;setRefreshing(false);
      const known=sessionRef.current;if(known)acceptSession({...known,authenticated:false,user:null,csrfToken:null});
      setStale(false);setNotice(result.centralRevocation==='unavailable'?'You are signed out of Onesa Mobile. Central Onesa sign-out could not be confirmed.':'You are signed out of Onesa Mobile.');
    } catch(error) {
      if(error instanceof ApiError&&error.status===401)expireSession();
      else setPageError('Sign-out could not be confirmed. Keep this page open and retry. '+errorMessage(error));
    } finally {operationInProgress.current=false;setBusy(false);}
  }

  async function mutate(path:string,input:Record<string,unknown>,method:'POST'|'PATCH'='POST',success='Saved to the workspace.'):Promise<Item> {
    if(operationInProgress.current)throw new Error('Wait for the current action to finish.');
    if(stale||refreshing)throw new Error('Refresh the workspace and review the current record before saving.');
    const current=sessionRef.current;if(!current?.authenticated||!current.csrfToken)throw new Error('Sign in again to continue.');
    const csrfToken=current.csrfToken;
    const attempt=retryKeys.current.get(method+' '+path,input);
    const operation=operationScope.current.begin();
    operationInProgress.current=true;setBusy(true);setNotice(null);setPageError(null);
    try {
      const result=await operation.wait(()=>api<Item>(path,{method,headers:{'Content-Type':'application/json','X-CSRF-Token':csrfToken,'Idempotency-Key':attempt.key},body:JSON.stringify(input),signal:operation.signal}));
      operation.assertCurrent();
      if(typeof result?.id!=='string')throw new ApiError(0,'RESPONSE_UNREADABLE','The save response could not be verified. Retry the same action to recover its result.');
      retryKeys.current.confirmed(attempt.fingerprint);setNotice(success);
      // The write is confirmed. A failed follow-up read must never re-submit it.
      await refresh();operation.assertCurrent();return result;
    } catch(error) {
      if(!operation.isCurrent()||error instanceof StaleWorkspaceOperationError)throw new StaleWorkspaceOperationError();
      if(error instanceof ApiError&&error.status===401)expireSession();
      if(error instanceof ApiError&&error.code==='REVISION_CONFLICT')setStale(true);
      if(error instanceof ApiError&&(error.code==='CONNECTION_UNCERTAIN'||error.code==='RESPONSE_UNREADABLE'))throw new Error('The save result is uncertain. Keep this form open and retry without changing its entries. The same request reference will recover the result without creating a duplicate.');
      throw error;
    } finally {operation.finish();operationInProgress.current=false;setBusy(false);}
  }
  async function download(path:string,name:string) {
    if(operationInProgress.current)throw new Error('Wait for the current action to finish.');
    if(!sessionRef.current?.authenticated||!sessionRef.current.user)throw new Error('Sign in again to continue.');
    await downloadScope.current.run(signal=>apiResponse(path,{signal}),blob=>{
      if(!['application/pdf','application/json'].includes(blob.type.split(';')[0]))throw new Error('This download returned an unexpected format. Please retry.');
      const url=URL.createObjectURL(blob),link=document.createElement('a');
      try {
        link.href=url;link.download=name;document.body.appendChild(link);link.click();
        setNotice('Your download is ready.');
      } finally {link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
    },error=>{if(error instanceof ApiError&&error.status===401)expireSession();});
  }

  let content:ReactNode=null;
  if(session?.authenticated&&session.user&&data&&sameSurface(session,surface)) {
    const context:WorkspaceContext={user:session.user,mode:session.mode,pending:busy||refreshing||stale,mutate,download};
    if(surface==='customer') {
      const customer=data as CustomerData;
      content=selected.key==='application'?<CustomerApplication data={customer} context={context}/>:selected.key==='payments'?<CustomerPayments data={customer} context={context}/>:selected.key==='help'?<CustomerHelp data={customer} context={context}/>:selected.key==='account'?<CustomerAccount data={customer} context={context}/>:<CustomerHome data={customer} context={context} go={go}/>;
    } else {
      const staff=data as StaffData;
      content=selected.key==='hardware'?<Hardware data={staff} context={context}/>:selected.key==='trials'?<Trials data={staff} context={context}/>:selected.key==='readiness'?<ReadinessWorkspace data={staff} context={context}/>:selected.key==='applications'?<Applications data={staff} context={context}/>:selected.key==='support'?<Support data={staff} context={context}/>:selected.key==='billing'?<Billing data={staff} context={context}/>:selected.key==='audit'?<Audit data={staff}/>:<StaffHome data={staff} context={context} go={go}/>;
    }
  }
  const clipped=data&&data.counts?Object.entries(data.counts).filter(([key,count])=>collectionKeys.includes(key as Collection)&&count>collectionRows(data,key as Collection).length).map(([key])=>key as Collection):[];
  const moreCollections=(sectionCollections[selected.key]??[]).filter(kind=>Boolean(data?.cursors?.[kind]));
  const authenticated=Boolean(session?.authenticated&&session.user);
  return <div className="mw-root"><a className="mw-skip" href="#mw-main" onClick={event=>{event.preventDefault();document.getElementById('mw-main')?.focus();}}>Skip to workspace content</a>
    <header className="mw-header"><div className="mw-header-inner"><Brand staff={surface==='staff'}/><div className="mw-header-actions">{authenticated&&<span className="mw-user">{session!.user!.displayName}<small>{surface==='staff'?humanize(session!.user!.role):'Customer account'}</small></span>}<a href="/" className="mw-website-link">Website</a>{authenticated&&<button type="button" className="mw-header-button" disabled={busy} onClick={()=>void logout()}>Sign out</button>}</div></div></header>
    <div className="mw-mode-strip"><div><span className="mw-mode-dot" aria-hidden="true"/>{session?.mode==='lab'?'LAB PILOT':'PRELAUNCH'}<span>{surface==='staff'?'Persistent operations records':'Your account workspace'}</span><strong>Mobile service is not active</strong></div></div>
    <div className={authenticated&&content?'mw-layout':'mw-auth-layout'}>
      {authenticated&&content&&<aside className="mw-sidebar"><nav aria-label={surface==='staff'?'Operations sections':'Account sections'}>{sections.map(item=><button type="button" key={item.key} aria-current={item.key===selected.key?'page':undefined} onClick={()=>go(item.key)}>{item.label}<span aria-hidden="true">›</span></button>)}</nav><p>{surface==='staff'?'Your available tasks follow your assigned role.':'Your account, applications and support in one place.'}</p></aside>}
      <main id="mw-main" className="mw-main" tabIndex={-1}>
        {notice&&<div className="mw-notice" role="status"><span>{notice}</span><button className="mw-dismiss" type="button" aria-label="Dismiss status message" onClick={()=>setNotice(null)}>×</button></div>}
        {pageError&&<div className="mw-error-banner" role="alert"><p>{pageError}</p><button type="button" className="mw-button mw-button-secondary" disabled={busy||refreshing} onClick={()=>void refresh()}>{refreshing?'Refreshing…':'Retry connection'}</button></div>}
        {!session&&!pageError&&<Loading label="Checking secure access…"/>}
        {session&&!session.authenticated&&<SignIn session={session} surface={surface} busy={busy||refreshing} login={login}/>}
        {authenticated&&!sameSurface(session!,surface)&&<Panel title={surface==='staff'?'Staff access required':'Customer account required'}><p>This account is assigned to the {session!.user!.role==='customer'?'customer':'staff'} workspace. It cannot open this area.</p><a className="mw-button" href={session!.user!.role==='customer'?'/account/':'/internal/'}>Open your workspace</a></Panel>}
        {authenticated&&sameSurface(session!,surface)&&!data&&!pageError&&<Loading label="Loading your workspace…"/>}
        {authenticated&&content&&<>
          <label className="mw-mobile-nav"><span>Workspace section</span><select value={selected.key} onChange={event=>go(event.target.value)}>{sections.map(item=><option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
          <div className="mw-page-heading"><div><p className="mw-eyebrow">{surface==='staff'?'Operations workspace':'My Onesa Mobile'}</p><h1 ref={heading} tabIndex={-1}>{selected.label}</h1><p>{selected.description}</p></div><button type="button" className="mw-button mw-button-secondary" disabled={busy||refreshing} onClick={()=>void refresh()} aria-label="Refresh workspace">{refreshing?'Refreshing…':'Refresh'}</button></div>
          <div className="mw-freshness"><span>{stale?'Showing previously loaded records. Refresh before saving.':'Workspace refreshed'}{loadedAt&&!stale&&<> <DateText value={loadedAt}/></>}</span><span>Network measurements: unavailable</span></div>
          {clipped.length>0&&<Info tone="pending">Search and work queues use loaded records. More {clipped.map(kind=>collectionNames[kind].toLowerCase()).join(', ')} are available in their sections.{surface==='customer'?' Your account download includes all your records.':''}</Info>}
          {moreCollections.length>0&&<section className="mw-pagination" aria-label="Load older records">{moreCollections.map(kind=><div key={kind}><p><strong>{collectionNames[kind]}</strong><span>{collectionRows(data!,kind).length}{typeof data!.counts?.[kind]==='number'?` of ${data!.counts[kind]}`:''} loaded</span></p><button className="mw-button mw-button-secondary" type="button" disabled={busy||refreshing||stale||loadingPages[kind]} onClick={()=>void loadMore(kind)} aria-label={`Load more ${collectionNames[kind].toLowerCase()}`}>{loadingPages[kind]?'Loading…':'Load 50 more'}</button></div>)}</section>}
          {content}
        </>}
      </main>
    </div><footer className="mw-footer"><span>Onesa Mobile · Zimbabwe pilot</span><span>Support cases are reviewed by the team. This app is not an emergency service.</span></footer>
  </div>;
}

function Loading({label}:{label:string}) {return <div className="mw-loading" role="status"><span className="mw-loading-dot" aria-hidden="true"/><p>{label}</p></div>;}
function SignIn({session,surface,busy,login}:{session:Session;surface:Surface;busy:boolean;login:(username:string,password:string,totp:string)=>Promise<void>}) {
  const [error,setError]=useState<string|null>(null),[sending,setSending]=useState(false);
  const errorTarget=useRef<HTMLParagraphElement|null>(null);
  useEffect(()=>{if(error)errorTarget.current?.focus();},[error]);
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();if(busy||sending)return;
    const values=new FormData(event.currentTarget);setError(null);setSending(true);
    try{await login(String(values.get('username')??''),String(values.get('password')??''),String(values.get('totp')??''));}
    catch(error){setError(errorMessage(error));}finally{setSending(false);}
  }
  return <div className="mw-sign-in"><section className="mw-sign-in-intro"><p className="mw-eyebrow">{surface==='staff'?'Onesa Mobile Operations':'My Onesa Mobile'}</p><h1>{surface==='staff'?'The work behind your network.':'Your next step, clearly.'}</h1><p>{surface==='staff'?'Manage the physical bench, review evidence and support pilot participants.':'Follow your pilot application, get help and keep your account records together.'}</p><div className="mw-sign-in-boundary"><strong>Prelaunch workspace</strong><span>No mobile line or satellite entitlement is activated by signing in.</span></div></section>
    <Panel title={surface==='staff'?'Staff sign-in':'Customer sign-in'} hint={session.authMode==='lab'?'Isolated lab accounts':'Your central Onesa account'}>
      {session.ssoAvailable&&<div className="mw-sso"><a className="mw-button" href={`/api/v1/auth/onesa/start?surface=${surface}`}>Continue with Onesa</a><p className="mw-secondary">Use your central Onesa account. Account creation and password recovery are handled by Onesa sign-in.</p></div>}
      {session.authMode==='lab'?<><Info>Use the pilot credentials supplied to you. These are lab accounts; do not enter a password from another service.{surface==='staff'?' Staff access also needs an authenticator code.':''}</Info><form className="mw-form mw-login-form" aria-label={`${surface==='staff'?'Staff':'Customer'} sign-in`} onSubmit={event=>void submit(event)}><fieldset disabled={busy||sending}><legend className="mw-visually-hidden">Pilot sign-in</legend>
        <label htmlFor="mw-username"><span>Lab username</span><input id="mw-username" name="username" autoComplete="username" required maxLength={254} autoCapitalize="none" spellCheck={false}/></label>
        <label htmlFor="mw-password"><span>Lab password</span><input id="mw-password" name="password" type="password" autoComplete="current-password" required maxLength={256}/></label>
        {surface==='staff'&&<label htmlFor="mw-totp"><span>Authenticator code</span><input id="mw-totp" name="totp" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" required/><small>Enter the six-digit code from your authenticator.</small></label>}
        <button className="mw-button" type="submit" aria-busy={busy||sending}>{busy||sending?'Signing in…':'Sign in to pilot'}</button>
      </fieldset>{error&&<p className="mw-form-error" role="alert" ref={errorTarget} tabIndex={-1}>{error}</p>}</form><p className="mw-secondary">Need a pilot account or credential reset? Contact the person who invited you to the pilot.</p></>:!session.ssoAvailable&&<Info tone="pending">Central Onesa sign-in is not configured for this workspace yet. Contact your Onesa administrator.</Info>}
    </Panel>
  </div>;
}
