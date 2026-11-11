import { useState } from 'react';
import { DateText, Details, Empty, Info, matches, Money, MutationButton, Notes, options, Panel, Pill, RecordForm, RecordMeta, Search, type Field } from './components';
import { applicationState, humanize, usdMinor } from './helpers.mjs';
import { planName } from './Customer';
import type { Item, StaffData, WorkspaceContext } from './types';

const has = (data: StaffData, permission: string) => data.permissions.includes(permission);
const gateOptions = [
  ['telecom_licence','Telecommunications licence'], ['host_agreement','Host operator agreement'],
  ['subscriber_registration','Subscriber registration process'], ['data_protection','Data protection and hosting'],
  ['equipment_approval','Equipment and spectrum approval'], ['approved_tariff','Approved tariffs'],
  ['numbering_interconnect','Numbering and interconnection'], ['emergency_services','Emergency service responsibilities'],
  ['satellite_authorization','Zimbabwe satellite authorization'], ['satellite_entitlement','Satellite wholesale entitlement'],
  ['device_acceptance','Device and service acceptance'], ['operational_acceptance','Operational acceptance'],
].map(([value,label])=>({value,label}));
const gateName = (value: unknown) => gateOptions.find(gate=>gate.value===value)?.label ?? humanize(value);
const paths = [{value:'terrestrial',label:'Terrestrial mobile'},{value:'direct_to_cell',label:'Handset direct to cell'},{value:'dish_wifi',label:'Dish and Wi-Fi'}];

export function StaffHome({data,context,go}:{data:StaffData;context:WorkspaceContext;go:(section:string)=>void}) {
  const metrics = [
    ...(has(data,'hardware.read')?[{label:'Equipment records',value:data.counts.assets??data.assets.length,section:'hardware'},{label:'Trials recorded',value:data.counts.trials??data.trials.length,section:'trials'}]:[]),
    ...(has(data,'subscribers.read')?[{label:'Pilot applications',value:data.counts.applications??data.applications.length,section:'applications'}]:[]),
    ...(has(data,'support.read')?[{label:'Support cases',value:data.counts.tickets??data.tickets.length,section:'support'}]:[]),
    ...(has(data,'billing.read')||has(data,'billing.write')?[{label:context.user.role==='agent'?'Your test entries':'Test ledger entries',value:data.counts.ledger??data.ledger.length,section:'billing'}]:[]),
  ];
  const queues = [
    ...(has(data,'hardware.read')?[{label:'Equipment to receive or check',count:data.assets.filter(a=>!['commissioned','retired'].includes(String(a.state))).length,section:'hardware'}]:[]),
    ...(has(data,'readiness.read')?[{label:'Evidence awaiting review',count:data.gates.filter(g=>g.state==='in_review').length,section:'readiness'}]:[]),
    ...(has(data,'subscribers.read')?[{label:'Applications awaiting team review',count:data.applications.filter(a=>a.state==='review_required').length,section:'applications'}]:[]),
    ...(has(data,'support.read')?[{label:'Open support cases',count:data.tickets.filter(t=>t.status!=='resolved').length,section:'support'},{label:'Account requests to handle',count:data.requests.filter(t=>t.status!=='resolved').length,section:'support'}]:[]),
  ];
  return <div className="mw-stack"><div className="mw-summary-band">{metrics.map(metric=><button key={metric.label} type="button" onClick={()=>go(metric.section)}><span>{metric.label}</span><strong>{metric.value}</strong></button>)}</div>
    <div className="mw-columns"><Panel title="Work to review" hint="From loaded records">{queues.length?<ul className="mw-task-list">{queues.map(queue=><li key={queue.label}><button type="button" onClick={()=>go(queue.section)}><span>{queue.label}</span><strong>{queue.count}</strong><span aria-hidden="true">→</span></button></li>)}</ul>:<Empty>Your role has no review queues. Open the test ledger to see your recorded entries.</Empty>}</Panel>
      <Panel title="Service boundary"><dl className="mw-definition-list"><div><dt>Workspace mode</dt><dd>{context.mode==='lab'?'Isolated lab pilot':'Prelaunch operations'}</dd></div><div><dt>Carrier provisioning</dt><dd>Not commissioned</dd></div><div><dt>Satellite entitlement</dt><dd>Not established</dd></div><div><dt>Commercial sales</dt><dd>Unavailable</dd></div><div><dt>Live payments</dt><dd>Unavailable</dd></div></dl><p className="mw-secondary">These are application records. Network availability, subscriber registration and legal approval require their own verified evidence.</p></Panel></div>
    {has(data,'hardware.write')&&<Panel title="Start with the physical bench"><p>Create a site, register planned equipment, record its receipt, complete commissioning checks and capture a sourced trial result.</p><button className="mw-button" type="button" onClick={()=>go('hardware')}>Open hardware workspace</button></Panel>}
  </div>;
}

export function ReadinessWorkspace({data,context}:{data:StaffData;context:WorkspaceContext}) {
  const [search,setSearch]=useState('');
  const visible=data.gates.filter(item=>matches(item,search,['gate','operator','service','deviceScope','state']));
  return <div className="mw-stack"><Info tone="pending">Evidence acceptance is an internal review record. It does not grant a licence, establish provider entitlement or activate service. Assess each country, operator, service and device scope separately.</Info>
    {data.readiness&&<Panel title="Readiness evidence" hint="Current accepted records by gate"><div className="mw-table-scroll" role="region" aria-label="Readiness gate counts" tabIndex={0}><table><thead><tr><th scope="col">Gate</th><th scope="col">Current evidence</th></tr></thead><tbody>{data.readiness.gates.map(gate=><tr key={gate.key}><th scope="row">{gate.label}</th><td><span className="mw-count">{gate.currentEvidence}</span><span className="mw-secondary"> {gate.currentEvidence===0?'No current accepted record':'Scope review still required'}</span></td></tr>)}</tbody></table></div></Panel>}
    {has(data,'readiness.write')&&<Panel title="Submit evidence"><Details label="Add a scoped evidence record"><RecordForm title="Submit readiness evidence" busy={context.pending} submitLabel="Save for independent review" fields={[
      {name:'gate',label:'Readiness gate',type:'select',options:gateOptions,wide:true},
      {name:'operator',label:'Operator / responsible organization',maxLength:80}, {name:'service',label:'Service path',type:'select',options:paths},
      {name:'issuer',label:'Evidence issuer',maxLength:100,hint:'The authority or organization that issued the referenced evidence.'},
      {name:'issuedAt',label:'Document issue date',type:'date',hint:'Use the date on the evidence document.'},
      {name:'deviceScope',label:'Device or implementation scope',maxLength:160,wide:true},
      {name:'evidenceRef',label:'Evidence reference',maxLength:160,hint:'Reference a controlled document. Do not paste secrets or private document contents.'},
      {name:'expiresAt',label:'Review / expiry date and time',type:'datetime-local',hint:'Local device time. A future date is required.'},
      {name:'summary',label:'What does this evidence establish?',type:'textarea'},
    ]} onSubmit={v=>context.mutate('/v1/ops/evidence',{gate:v.gate,country:'ZW',operator:v.operator,service:v.service,issuer:v.issuer,issuedAt:v.issuedAt,deviceScope:v.deviceScope,evidenceRef:v.evidenceRef,expiresAt:new Date(v.expiresAt).toISOString(),summary:v.summary},'POST','Evidence saved for independent review. No service has been enabled.')}><p className="mw-secondary">Country: Zimbabwe (ZW). An authorized second person must accept the evidence.</p></RecordForm></Details></Panel>}
    <Panel title="Evidence records" hint={`${visible.length} shown`}><Search label="Find loaded evidence by gate, operator or device scope" value={search} setValue={setSearch}/>{visible.length?<div className="mw-record-list">{visible.map(item=><Evidence key={item.id} item={item} canReview={has(data,'readiness.approve')} context={context}/>)}</div>:<Empty>{search?'No evidence matches this search.':'No evidence records have been submitted.'}</Empty>}</Panel>
  </div>;
}
function Evidence({item,context,canReview}:{item:Item;context:WorkspaceContext;canReview:boolean}) {
  const expired=Date.parse(String(item.expiresAt))<=Date.now(),independent=item.submittedBy!==context.user.subject;
  const decisions=item.state==='in_review'?[
    ...(independent&&!expired?[{value:'accept',label:'Accept this evidence'}]:[]),{value:'reject',label:'Reject this evidence'},
  ]:item.state==='accepted'?[{value:'revoke',label:'Revoke acceptance'}]:[];
  return <article className="mw-record"><div className="mw-record-line"><div><h3>{gateName(item.gate)}</h3><p>{String(item.operator)} · Zimbabwe · {humanize(item.service)}</p></div><Pill value={expired&&item.state==='accepted'?'expired':item.state}>{expired&&item.state==='accepted'?'Acceptance expired':humanize(item.state)}</Pill></div><p>{String(item.summary)}</p>
    <div className="mw-inline-facts"><span>Scope: {String(item.deviceScope)}</span><span>Issuer: {String(item.issuer??'Not recorded')}</span><span>Issued: {String(item.issuedAt??'Not recorded')}</span><span>Expires: <DateText value={item.expiresAt}/></span></div><p className="mw-secondary">Evidence: {String(item.evidenceRef)}</p>
    <Details label="Review history and decision"><dl className="mw-definition-list"><div><dt>Submitted by</dt><dd className="mw-reference">{String(item.submittedBy)}</dd></div><div><dt>Reviewed by</dt><dd className="mw-reference">{item.reviewedBy?String(item.reviewedBy):'Awaiting review'}</dd></div>{Boolean(item.reviewedAt)&&<div><dt>Review time</dt><dd><DateText value={item.reviewedAt}/></dd></div>}</dl>{Boolean(item.reviewReason)&&<Info>Decision reason: {String(item.reviewReason)}</Info>}
      {canReview&&decisions.length>0&&<><p className="mw-secondary">{!independent&&item.state==='in_review'?'You submitted this record. Another authorized person must accept it.':expired&&item.state==='in_review'?'This evidence has expired. Submit a current record for acceptance.':'A recent authenticated session is required to record this decision.'}</p><RecordForm title={`Review evidence ${item.id}`} busy={context.pending} submitLabel="Save evidence decision" fields={[{name:'decision',label:'Decision',type:'select',options:decisions,wide:true},{name:'reason',label:'Review reason',type:'textarea'}]} onSubmit={v=>context.mutate(`/v1/ops/evidence/${item.id}/review`,{revision:item.revision,decision:v.decision,reason:v.reason},'POST','Evidence decision saved. Network and commercial controls remain unchanged.')}/></>}
      <RecordMeta item={item}/>
    </Details>
  </article>;
}

export function Applications({data,context}:{data:StaffData;context:WorkspaceContext}) {
  const [search,setSearch]=useState('');
  const visible=data.applications.filter(item=>matches(item,search,['displayName','area','state','deviceModel']));
  const writable=has(data,'subscribers.review')&&context.mode==='lab';
  return <div className="mw-stack"><Info>Review lab applications without collecting identity documents here. A pilot registration reference records a review step; it does not verify legal registration, provision a SIM or establish satellite eligibility.</Info>
    {data.launchInterests && <Panel title="Customer launch preferences" hint={`${data.launchInterests.length} shown`}>
      {data.launchInterests.length ? <div className="mw-record-list">{data.launchInterests.map(interest =>
        <article className="mw-record" key={interest.id}>
          <div className="mw-record-line">
            <div><h3>Account reference</h3><p className="mw-reference">{interest.owner}</p></div>
            <Pill value={interest.state}/>
          </div>
          <p className="mw-secondary">Updated <DateText value={interest.updatedAt}/></p>
        </article>
      )}</div> : <Empty>No launch preferences have been recorded.</Empty>}
    </Panel>}
    <Panel title="Pilot applications" hint={`${visible.length} shown`}><Search label="Find loaded applications by participant, area or state" value={search} setValue={setSearch}/>
      {visible.length?<div className="mw-record-list">{visible.map(item=><article className="mw-record" key={item.id}><div className="mw-record-line"><div><h3>{String(item.displayName)}</h3><p>{String(item.area)} · {planName(item.planId)} concept</p></div><Pill value={item.state}>{applicationState(item.state)[0]}</Pill></div><div className="mw-inline-facts"><span>{String(item.deviceModel)}</span><span>SIM preference: {item.simFormat==='esim'?'eSIM':'Physical SIM'}</span><span>Network: <strong>Not provisioned</strong></span></div>
        {Boolean(item.reviewNote)&&<Info>Customer-visible note: {String(item.reviewNote)}</Info>}
        <Details label={`Review ${String(item.displayName)} application`}>
          {writable&&item.state!=='declined'?<RecordForm title={`Review application ${item.id}`} busy={context.pending} submitLabel="Save application review" fields={[
            {name:'decision',label:'Decision',type:'select',options:[{value:'request_information',label:'Ask the customer for information'},{value:'ready_for_host',label:'Mark awaiting host operator'},{value:'decline',label:'Close this pilot application'}],wide:true},
            {name:'registrationReference',label:'Pilot registration-review reference',maxLength:160,required:false,wide:true,hint:'Required when marking awaiting host operator. Use a non-secret internal reference.'},
            {name:'note',label:'Explain the decision and next step to the customer',type:'textarea'},
          ]} onSubmit={v=>{
            if(v.decision==='ready_for_host'&&!v.registrationReference.trim())throw new Error('Add the pilot registration-review reference before marking awaiting host operator.');
            return context.mutate(`/v1/ops/applications/${item.id}/review`,{revision:item.revision,decision:v.decision,note:v.note,...(v.registrationReference.trim()?{registrationReference:v.registrationReference}:{})},'POST','Application review saved. The customer can see the next step.');
          }}/>:<p className="mw-secondary">{item.state==='declined'?'This application is closed. The customer can submit a new pilot application.':'Your current role or workspace mode does not allow a pilot registration review.'}</p>}
          <RecordMeta item={item}/>
        </Details>
      </article>)}</div>:<Empty>{search?'No applications match this search.':'No pilot applications are awaiting your review.'}</Empty>}
    </Panel>
  </div>;
}

export function Support({data,context}:{data:StaffData;context:WorkspaceContext}) {
  const [search,setSearch]=useState(''),writable=has(data,'support.write');
  const tickets=data.tickets.filter(item=>matches(item,search,['subject','message','category','status','assignee']));
  const requests=data.requests.filter(item=>matches(item,search,['type','detail','status','responseNote']));
  return <div className="mw-stack"><Panel title="Support queue"><Search label="Find loaded cases and account requests" value={search} setValue={setSearch}/><p className="mw-secondary">Replies and decisions are visible to the customer. Do not add internal secrets or identity-document contents.</p></Panel>
    <Panel title="Customer support cases" hint={`${tickets.length} shown`}>{tickets.length?<div className="mw-record-list">{tickets.map(item=><article className="mw-record" key={item.id}><div className="mw-record-line"><div><h3>{String(item.subject)}</h3><p>{humanize(item.category)} · {item.assignee?`Assigned to ${String(item.assignee)}`:'Unassigned'}</p></div><Pill value={item.status}/></div><p>{String(item.message)}</p><Details label={`Handle case: ${String(item.subject)}`}><Notes items={item.notes}/>
      {writable&&<RecordForm title={`Update support case ${item.id}`} busy={context.pending} submitLabel="Save reply and case status" fields={[
        {name:'status',label:'Case status',type:'select',options:options(['open','in_progress','resolved']),value:String(item.status)},
        {name:'assignee',label:'Assigned staff reference',maxLength:80,required:false,value:String(item.assignee??''),hint:'A team member’s staff reference. Leave blank to keep the current assignment.'},
        {name:'note',label:'Customer-visible reply',type:'textarea'},
      ]} onSubmit={v=>context.mutate(`/v1/support/tickets/${item.id}`,{revision:item.revision,status:v.status,note:v.note,...(v.assignee.trim()?{assignee:v.assignee}:{})},'PATCH','Reply and case status saved.')}/>}<RecordMeta item={item}/>
    </Details></article>)}</div>:<Empty>{search?'No support cases match this search.':'There are no support cases in the queue.'}</Empty>}</Panel>
    <Panel title="Account and service requests" hint={`${requests.length} shown`}><p className="mw-secondary">Resolving a request records the staff response. It does not perform account deletion, data erasure, number porting or SIM replacement.</p>{requests.length?<div className="mw-record-list">{requests.map(item=><article className="mw-record" key={item.id}><div className="mw-record-line"><h3>{humanize(item.type)}</h3><Pill value={item.status}/></div><p>{String(item.detail)}</p>{Boolean(item.responseNote)&&<Info>Staff response: {String(item.responseNote)}</Info>}
      <Details label={`Handle ${humanize(item.type).toLowerCase()} request`}>
        {writable&&item.status!=='resolved'&&<RecordForm title={`Handle account request ${item.id}`} busy={context.pending} submitLabel="Save staff response" fields={[{name:'status',label:'Handling status',type:'select',options:options(['in_progress','resolved']),wide:true},{name:'note',label:'Explain the response and any remaining steps',type:'textarea'}]} onSubmit={v=>context.mutate(`/v1/ops/requests/${item.id}`,{revision:item.revision,status:v.status,note:v.note},'PATCH','Staff response saved. No automatic account or network change was performed.')}/>}
        <dl className="mw-definition-list"><div><dt>Customer reference</dt><dd className="mw-reference">{item.owner}</dd></div>{Boolean(item.handledAt)&&<div><dt>Response recorded</dt><dd><DateText value={item.handledAt}/></dd></div>}</dl><RecordMeta item={item}/>
      </Details>
    </article>)}</div>:<Empty>{search?'No account requests match this search.':'There are no account requests in the queue.'}</Empty>}</Panel>
  </div>;
}

export function Billing({data,context}:{data:StaffData;context:WorkspaceContext}) {
  const [search,setSearch]=useState(''),writable=has(data,'billing.write')&&context.mode==='lab';
  const visible=data.ledger.filter(item=>matches(item,search,['reference','description','state','method']));
  const accountField:Field=data.billingAccounts.length?{name:'applicationId',label:'Pilot application',type:'select',options:data.billingAccounts.map(a=>({value:a.id,label:`${a.displayName} · ${a.id.slice(0,8)}`})),wide:true}:{name:'applicationId',label:'Pilot application reference',maxLength:36,wide:true,hint:'Use the full application reference supplied for this lab test. It is not a phone number.'};
  return <div className="mw-stack"><Info tone="pending">Lab ledger only. These actions record test amounts and test refunds. They do not charge a card, move mobile money, produce a tax invoice or activate a plan.</Info>
    {writable&&<Panel title="Record a test payment"><Details label="Add a lab ledger entry"><RecordForm title="Record test payment" busy={context.pending} submitLabel="Save test entry — no money moves" fields={[
      accountField, {name:'amount',label:'Test amount (USD)',inputMode:'decimal',pattern:'[0-9]+(\\.[0-9]{1,2})?',maxLength:10,hint:'For example 12.50. USD is the only lab currency.'},
      {name:'method',label:'Test payment method',type:'select',options:[{value:'cash_test',label:'Cash test'},{value:'card_test',label:'Card test'},{value:'mobile_money_test',label:'Mobile money test'}]},
      {name:'reference',label:'Your test transaction reference',pattern:'[A-Za-z0-9][A-Za-z0-9_\\-]{5,79}',maxLength:80,hint:'6–80 letters, numbers, hyphens or underscores. No real payment credentials.'},
      {name:'description',label:'Description',maxLength:140},
    ]} onSubmit={v=>context.mutate('/v1/ops/ledger',{applicationId:v.applicationId,amountMinor:usdMinor(v.amount),currency:'USD',method:v.method,reference:v.reference,description:v.description},'POST','Test ledger entry saved. No money moved.')}/></Details></Panel>}
    <Panel title={context.user.role==='agent'?'Your test ledger':'Test ledger'} hint={`${visible.length} shown`}><Search label="Find loaded test entries by reference or description" value={search} setValue={setSearch}/>
      {visible.length?<div className="mw-record-list">{visible.map(item=><article className="mw-record" key={item.id}><div className="mw-record-line"><div><h3>{String(item.description)}</h3><p>Reference {String(item.reference)} · {humanize(item.method)}</p></div><strong><Money minor={item.amountMinor}/></strong></div><div className="mw-inline-facts"><Pill value={item.state}/><span>Test refunds: <Money minor={item.refundedMinor}/></span><span>Recorded <DateText value={item.createdAt}/></span></div>
        <Details label={`Receipt and refunds for ${String(item.reference)}`}><MutationButton context={context} action={()=>context.download(`/v1/documents/${item.id}.pdf`,'onesa-mobile-test-receipt.pdf')}>Download test receipt PDF</MutationButton>
          {Array.isArray(item.refunds)&&item.refunds.length>0&&<ul className="mw-notes">{(item.refunds as {amountMinor:number;reason:string;at:string}[]).map((refund,index)=><li key={index}><strong><Money minor={refund.amountMinor}/></strong><p>{refund.reason}</p><small><DateText value={refund.at}/></small></li>)}</ul>}
          {writable&&context.user.role!=='agent'&&Number(item.refundedMinor)<Number(item.amountMinor)&&<Details label="Record a test refund"><RecordForm title={`Test refund ${item.id}`} busy={context.pending} submitLabel="Save test refund — no money moves" fields={[{name:'amount',label:'Test refund amount (USD)',inputMode:'decimal',pattern:'[0-9]+(\\.[0-9]{1,2})?',maxLength:10,wide:true},{name:'reason',label:'Refund reason',type:'textarea'}]} onSubmit={v=>{
            const amount=usdMinor(v.amount); if(amount>Number(item.amountMinor)-Number(item.refundedMinor))throw new Error('The test refund exceeds the remaining amount on this entry.');
            return context.mutate(`/v1/ops/ledger/${item.id}/refunds`,{revision:item.revision,amountMinor:amount,reason:v.reason},'POST','Test refund saved. No money moved.');
          }}><p className="mw-secondary">Remaining test amount: <Money minor={Number(item.amountMinor)-Number(item.refundedMinor)}/>. A recent sign-in is required.</p></RecordForm></Details>}
          <RecordMeta item={item}/>
        </Details>
      </article>)}</div>:<Empty>{search?'No test entries match this search.':'No test ledger entries have been recorded for this view.'}</Empty>}
    </Panel>
  </div>;
}

export function Audit({data}:{data:StaffData}) {
  const [search,setSearch]=useState('');
  const visible=data.audit.filter(item=>!search.trim()||[item.action,item.actor,item.role,item.target].some(v=>v.toLowerCase().includes(search.trim().toLowerCase())));
  return <div className="mw-stack"><Info tone={data.auditIntegrity===false?'error':'neutral'}>{data.auditIntegrity===true?'The stored audit chain passed its consistency check.':data.auditIntegrity===false?'The audit chain failed its consistency check. Preserve the records and escalate to security.':'Audit consistency has not been checked.'} A consistency check does not replace independent log retention or prove that every external action was recorded.</Info>
    <Panel title="Audit trail" hint="Latest recorded actions"><Search label="Find loaded audit actions by actor, action or target" value={search} setValue={setSearch}/>{visible.length?<div className="mw-table-scroll" role="region" aria-label="Audit records" tabIndex={0}><table><thead><tr><th scope="col">Time</th><th scope="col">Action</th><th scope="col">Actor</th><th scope="col">Target</th></tr></thead><tbody>{visible.map(item=><tr key={item.id}><td><DateText value={item.at}/></td><td>{item.action}<small>Sequence {item.sequence}</small></td><td><span className="mw-reference">{item.actor}</span><small>{humanize(item.role)}</small></td><td className="mw-reference">{item.target}</td></tr>)}</tbody></table></div>:<Empty>{search?'No audit actions match this search.':'No audit actions are available.'}</Empty>}</Panel>
  </div>;
}
