import type { CustomerData, Item, WorkspaceContext } from './types';
import { DateText, Details, Empty, Info, Money, MutationButton, Notes, options, Panel, Pill, RecordForm, RecordMeta, type Field } from './components';
import { pasofi } from '../pasofi';
import { applicationState, humanize } from './helpers.mjs';

export const planOptions = [{value:'everyday',label:'Everyday — concept'}, {value:'reach',label:'Reach — concept'}, {value:'family-farm',label:'Family & Farm — concept'}];
export const planName = (id: unknown) => planOptions.find(p=>p.value===id)?.label.replace(' — concept','') ?? 'Not selected';
function applicationFields(item?:Item):Field[] {
  return [
    {name:'displayName',label:'Pilot participant name',maxLength:80,value:String(item?.displayName??''),autoComplete:'name'},
    {name:'area',label:'Area or district',maxLength:100,value:String(item?.area??'')},
    {name:'planId',label:'Plan concept',type:'select',options:planOptions,value:String(item?.planId??'')},
    {name:'simFormat',label:'Preferred SIM format',type:'select',options:[{value:'physical',label:'Physical SIM'},{value:'esim',label:'eSIM'}],value:String(item?.simFormat??'')},
    {name:'deviceModel',label:'Phone make and model',maxLength:100,value:String(item?.deviceModel??''),wide:true,hint:'A device model helps the team plan testing. Compatibility is still unverified.'},
    {name:'consentToPilot',label:'I understand this is a lab pilot application. It does not buy a plan or activate a mobile line.',type:'checkbox'},
  ];
}
function applicationPayload(values:Record<string,string>) {
  return {displayName:values.displayName,area:values.area,planId:values.planId,simFormat:values.simFormat,deviceModel:values.deviceModel,consentToPilot:values.consentToPilot==='true'};
}
function LaunchInterestPreference({ data, context }: { data: CustomerData; context: WorkspaceContext }) {
  const interest = data.launchInterest;
  const registered = interest?.state === 'registered';
  return <Panel title="Your launch interest" hint={context.mode === 'lab' ? 'Lab preference' : undefined}>
    <p>{registered
      ? 'Your interest in Onesa Mobile in Zimbabwe is registered. You can withdraw it at any time.'
      : 'Tell Onesa you’re interested in mobile service in Zimbabwe. Your account preference helps the team plan the launch.'}</p>
    <p className="mw-secondary">Registering is free. SIM reservations, subscriptions and payments are closed while service is being prepared.</p>
    {interest && <p className="mw-secondary">
      {registered ? 'Registered' : 'Withdrawn'} <DateText value={interest.updatedAt}/>
    </p>}
    <MutationButton context={context} action={() => context.mutate(
      '/v1/account/launch-interest',
      { interested: !registered, revision: interest?.revision ?? 0 },
      'POST',
      registered ? 'Your launch interest has been withdrawn.' : 'Your launch interest has been registered.',
    )}>{registered ? 'Withdraw interest' : 'Register my interest'}</MutationButton>
  </Panel>;
}
export function CustomerHome({ data, context, go }: { data:CustomerData;context:WorkspaceContext;go:(section:string)=>void }) {
  const application=data.applications.find(a=>a.state!=='declined'),[state,next]=applicationState(application?.state);
  const applicationsOpen=context.mode==='lab';
  const showLaunchInterest=data.status.capabilities?.launchInterest===true && data.launchInterest!==undefined;
  const openCases=data.tickets.filter(t=>t.status!=='resolved').length;
  return <div className="mw-stack">
    <div className="mw-summary-band"><div><span>Mobile service</span><strong>Not activated</strong></div><div><span>Plan concept</span><strong>{planName(application?.planId)}</strong></div><div><span>Usage</span><strong>Not available</strong></div><div><span>{data.counts?.tickets>data.tickets.length?'Open cases shown':'Open support cases'}</span><strong>{openCases}</strong></div></div>
    {showLaunchInterest && <LaunchInterestPreference data={data} context={context}/>}
    {(application || applicationsOpen || !showLaunchInterest) && <Panel title="Your next step"><div className="mw-record-line"><div><h3>{!application&&!applicationsOpen?'Applications are not open':String(state)}</h3><p>{!application&&!applicationsOpen?'Onesa is preparing the service. You can ask the team about availability from Help & support.':String(next)}</p></div><button type="button" className="mw-button" onClick={()=>go(application||applicationsOpen?'application':'help')}>{application?'View application':applicationsOpen?'Start pilot application':'Ask about availability'}</button></div>{Boolean(application?.reviewNote)&&<Info tone="pending">Review note: {String(application?.reviewNote)}</Info>}</Panel>}
    <div className="mw-columns"><Panel title="Connection status"><p>No host-confirmed mobile line or usage measurements are available for this account.</p><dl className="mw-definition-list"><div><dt>Terrestrial mobile</dt><dd>Awaiting host integration</dd></div><div><dt>Direct-to-cell satellite</dt><dd>Awaiting provider agreement</dd></div><div><dt>Last network measurement</dt><dd>{data.network.lastMeasuredAt?<DateText value={data.network.lastMeasuredAt}/>:<>None received</>}</dd></div></dl><p className="mw-secondary">{pasofi.introduction} {pasofi.status} <a href={pasofi.url}>Visit Pasofi Wi-Fi</a>.</p></Panel>
      <Panel title="Help when you need it"><p>{context.mode === 'lab' ? 'Track a question or request help with your application, phone, coverage or a test payment.' : 'Ask about your account or service availability and follow replies from the Onesa team.'}</p><button className="mw-button mw-button-secondary" type="button" onClick={()=>go('help')}>Open support</button>{data.tickets[0]&&<div className="mw-recent-item"><strong>{String(data.tickets[0].subject)}</strong><Pill value={data.tickets[0].status}/><span>Updated <DateText value={data.tickets[0].updatedAt}/></span></div>}</Panel></div>
    <Info>{context.mode==='lab'?'Lab records are saved to this pilot workspace. Use test details only.':'Onesa is preparing the service. Commercial sales and network activation are unavailable.'}</Info>
  </div>;
}
export function CustomerApplication({ data, context }: {data:CustomerData;context:WorkspaceContext}) {
  const current=data.applications.find(a=>a.state!=='declined'),canApply=context.mode==='lab'&&context.user.role==='customer';
  return <div className="mw-stack"><Info>Plan names are concepts. No approved price or allowance is offered here. Keep national ID documents, card details and SIM secrets out of these pilot forms.</Info>
    {data.applications.map(application=>{
      const [title,next]=applicationState(application.state),editable=['review_required','information_required'].includes(String(application.state));
      return <Panel key={application.id} title={String(title)} hint={planName(application.planId)}><p>{String(next)}</p>
        <dl className="mw-definition-list"><div><dt>Participant</dt><dd>{String(application.displayName)}</dd></div><div><dt>Area</dt><dd>{String(application.area)}</dd></div><div><dt>Phone</dt><dd>{String(application.deviceModel)}</dd></div><div><dt>SIM preference</dt><dd>{application.simFormat==='esim'?'eSIM':'Physical SIM'}</dd></div><div><dt>Network</dt><dd>Not provisioned</dd></div></dl>
        {Boolean(application.reviewNote)&&<Info tone="pending">Team response: {String(application.reviewNote)}</Info>}
        {canApply&&editable&&<Details label="Update and resend application" open={application.state==='information_required'}><RecordForm title="Update pilot application" fields={applicationFields(application)} busy={context.pending} reset={false} submitLabel="Resend for review" onSubmit={v=>context.mutate(`/v1/applications/${application.id}`,{...applicationPayload(v),revision:application.revision},'PATCH','Application updated and returned to review.')}/></Details>}
        <Details label="Application reference"><RecordMeta item={application}/></Details>
      </Panel>;
    })}
    {!current&&<Panel title="Pilot application" hint="No purchase or activation">{canApply?<RecordForm title="Pilot application" fields={applicationFields()} busy={context.pending} submitLabel="Submit pilot application" onSubmit={v=>context.mutate('/v1/applications',applicationPayload(v),'POST','Pilot application saved. The team can now review it.')}/>:<Empty>Applications are not open for commercial service. Use Help for questions about your account.</Empty>}</Panel>}
  </div>;
}
export function CustomerPayments({ data,context }: {data:CustomerData;context:WorkspaceContext}) {
  return <div className="mw-stack"><Info tone="pending">Payments are not live. Any entries below are labelled lab tests. No money moved, and a test receipt is not a tax invoice or proof of mobile activation.</Info>
    <Panel title="Payment records" hint={`${data.ledger.length} shown`}>
      {data.ledger.length?<div className="mw-record-list">{data.ledger.map(item=><article className="mw-record" key={item.id}><div className="mw-record-line"><div><h3>{String(item.description)}</h3><p>{humanize(item.method)} · Reference {String(item.reference)}</p></div><strong><Money minor={item.amountMinor}/></strong></div><div className="mw-inline-facts"><Pill value={item.state}/><span>Test refunds: <Money minor={item.refundedMinor}/></span><span>Recorded <DateText value={item.createdAt}/></span></div><MutationButton context={context} action={()=>context.download(`/v1/documents/${item.id}.pdf`,'onesa-mobile-test-receipt.pdf')}>Download test receipt PDF</MutationButton></article>)}</div>:<Empty>No payment records. You have not been charged through this application.</Empty>}
    </Panel>
  </div>;
}
export function CustomerHelp({ data,context }: {data:CustomerData;context:WorkspaceContext}) {
  return <div className="mw-stack"><Panel title="Ask for help"><Details label="Create a support case" open={data.tickets.length===0}><RecordForm title="Create support case" busy={context.pending} submitLabel="Save support case" fields={[
    {name:'category',label:'What is this about?',type:'select',options:options(['registration','sim','coverage','billing','other'])},
    {name:'subject',label:'Short description',maxLength:100}, {name:'message',label:'How can the team help?',type:'textarea'},
  ]} onSubmit={v=>context.mutate('/v1/support/tickets',{category:v.category,subject:v.subject,message:v.message},'POST','Support case saved. Follow its progress below.')}><p className="mw-secondary">Do not include passwords, SIM secrets, identity-document numbers or payment-card details.</p></RecordForm></Details></Panel>
    <Panel title="Your support cases" hint={`${data.tickets.length} shown`}>{data.tickets.length?<div className="mw-record-list">{data.tickets.map(ticket=><article className="mw-record" key={ticket.id}><div className="mw-record-line"><h3>{String(ticket.subject)}</h3><Pill value={ticket.status}/></div><p>{String(ticket.message)}</p><Details label={`Conversation: ${String(ticket.subject)}`}><Notes items={ticket.notes}/><RecordForm title={`Reply to ${String(ticket.subject)}`} busy={context.pending} submitLabel="Send reply" fields={[{name:'message',label:'Your reply',type:'textarea'}]} onSubmit={v=>context.mutate(`/v1/support/tickets/${ticket.id}/replies`,{revision:ticket.revision,message:v.message},'POST','Reply saved. The case is open for the team.')}/><RecordMeta item={ticket}/></Details></article>)}</div>:<Empty>Your support cases will appear here after you create one.</Empty>}</Panel>
  </div>;
}
export function CustomerAccount({ data,context }: {data:CustomerData;context:WorkspaceContext}) {
  return <div className="mw-stack"><Panel title="Account details"><dl className="mw-definition-list"><div><dt>Signed in as</dt><dd>{context.user.displayName}</dd></div><div><dt>Identity</dt><dd>{context.user.source==='onesa'?'Onesa account':'Isolated lab account'}</dd></div><div><dt>Account reference</dt><dd className="mw-reference">{context.user.subject}</dd></div></dl><MutationButton context={context} action={()=>context.download('/v1/me/export','onesa-mobile-account.json')}>Download my account records</MutationButton></Panel>
    <Panel title="Service and privacy requests"><p>The team reviews requests to correct your information or close your account. For a question about a mobile service, open a support case.</p><Details label="Create an account request"><RecordForm title="Create account request" busy={context.pending} submitLabel="Save request" fields={[
      {name:'type',label:'Request type',type:'select',options:[{value:'data_correction',label:'Correct account information'},{value:'account_closure',label:'Request account closure'},...(context.mode==='lab'?[{value:'sim_replacement',label:'Ask about SIM replacement'},{value:'number_porting',label:'Ask about moving a number'}]:[])],wide:true},
      {name:'detail',label:'What should the team review?',type:'textarea'},
    ]} onSubmit={v=>context.mutate('/v1/account/requests',{type:v.type,detail:v.detail},'POST','Request saved for staff review.')}/></Details>
      {data.requests.length?<div className="mw-record-list">{data.requests.map(request=><article className="mw-record" key={request.id}><div className="mw-record-line"><h3>{humanize(request.type)}</h3><Pill value={request.status}/></div><p>{String(request.detail)}</p>{Boolean(request.responseNote)&&<Info>Staff response: {String(request.responseNote)}</Info>}<p className="mw-secondary">Updated <DateText value={request.updatedAt}/></p></article>)}</div>:<Empty>No account requests have been recorded.</Empty>}
    </Panel>
  </div>;
}
