import { useState } from 'react';
import type { Field } from './components';
import { Details, Empty, Info, matches, MutationButton, options, Panel, Pill, RecordForm, RecordMeta, Search, DateText } from './components';
import type { Item, StaffData, WorkspaceContext } from './types';
import { humanize } from './helpers.mjs';

const assetTypes = ['android_phone', 'iphone', 'tablet', 'router', 'access_point', 'switch', 'ups', 'satellite_terminal', 'test_sim', 'workstation', 'other'];
const checkKeys = ['asset_label', 'power', 'firmware', 'management_security', 'equipment_approval', 'connectivity', 'recovery'];
const pathOptions = [{value:'terrestrial',label:'Terrestrial mobile'}, {value:'direct_to_cell',label:'Handset direct to cell'}, {value:'dish_wifi',label:'Dish and Wi-Fi'}];
const optional = (value: string | undefined) => value?.trim() ? value.trim() : undefined;
function siteOptions(sites: Item[]) { return sites.map(site => ({ value: site.id, label: String(site.name) })); }

export function Hardware({ data, context }: { data: StaffData; context: WorkspaceContext }) {
  const [search, setSearch] = useState('');
  const writable = data.permissions.includes('hardware.write');
  const visible = data.assets.filter(asset => matches(asset, search, ['tag', 'manufacturer', 'model', 'assetType', 'state']));
  return <div className="mw-stack">
    <Info>Inventory records describe your equipment. Commissioning is evidence of completed checks; network status stays unobserved until an authenticated measurement is available.</Info>
    <div className="mw-columns">
      <Panel title="Pilot sites" hint={`${data.sites.length} shown`}>
        {data.sites.length ? <ul className="mw-plain-list">{data.sites.map(site => <li key={site.id}><div><strong>{String(site.name)}</strong><small>{String(site.area)} · {humanize(site.purpose)}</small></div><Pill value={site.state}/></li>)}</ul> : <Empty>Add your device bench or field-trial location to begin.</Empty>}
        {writable && <Details label="Add a site"><RecordForm title="Add a site" busy={context.pending} submitLabel="Save site" fields={[
          {name:'name',label:'Site name',maxLength:80}, {name:'area',label:'Area or district',maxLength:100},
          {name:'purpose',label:'Purpose',type:'select',options:options(['device_bench','wifi_backhaul','field_trial']),wide:true},
        ]} onSubmit={v => context.mutate('/v1/ops/sites',{name:v.name,area:v.area,purpose:v.purpose},'POST','Site saved. Add its equipment next.')}/></Details>}
      </Panel>
      <Panel title="Add equipment" hint="Plan before procurement">
        {writable && data.sites.length > 0 ? <Details label="Register a planned asset"><RecordForm title="Register a planned asset" busy={context.pending} submitLabel="Save planned asset" fields={[
          {name:'siteId',label:'Site',type:'select',options:siteOptions(data.sites)},
          {name:'tag',label:'Asset tag',pattern:'[A-Z0-9][A-Z0-9_\\-]{2,31}',maxLength:32,hint:'Your internal label, for example OM-PHONE-01.'},
          {name:'assetType',label:'Equipment type',type:'select',options:options(assetTypes)},
          {name:'manufacturer',label:'Manufacturer',maxLength:60}, {name:'model',label:'Model',maxLength:100},
          {name:'firmware',label:'Firmware / software',required:false,maxLength:80},
          {name:'powerWatts',label:'Nameplate power (W)',type:'number',min:0,max:10000,step:'0.1',required:false,hint:'Leave blank when unknown. A rating is not a measured power draw or battery-runtime result.'},
          {name:'custodian',label:'Custodian / responsible team',required:false,maxLength:80},
          {name:'serialReference',label:'Internal serial record reference',required:false,maxLength:160,hint:'Reference your controlled inventory. No SIM keys or handset identifiers are needed here.'},
          {name:'supplierReference',label:'Supplier / procurement reference',required:false,maxLength:160},
          {name:'typeApprovalRef',label:'Equipment approval reference',required:false,maxLength:160,hint:'A non-secret reference, without credentials or subscriber identifiers.'},
        ]} onSubmit={v => context.mutate('/v1/ops/assets',{siteId:v.siteId,tag:v.tag,assetType:v.assetType,manufacturer:v.manufacturer,model:v.model,...(optional(v.firmware)?{firmware:v.firmware}:{}),...(v.powerWatts?{powerWatts:Number(v.powerWatts)}:{}),...(optional(v.custodian)?{custodian:v.custodian}:{}),...(optional(v.serialReference)?{serialReference:v.serialReference}:{}),...(optional(v.supplierReference)?{supplierReference:v.supplierReference}:{}),...(optional(v.typeApprovalRef)?{typeApprovalRef:v.typeApprovalRef}:{})},'POST','Planned asset saved. Record receipt when it arrives.')}/></Details>
          : <Empty>{writable ? 'Create a site first. No equipment has been purchased by adding a record.' : 'Your role can review inventory. Operations staff can add and commission equipment.'}</Empty>}
        <p className="mw-secondary">Use internal asset labels. Do not enter SIM authentication keys, passwords, national ID numbers or customer phone numbers.</p>
      </Panel>
    </div>
    <Panel title="Equipment inventory" hint={`${visible.length} of ${data.assets.length} shown`}>
      <Search label="Find equipment by tag, model or state" value={search} setValue={setSearch}/>
      {visible.length ? <div className="mw-record-list">{visible.map(asset => <Asset key={asset.id} asset={asset} siteName={String(data.sites.find(s=>s.id===asset.siteId)?.name??'Site record unavailable')} writable={writable} context={context}/>)}</div> : <Empty>{search ? 'No equipment matches this search.' : 'No equipment records yet. Start with a planned asset.'}</Empty>}
    </Panel>
  </div>;
}
function Asset({ asset, siteName, writable, context }: { asset: Item; siteName: string; writable: boolean; context: WorkspaceContext }) {
  const checks = (asset.checks ?? {}) as Record<string, {result:string;evidenceRef?:string;checkedAt?:string;checkedBy?:string;note?:string}>;
  const complete = Object.values(checks).filter(check => ['pass','not_applicable'].includes(check.result)).length;
  return <article className="mw-record">
    <div className="mw-record-line"><div><h3>{String(asset.tag)} <span>{String(asset.manufacturer)} {String(asset.model)}</span></h3><p>{siteName} · {humanize(asset.assetType)} · {complete}/{checkKeys.length} checks complete</p></div><Pill value={asset.state}/></div>
    <div className="mw-inline-facts"><span>Network: <strong>Unobserved</strong></span><span>Firmware: {String(asset.firmware)}</span><span>Nameplate power: {asset.powerRatingRecorded === true && asset.powerWatts != null ? `${Number(asset.powerWatts)} W` : 'Not recorded / needs confirmation'}</span></div>
    {asset.faultReported === true && <Info tone="error">A physical fault was reported. All commissioning checks must be repeated before this item can be commissioned again.</Info>}
    <Details label={`View ${String(asset.tag)} checks and actions`}>
      <RecordMeta item={asset}/>
      <dl className="mw-definition-list"><div><dt>Custodian</dt><dd>{String(asset.custodian??'Not recorded')}</dd></div><div><dt>Serial record reference</dt><dd className="mw-reference">{String(asset.serialReference??'Not recorded')}</dd></div><div><dt>Supplier / procurement reference</dt><dd className="mw-reference">{String(asset.supplierReference??'Not recorded')}</dd></div></dl>
      <dl className="mw-check-grid">{checkKeys.map(key => <div key={key}><dt>{humanize(key)}</dt><dd><Pill value={checks[key]?.result??'not_run'}/>{checks[key]?.evidenceRef && <small>{checks[key].evidenceRef} · <DateText value={checks[key].checkedAt}/></small>}{checks[key]?.note&&<small className="mw-observation">{checks[key].note}</small>}{checks[key]?.checkedBy&&<small>Checked by <span className="mw-reference">{checks[key].checkedBy}</span></small>}</dd></div>)}</dl>
      <MutationButton context={context} action={()=>context.download(`/v1/ops/records/assets/${asset.id}`,`onesa-mobile-asset-${String(asset.tag)}.json`)}>Download asset record and check history</MutationButton>
      {writable && asset.state !== 'retired' && <div className="mw-stack">
        {asset.state === 'planned' && <MutationButton context={context} action={() => context.mutate(`/v1/ops/assets/${asset.id}`,{revision:asset.revision,state:'received'},'PATCH','Asset receipt recorded. Complete the commissioning checks next.')}>Record asset received</MutationButton>}
        {asset.state !== 'planned' && <Details label={`Record a commissioning check for ${String(asset.tag)}`}><RecordForm title={`Commission ${String(asset.tag)}`} busy={context.pending} submitLabel="Save check evidence" fields={[
          {name:'check',label:'Commissioning check',type:'select',options:options(checkKeys)},
          {name:'result',label:'Observed result',type:'select',options:options(['pass','fail','not_applicable'])},
          {name:'evidenceRef',label:'Evidence reference',maxLength:160,wide:true},
          {name:'note',label:'Observation / reason',type:'textarea',required:false},
        ]} onSubmit={v => context.mutate(`/v1/ops/assets/${asset.id}/checks`,{revision:asset.revision,check:v.check,result:v.result,evidenceRef:v.evidenceRef,...(optional(v.note)?{note:v.note}:{})},'POST','Commissioning check saved. Network connectivity remains a separate observation.')}><p className="mw-secondary">Asset label, power, management security and equipment approval must be assessed for every item. Only SIMs, UPS units and passive “other” items may skip firmware, connectivity or recovery, with an explicit reason. Managed access points, phones, tablets, routers and workstations need every check.</p></RecordForm></Details>}
        <Details label={`Update ${String(asset.tag)} inventory`}><RecordForm title={`Update ${String(asset.tag)} inventory`} busy={context.pending} reset={false} submitLabel="Save inventory update" fields={[
          {name:'state',label:'Inventory state',type:'select',options:options(asset.state==='planned'?['planned','received','faulty','retired']:['received','faulty','retired']),required:false,hint:'Leave unchanged when updating metadata only.'},
          {name:'custodian',label:'Custodian / responsible team',required:false,maxLength:80,value:String(asset.custodian??'')},
          {name:'serialReference',label:'Internal serial record reference',required:false,maxLength:160,value:String(asset.serialReference??'')},
          {name:'supplierReference',label:'Supplier / procurement reference',required:false,maxLength:160,value:String(asset.supplierReference??'')},
          {name:'firmware',label:'Firmware / software',required:false,maxLength:80,value:String(asset.firmware)},
          {name:'powerWatts',label:'Nameplate power (W)',type:'number',min:0,max:10000,step:'0.1',required:false,value:asset.powerRatingRecorded === true ? String(asset.powerWatts??'') : '',hint:'Record the rating from the actual item. This does not record a load measurement.'},
          {name:'clearPowerRating',label:'Clear the stored power rating because it is unknown',type:'checkbox',required:false},
          {name:'typeApprovalRef',label:'Equipment approval reference',required:false,maxLength:160,value:String(asset.typeApprovalRef??''),wide:true},
        ]} onSubmit={v => {
          if(!v.state&&v.clearPowerRating!=='true'&&![v.firmware,v.typeApprovalRef,v.custodian,v.serialReference,v.supplierReference,v.powerWatts].some(value=>value.trim()))throw new Error('Enter a change to save.');
          return context.mutate(`/v1/ops/assets/${asset.id}`,{revision:asset.revision,...(v.state?{state:v.state}:{}),...(optional(v.firmware)?{firmware:v.firmware}:{}),...(v.clearPowerRating==='true'?{powerWatts:null}:v.powerWatts!==''?{powerWatts:Number(v.powerWatts)}:{}),...(optional(v.typeApprovalRef)?{typeApprovalRef:v.typeApprovalRef}:{}),...(optional(v.custodian)?{custodian:v.custodian}:{}),...(optional(v.serialReference)?{serialReference:v.serialReference}:{}),...(optional(v.supplierReference)?{supplierReference:v.supplierReference}:{})},'PATCH','Inventory update saved.');
        }}><p className="mw-secondary">A serial reference, firmware, power rating or approval change resets the affected checks. Reporting a fault requires every check to be repeated. Leaving an optional field blank keeps its current value; the checkbox explicitly clears an unknown power rating.</p></RecordForm></Details>
      </div>}
    </Details>
  </article>;
}

export function Trials({ data, context }: { data: StaffData; context: WorkspaceContext }) {
  const [search,setSearch]=useState(''), writable=data.permissions.includes('hardware.write');
  const visible=data.trials.filter(item=>matches(item,search,['scenario','operator','path','service','result']));
  return <div className="mw-stack"><Info>Record an authorized test that you performed or a labelled lab simulation. Saving a trial never configures a radio, connects a SIM, or enables satellite service.</Info>
    <Panel title="Field-trial plan" hint="Evidence before claims">
      {writable && data.sites.length > 0 && data.assets.length > 0 ? <Details label="Plan a field trial"><RecordForm title="Plan a field trial" busy={context.pending} submitLabel="Save trial plan" fields={[
        {name:'siteId',label:'Site',type:'select',options:siteOptions(data.sites)},
        {name:'assetId',label:'Test asset',type:'select',options:data.assets.filter(a=>a.state!=='retired').map(a=>({value:a.id,label:`${String(a.tag)} · ${String(data.sites.find(s=>s.id===a.siteId)?.name??'Unknown site')}`})),hint:'Choose an asset belonging to the selected site.'},
        {name:'path',label:'Connectivity path',type:'select',options:pathOptions},
        {name:'service',label:'Function under test',type:'select',options:options(['sms','app_data','app_voice','native_voice','internet'])},
        {name:'operator',label:'Operator / contracted provider',maxLength:80}, {name:'plannedFor',label:'Planned date',type:'date',required:false},
        {name:'deviceScope',label:'Exact device and test scope reference',maxLength:160,wide:true,hint:'Use the same reference as the reviewed evidence. Its controlled record must identify device SKU, firmware/carrier settings, SIM/profile and test limits.'},
        {name:'scenario',label:'Test scenario',maxLength:160,wide:true},
        {name:'acceptanceCriteria',label:'Pass criteria agreed before the test',type:'textarea',hint:'Describe the function, attempts, measurements, limits and evidence needed. Do not choose thresholds after observing the result.'},
      ]} onSubmit={v=>context.mutate('/v1/ops/trials',{siteId:v.siteId,assetId:v.assetId,path:v.path,service:v.service,operator:v.operator,deviceScope:v.deviceScope,acceptanceCriteria:v.acceptanceCriteria,scenario:v.scenario,...(v.plannedFor?{plannedFor:v.plannedFor}:{})},'POST','Field-trial plan saved. No network action was executed.')}/></Details>
        : <Empty>{writable ? 'Add a site and its test equipment before planning a field trial.' : 'Your role can review recorded field trials.'}</Empty>}
    </Panel>
    <Panel title="Trial records" hint={`${visible.length} shown`}><Search label="Find a trial by scenario, operator or result" value={search} setValue={setSearch}/>
      {visible.length ? <div className="mw-record-list">{visible.map(trial=><article className="mw-record" key={trial.id}>
        <div className="mw-record-line"><div><h3>{String(trial.scenario)}</h3><p>{String(trial.operator)} · {humanize(trial.path)} · {humanize(trial.service)}</p></div><Pill value={trial.result??trial.state}>{trial.source==='lab_simulator'?'Simulation · ':''}{humanize(trial.result??trial.state)}</Pill></div>
        <p className="mw-secondary">{String(data.assets.find(a=>a.id===trial.assetId)?.tag??trial.assetId)} · {String(data.sites.find(s=>s.id===trial.siteId)?.name??'Site unavailable')}</p>
        <p className="mw-secondary">Device/test scope: {String(trial.deviceScope??'Not recorded — replan before a passing manual result')}</p>
        {Boolean(trial.acceptanceCriteria)&&<p><strong>Pass criteria:</strong> {String(trial.acceptanceCriteria)}</p>}
        {trial.state==='completed' ? <div className="mw-stack"><p>{String(trial.observation)}</p><div className="mw-inline-facts"><span>Source: <strong>{humanize(trial.source)}</strong></span><span>Observed: <DateText value={trial.observedAt}/></span>{trial.latencyMs!==undefined&&<span>Latency: {Number(trial.latencyMs)} ms</span>}{trial.downloadMbps!==undefined&&<span>Download: {Number(trial.downloadMbps)} Mbps</span>}</div><p className="mw-secondary">Evidence: {String(trial.evidenceRef)}. Recorded observations do not independently establish service availability.</p></div>
          : writable && <Details label={`Record result for ${String(trial.scenario)}`}><TrialResult trial={trial} data={data} context={context}/></Details>}
        {trial.state==='completed'&&<p className="mw-secondary">Authorization assessment: {humanize(trial.authorizationAssessment??'Not recorded by this software version')}. {trial.authorizationRef?`Test plan: ${String(trial.authorizationRef)}.`:''} Recorded authorization is an internal assessment, not permission issued by this application.</p>}
        <Details label="Record reference and time"><RecordMeta item={trial}/><MutationButton context={context} action={()=>context.download(`/v1/ops/records/trials/${trial.id}`,`onesa-mobile-trial-${trial.id}.json`)}>Download trial and captured evidence</MutationButton></Details>
      </article>)}</div> : <Empty>{search?'No trials match this search.':'No field trials have been recorded.'}</Empty>}
    </Panel>
  </div>;
}
function TrialResult({trial,data,context}:{trial:Item;data:StaffData;context:WorkspaceContext}) {
  const matchingEvidence=data.gates.filter(item=>item.state==='accepted'&&item.country==='ZW'&&item.operator===trial.operator&&item.service===trial.path&&item.deviceScope===trial.deviceScope&&Date.parse(String(item.expiresAt))>Date.now());
  const fields:Field[]=[
    {name:'result',label:'Result',type:'select',options:options(['pass','fail','blocked'])},
    {name:'source',label:'Evidence source',type:'select',options:[{value:'manual_field_record',label:'Manual field observation'},{value:'lab_simulator',label:'Lab simulation'}]},
    {name:'observedAt',label:'Observation date and time',type:'datetime-local',step:'1',hint:'Include seconds in your device’s local time. Saved as a time-zone-independent timestamp; plan order is checked to the second.'},
    {name:'evidenceRef',label:'Evidence reference',maxLength:160},
    {name:'authorizationRef',label:'Approved test-plan reference',maxLength:160,required:false,hint:'Required only for a passing manual observation. The approved plan must cover this function, device/profile, location, test window and limits.'},
    {name:'latencyMs',label:'Measured latency (ms)',type:'number',min:0,max:60000,step:'0.1',required:false},
    {name:'downloadMbps',label:'Measured download (Mbps)',type:'number',min:0,max:10000,step:'0.01',required:false},
    {name:'observation',label:'What happened?',type:'textarea'},
  ];
  return <RecordForm title={`Record result ${trial.id}`} fields={fields} busy={context.pending} submitLabel="Save immutable result" onSubmit={v=>context.mutate(`/v1/ops/trials/${trial.id}/results`,{revision:trial.revision,result:v.result,source:v.source,observedAt:new Date(v.observedAt).toISOString(),evidenceRef:v.evidenceRef,observation:v.observation,...(v.result==='pass'&&v.source==='manual_field_record'?{authorizationRef:v.authorizationRef,evidenceIds:Object.entries(v).filter(([key])=>key.startsWith('trialEvidence_')).map(([,value])=>value)}:{}),...(v.latencyMs!==''?{latencyMs:Number(v.latencyMs)}:{}),...(v.downloadMbps!==''?{downloadMbps:Number(v.downloadMbps)}:{})},'POST','Trial result saved. Repeat the trial to record another observation.')}>
    <fieldset className="mw-stack"><legend>Reviewed authorization for a passing manual result</legend><p className="mw-secondary">Select the matching host agreement and equipment approval. Direct-to-cell also needs Zimbabwe satellite authorization and satellite entitlement. Evidence must be valid at the observation time and today. Simulated, failed and blocked results do not use these selections.</p>
      {matchingEvidence.length?matchingEvidence.map(item=><label className="mw-check" key={item.id}><input type="checkbox" name={`trialEvidence_${item.id}`} value={item.id}/><span><strong>{humanize(item.gate)}</strong> · {String(item.evidenceRef)}<small>Expires <DateText value={item.expiresAt}/></small></span></label>):<Empty>No matching current accepted evidence is loaded. Submit and independently review the exact scope in Readiness before recording a passing manual result.</Empty>}
    </fieldset><p className="mw-secondary">A passing result also requires commissioned equipment. Hardware and evidence revisions are captured with the result. Completed observations cannot be overwritten and do not establish present-day coverage.</p></RecordForm>;
}
