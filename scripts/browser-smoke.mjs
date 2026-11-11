// Development/CI browser qualification only. This script creates its own loopback
// server and disposable synthetic database; it cannot target an external website.
// Generated sign-in values stay in memory and are never written to artifacts.
import assert from 'node:assert/strict';
import { createServer, request as proxyRequest } from 'node:http';
import { readFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
import { appStoreListings } from '../onesa-mobile-frontend/web/src/app-store-listings.ts';
import { createPlatformServer } from '../onesa-mobile-backend/src/platform/http.ts';
import { loadPlatformConfig } from '../onesa-mobile-backend/src/platform/config.ts';
import { totpAt } from '../onesa-mobile-backend/src/auth/crypto.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'onesa-mobile-frontend/web/dist');
if (!existsSync(join(dist, 'index.html'))) throw new Error('Build the web package before running browser qualification.');
const artifacts = resolve(process.env.MOBILE_BROWSER_ARTIFACTS ?? join(root, '.validation/browser'));
await mkdir(artifacts, {recursive: true});
const temporary = await mkdtemp(join(tmpdir(), 'onesa-mobile-browser-'));
const secrets = [], checks = [], layouts = [], runtimeErrors = [], unexpectedRequests = [];
const sanitize = value => secrets.reduce((text, secret) => secret ? text.replaceAll(secret, '[synthetic secret removed]') : text, String(value));
const record = name => { checks.push(name); console.info('PASS ' + name); };
const mime = {'.html':'text/html; charset=utf-8', '.js':'application/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png'};
let instance, browser, apiPort;
const gateway = createServer((req, res) => {
  if (!req.url || req.url.length > 4096) { res.writeHead(400).end(); return; }
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname.startsWith('/api/')) {
    const upstream = proxyRequest({hostname:'127.0.0.1', port:apiPort, path:url.pathname.slice(4)+url.search, method:req.method, headers:req.headers}, response => {
      res.writeHead(response.statusCode ?? 502, response.headers); response.pipe(res);
    });
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(502, {'Content-Type':'application/json'}); res.end('{"error":{"code":"TEST_UPSTREAM_UNAVAILABLE","message":"Synthetic test upstream unavailable"}}'); });
    req.pipe(upstream); return;
  }
  const shell = ['/', '/account/', '/internal/', '/preview/internal/'].includes(url.pathname);
  if (!shell && !/^\/assets\/[A-Za-z0-9._-]+$/.test(url.pathname)) { res.writeHead(404).end(); return; }
  const path = join(dist, shell ? 'index.html' : url.pathname);
  if (!existsSync(path)) { res.writeHead(404).end(); return; }
  res.writeHead(200, {'Content-Type':mime[extname(path)] ?? 'application/octet-stream', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer'});
  createReadStream(path).pipe(res);
});
function listen(server) { return new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen)); }
function close(server) { return new Promise(resolveClose => { server.closeAllConnections?.(); server.close(resolveClose); }); }
function actor(account) { return {subject:account.subject, displayName:'Synthetic '+account.role, role:account.role}; }
let origin;

async function context() {
  const ctx = await browser.newContext({viewport:{width:1440,height:1000}, locale:'en-GB', timezoneId:'UTC', reducedMotion:'reduce', acceptDownloads:true});
  await ctx.route('**/*', route => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    unexpectedRequests.push(new URL(route.request().url()).origin); return route.abort('blockedbyclient');
  });
  ctx.on('page', page => { page.on('pageerror', error => runtimeErrors.push(sanitize(error.message))); page.setDefaultTimeout(12000); });
  return ctx;
}
async function section(page, key, heading) {
  await page.goto(origin + (page.url().includes('/internal/') ? '/internal/' : '/account/') + '#' + key);
  await page.getByRole('heading', {name:heading, exact:true, level:1}).waitFor();
  await page.locator('button[aria-label="Refresh workspace"]:enabled').waitFor();
}
async function login(page, account, surface) {
  await page.goto(origin + (surface === 'staff' ? '/internal/' : '/account/'));
  const form = page.getByRole('form', {name:(surface === 'staff' ? 'Staff' : 'Customer')+' sign-in', exact:true});
  await form.getByLabel('Lab username', {exact:false}).fill(account.username);
  await form.getByLabel('Lab password', {exact:false}).fill(account.password);
  if (surface === 'staff') {
    const code = totpAt(account.totpSecret, Math.floor(Date.now()/1000)); secrets.push(code);
    await form.getByLabel('Authenticator code', {exact:false}).fill(code);
  }
  const response = page.waitForResponse(value => value.url().endsWith('/api/v1/session/login') && value.request().method()==='POST');
  await form.getByRole('button', {name:'Sign in to pilot', exact:true}).click();
  assert.equal((await response).status(), 200, 'synthetic account signs in through the real form');
  await page.getByRole('heading', {name:'Overview', exact:true, level:1}).waitFor();
  await page.locator('button[aria-label="Refresh workspace"]:enabled').waitFor();
}
async function openDetails(page, label) {
  const summary = page.locator('summary').filter({hasText:label});
  assert.equal(await summary.count(), 1, 'one expected disclosure: '+label);
  if (!await summary.evaluate(element => element.parentElement.open)) await summary.click();
}
async function save(page, form, path, method = 'POST', status = 201) {
  const response = page.waitForResponse(value => new URL(value.url()).pathname === '/api'+path && value.request().method()===method);
  await form.locator('button[type="submit"]').click();
  const received = await response;
  assert.equal(received.status(), status, 'expected HTTP result for '+path);
  const data = await received.json();
  if (status < 400) await page.locator('button[aria-label="Refresh workspace"]:enabled').waitFor();
  return data;
}
async function assertLayout(page, surface, widths = [320,390,768,1440]) {
  for (const width of widths) {
    await page.setViewportSize({width,height:1000});
    await page.evaluate(() => window.scrollTo({top:0,left:0,behavior:'instant'}));
    const result = await page.evaluate(() => {
      const brokenCheckWords=[];
      for (const label of document.querySelectorAll('.mw-check-grid dt')) {
        if (!label.getClientRects().length) continue;
        const walker=document.createTreeWalker(label,NodeFilter.SHOW_TEXT);
        for (let node=walker.nextNode();node;node=walker.nextNode()) {
          for (const word of node.textContent.matchAll(/\S+/g)) {
            const range=document.createRange();range.setStart(node,word.index);range.setEnd(node,word.index+word[0].length);
            if (range.getClientRects().length>1) brokenCheckWords.push(word[0]);
          }
        }
      }
      return {viewport:window.innerWidth, document:document.documentElement.scrollWidth, body:document.body.scrollWidth,brokenCheckWords,
      controls:[...document.querySelectorAll('form input:not([type="checkbox"]):not([type="hidden"]), form select, form textarea, form button[type="submit"]')]
        .filter(element=>element.getClientRects().length>0).map(element=>{const rect=element.getBoundingClientRect();return {name:element.getAttribute('name')??element.tagName,left:rect.left,right:rect.right,height:rect.height};})};});
    assert.ok(Math.max(result.document,result.body) <= result.viewport+1, `${surface} overflows at ${width}px: ${JSON.stringify(result)}`);
    assert.deepEqual(result.controls.filter(control=>control.left < -1 || control.right > result.viewport+1 || control.height < 44),[],`${surface} visible form controls fit and have 44px targets at ${width}px`);
    assert.deepEqual(result.brokenCheckWords,[],`${surface} commissioning labels preserve whole words at ${width}px`);
    layouts.push({surface,width,overflow:false});
    if ([390,1440].includes(width)) await page.screenshot({path:join(artifacts, surface+'-'+width+'.png'),fullPage:true});
  }
  record(surface+' reflows at 320, 390, 768 and 1440 pixels');
}
async function enlargedText(page, surface) {
  await page.setViewportSize({width:390,height:1000});
  const result = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('body *')].filter(element => element instanceof HTMLElement);
    const sizes = nodes.map(element => ({element, size:Number.parseFloat(getComputedStyle(element).fontSize),
      value:element.style.getPropertyValue('font-size'), priority:element.style.getPropertyPriority('font-size')}));
    try {
      for (const {element,size} of sizes) if (Number.isFinite(size)) element.style.setProperty('font-size',size*2+'px','important');
      return {viewport:window.innerWidth, document:document.documentElement.scrollWidth, body:document.body.scrollWidth};
    } finally {
      for (const {element,value,priority} of sizes) {
        if (value) element.style.setProperty('font-size',value,priority);
        else element.style.removeProperty('font-size');
      }
    }
  });
  assert.ok(Math.max(result.document,result.body) <= result.viewport+1, `${surface} overflows with twice-size text: ${JSON.stringify(result)}`);
  layouts.push({surface,width:390,textScale:2,overflow:false});
  record(surface+' retains page reflow with twice-size text');
}

try {
  await listen(gateway); origin = 'http://127.0.0.1:'+gateway.address().port;
  instance = createPlatformServer(loadPlatformConfig({APP_MODE:'lab', DATABASE_PATH:join(temporary,'synthetic.sqlite'), PUBLIC_ORIGIN:origin, CORS_ALLOWED_ORIGINS:origin}));
  await listen(instance.server); apiPort = instance.server.address().port;
  const accounts = {};
  for (const role of ['customer','operations','admin']) {
    accounts[role] = await instance.auth.createLabUser({username:'synthetic-'+role, displayName:'Synthetic '+role, role});
    secrets.push(accounts[role].password, accounts[role].totpSecret, accounts[role].otpAuthUri);
  }
  browser = await chromium.launch({headless:true, ...(process.env.MOBILE_BROWSER_EXECUTABLE ? {executablePath:process.env.MOBILE_BROWSER_EXECUTABLE} : {})});

  const publicContext = await context(), publicPage = await publicContext.newPage();
  await publicPage.goto(origin+'/');
  await publicPage.getByRole('group', {name:'Connectivity paths'}).getByRole('button', {name:'Direct to satellite',exact:true}).click();
  assert.match(await publicPage.locator('#connection-details').innerText(), /unverified/);
  const apps = publicPage.getByRole('region', {name:'Onesa Mobile apps'});
  for (const {device, store, url} of appStoreListings) {
    const platform = apps.getByRole('listitem').filter({hasText:device});
    assert.ok((await platform.innerText()).includes(store));
    if (url) {
      assert.equal(await platform.getByRole('link').getAttribute('href'), url);
    } else {
      assert.match(await platform.innerText(), /Not published/);
      assert.equal(await platform.getByRole('link').count(), 0);
    }
  }
  const pasofiUrl = 'https://pasofi.mobile.onesa.eu';
  const heroProduct = publicPage.getByRole('link', {name:'Visit Pasofi Wi-Fi',exact:true});
  assert.equal(await heroProduct.getAttribute('href'), pasofiUrl);
  assert.match(await publicPage.locator('.preview-bar').innerText(), /No service is being sold/);
  await publicPage.getByRole('group', {name:'Connectivity paths'}).getByRole('button', {name:'Pasofi Wi-Fi',exact:true}).click();
  const wifiPanel = publicPage.getByRole('region', {name:'Pasofi Wi-Fi',exact:true});
  assert.match(await wifiPanel.innerText(), /Onesa Mobile’s community Wi-Fi product in Zimbabwe/);
  assert.match(await wifiPanel.innerText(), /New purchases and hotspot connections are paused/);
  assert.equal(await wifiPanel.getByRole('link', {name:'Visit Pasofi Wi-Fi'}).getAttribute('href'), pasofiUrl);
  const faq = publicPage.locator('summary').filter({hasText:'Will I need a Starlink dish?'});
  await faq.focus(); await publicPage.keyboard.press('Enter');
  assert.equal(await faq.evaluate(element => element.parentElement.open), true, 'FAQ is keyboard operable');
  assert.ok((await faq.boundingBox()).height >= 44, 'FAQ summary owns a touch-sized target');
  record('public connectivity explanations and keyboard FAQ work');
  await assertLayout(publicPage,'public');
  await enlargedText(publicPage,'public');
  // The lab workspace can exercise the preference, but only the production
  // capability may advertise registration on the public website.
  assert.equal(await publicPage.getByRole('link', {name:'Register your interest'}).count(), 0);
  await publicPage.route('**/api/v1/status', route => route.fulfill({
    json: {mode:'production',serviceStatus:'prelaunch',productionReady:false,
      commercialSalesEnabled:false,networkConnected:false,capabilities:{launchInterest:true}},
  }));
  await publicPage.reload();
  await publicPage.getByRole('link', {name:'Register your interest',exact:true}).click();
  await publicPage.getByRole('heading', {name:'Customer sign-in',exact:true}).waitFor();
  assert.equal(new URL(publicPage.url()).pathname, '/account/');
  record('the public registration link requires the production capability and opens customer sign-in');
  await publicContext.close();

  // Use a disposable signed-in account and present the same public and account
  // fields as a production backend with no historic applications or receipts.
  const prelaunchContext = await context(), prelaunchPage = await prelaunchContext.newPage();
  await login(prelaunchPage, accounts.customer, 'customer');
  for (const path of ['/api/v1/session', '/api/v1/me']) {
    await prelaunchPage.route('**'+path, async route => {
      const response = await route.fetch();
      const value = await response.json();
      if (path.endsWith('/session')) Object.assign(value, { mode:'production', authMode:'onesa', ssoAvailable:true });
      else Object.assign(value.status, { mode:'production', capabilities:{ ...value.status.capabilities, subscriberPilot:false, labBilling:false } });
      await route.fulfill({ response, json:value });
    });
  }
  await prelaunchPage.goto(origin+'/account/#payments');
  await prelaunchPage.reload();
  await prelaunchPage.getByRole('heading', { name:'Overview', exact:true, level:1 }).waitFor();
  const accountNav = prelaunchPage.getByRole('navigation', { name:'Account sections' });
  assert.ok(await accountNav.getByRole('button', { name:'Help & support' }).isVisible());
  assert.equal(await accountNav.getByRole('button', { name:/Pilot application|Payment records/ }).count(), 0);
  await prelaunchPage.getByRole('button', {name:'Register my interest',exact:true}).waitFor();
  record('production customer navigation opens launch interest and help without exposing empty lab workflows');
  await prelaunchContext.close();

  const customerContext = await context(), customerPage = await customerContext.newPage();
  await login(customerPage,accounts.customer,'customer');
  assert.equal(await customerPage.getByRole('link', {name:'Visit Pasofi Wi-Fi'}).getAttribute('href'), pasofiUrl);
  const skip=customerPage.getByRole('link',{name:'Skip to workspace content',exact:true});
  await skip.focus();
  assert.ok((await skip.boundingBox()).height>=44,'the focused skip link is readable and operable');
  await customerPage.keyboard.press('Enter');
  assert.equal(await customerPage.evaluate(()=>document.activeElement?.id),'mw-main','the skip link moves keyboard focus into the workspace');
  assert.ok((await skip.boundingBox()).height<=1,'the unfocused skip link cannot obscure workspace content');
  record('workspace skip navigation is keyboard operable and hidden when unfocused');
  async function changeLaunchInterest(buttonName, state) {
    const saved = customerPage.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/account/launch-interest' && response.request().method() === 'POST');
    await customerPage.getByRole('button', {name:buttonName,exact:true}).click();
    const result = await saved;
    assert.ok(result.ok(), 'launch preference saved');
    const record = await result.json();
    assert.equal(record.state, state);
    await customerPage.getByRole('button', {name:state === 'registered' ? 'Withdraw interest' : 'Register my interest',exact:true}).waitFor();
    return record;
  }
  const interest = await changeLaunchInterest('Register my interest','registered');
  await customerPage.reload();
  await customerPage.getByRole('button',{name:'Withdraw interest',exact:true}).waitFor();
  const withdrawn = await changeLaunchInterest('Withdraw interest','withdrawn');
  assert.equal(withdrawn.id, interest.id);
  assert.ok(withdrawn.revision > interest.revision);
  await section(customerPage,'home','Overview');
  await customerPage.getByRole('button', {name:'Register my interest',exact:true}).waitFor();
  record('customer registration and withdrawal use the same persisted preference after reload');
  await section(customerPage,'application','Pilot application');
  const applicationForm = customerPage.getByRole('form',{name:'Pilot application',exact:true});
  await applicationForm.getByLabel('Pilot participant name',{exact:false}).fill('Synthetic bench participant');
  await applicationForm.getByLabel('Area or district',{exact:false}).fill('Synthetic test district');
  await applicationForm.getByLabel('Plan concept',{exact:false}).selectOption('reach');
  await applicationForm.getByLabel('Preferred SIM format',{exact:false}).selectOption('physical');
  await applicationForm.getByLabel('Phone make and model',{exact:false}).fill('Synthetic Android handset');
  await applicationForm.getByRole('checkbox').check();
  await assertLayout(customerPage,'customer-application');
  const application = await save(customerPage,applicationForm,'/v1/applications');
  assert.equal(application.networkState,'not_provisioned');
  await customerPage.getByRole('heading',{name:'Review required',exact:true}).waitFor();
  await section(customerPage,'help','Help & support');
  const caseForm = customerPage.getByRole('form',{name:'Create support case',exact:true});
  await caseForm.getByLabel('What is this about?',{exact:false}).selectOption('coverage');
  await caseForm.getByLabel('Short description',{exact:false}).fill('Synthetic device question');
  await caseForm.getByLabel('How can the team help?',{exact:false}).fill('Synthetic workflow test. Which device should be brought to the bench?');
  const ticket = await save(customerPage,caseForm,'/v1/support/tickets');
  await openDetails(customerPage,'Conversation: Synthetic device question');
  const replyForm = customerPage.getByRole('form',{name:'Reply to Synthetic device question',exact:true});
  await replyForm.getByLabel('Your reply',{exact:false}).fill('Synthetic follow-up; no personal or subscriber information.');
  await save(customerPage,replyForm,'/v1/support/tickets/'+ticket.id+'/replies','POST',200);
  await section(customerPage,'account','Account & requests');
  await openDetails(customerPage,'Create an account request');
  const requestForm = customerPage.getByRole('form',{name:'Create account request',exact:true});
  await requestForm.getByLabel('Request type',{exact:false}).selectOption('data_correction');
  await requestForm.getByLabel('What should the team review?',{exact:false}).fill('Synthetic correction request for the test dataset.');
  await save(customerPage,requestForm,'/v1/account/requests');
  const downloadEvent = customerPage.waitForEvent('download');
  await customerPage.getByRole('button',{name:'Download my account records',exact:true}).click();
  const download = await downloadEvent, exported = JSON.parse(await readFile(await download.path(),'utf8'));
  assert.ok(JSON.stringify(exported).includes(application.id),'the download contains the owned application');
  assert.ok(!JSON.stringify(exported).includes(accounts.operations.subject),'a customer export does not include staff identity');
  record('customer application, support conversation, account request and private export work through the UI');
  await section(customerPage,'home','Overview');
  await assertLayout(customerPage,'customer');
  await enlargedText(customerPage,'customer');
  await section(customerPage,'home','Overview');

  const staffContext = await context(), staffPage = await staffContext.newPage();
  await login(staffPage,accounts.operations,'staff');
  await section(staffPage,'applications','Applications & interest');
  const preferences = staffPage.locator('section.mw-panel').filter({has:staffPage.getByRole('heading',{name:'Customer launch preferences',exact:true})});
  assert.match(await preferences.innerText(), /Withdrawn/);
  assert.ok((await preferences.innerText()).includes(accounts.customer.subject));
  record('authorized staff see the customer’s current launch preference');
  await section(staffPage,'hardware','Sites & equipment');
  await openDetails(staffPage,'Add a site');
  const siteForm = staffPage.getByRole('form',{name:'Add a site',exact:true});
  await siteForm.getByLabel('Site name',{exact:false}).fill('Synthetic hardware bench');
  await siteForm.getByLabel('Area or district',{exact:false}).fill('Synthetic test district');
  await siteForm.getByLabel('Purpose',{exact:false}).selectOption('device_bench');
  const site = await save(staffPage,siteForm,'/v1/ops/sites');
  await openDetails(staffPage,'Register a planned asset');
  const assetForm = staffPage.getByRole('form',{name:'Register a planned asset',exact:true});
  async function fillAsset() {
    await assetForm.getByLabel(/^Site/).selectOption(site.id);
    await assetForm.getByLabel('Asset tag',{exact:false}).fill('SYNTH-PHONE-01');
    await assetForm.getByLabel('Equipment type',{exact:false}).selectOption('android_phone');
    await assetForm.getByLabel('Manufacturer',{exact:false}).fill('Synthetic');
    await assetForm.getByLabel('Model',{exact:false}).fill('Bench handset');
    await assetForm.getByLabel('Firmware / software',{exact:false}).fill('synthetic-fw-1');
  }
  await fillAsset(); await assertLayout(staffPage,'hardware-form');
  const asset = await save(staffPage,assetForm,'/v1/ops/assets');
  assert.equal(asset.powerWatts,null,'omitting an unknown rating does not invent zero watts');
  await fillAsset(); await save(staffPage,assetForm,'/v1/ops/assets','POST',409);
  const assetError = assetForm.getByRole('alert'); await assetError.waitFor();
  await staffPage.waitForFunction(() => document.activeElement?.matches('.mw-form-error'));
  assert.equal(await assetError.evaluate(element => element===document.activeElement),true,'failed save focuses the actionable form error');
  record('duplicate hardware input retains an accessible focused error');
  await section(staffPage,'hardware','Sites & equipment');
  await openDetails(staffPage,'View SYNTH-PHONE-01 checks and actions');
  const receivedResponse = staffPage.waitForResponse(value => value.url().endsWith('/api/v1/ops/assets/'+asset.id) && value.request().method()==='PATCH');
  await staffPage.getByRole('button',{name:'Record asset received',exact:true}).click();
  assert.equal((await receivedResponse).status(),200);
  await staffPage.getByRole('button',{name:'Refresh workspace',exact:true}).locator(':scope:enabled').waitFor();
  await openDetails(staffPage,'Record a commissioning check for SYNTH-PHONE-01');
  const checkForm = staffPage.getByRole('form',{name:'Commission SYNTH-PHONE-01',exact:true});
  for (const check of ['asset_label','power','firmware','management_security','equipment_approval','connectivity','recovery']) {
    await checkForm.getByLabel('Commissioning check',{exact:false}).selectOption(check);
    await checkForm.getByLabel('Observed result',{exact:false}).selectOption('pass');
    await checkForm.getByLabel('Evidence reference',{exact:false}).fill('SYNTHETIC-'+check.toUpperCase());
    await save(staffPage,checkForm,'/v1/ops/assets/'+asset.id+'/checks','POST',200);
  }
  assert.equal(instance.store.get('assets',asset.id).state,'commissioned');
  record('hardware site, inventory, receipt and all seven commissioning checks work through the UI');
  await section(staffPage,'hardware','Sites & equipment');
  await assertLayout(staffPage,'hardware');
  await enlargedText(staffPage,'hardware');

  const deviceScope = 'SYNTHETIC-HANDSET-FW1-PROFILE-A';
  const evidenceIds=[];
  for (const gate of ['host_agreement','equipment_approval','satellite_authorization','satellite_entitlement']) {
    const item = instance.platform.submitEvidence(actor(accounts.operations),{gate,country:'ZW',operator:'Synthetic host',service:'direct_to_cell',deviceScope,evidenceRef:'SYNTHETIC-'+gate,issuer:'Synthetic fixture issuer',issuedAt:new Date(Date.now()-86400000).toISOString().slice(0,10),expiresAt:new Date(Date.now()+86400000).toISOString(),summary:'Synthetic browser acceptance fixture. No actual licence, operator agreement or satellite authorization.'},randomUUID());
    const reviewed=instance.platform.reviewEvidence(actor(accounts.admin),item.id,{revision:item.revision,decision:'accept',reason:'Synthetic independent reviewer fixture'},randomUUID());evidenceIds.push(reviewed.id);
  }
  await section(staffPage,'trials','Field trials');
  await openDetails(staffPage,'Plan a field trial');
  const trialForm = staffPage.getByRole('form',{name:'Plan a field trial',exact:true});
  await trialForm.getByLabel(/^Site/).selectOption(site.id);
  await trialForm.getByLabel('Test asset',{exact:false}).selectOption(asset.id);
  await trialForm.getByLabel('Connectivity path',{exact:false}).selectOption('direct_to_cell');
  await trialForm.getByLabel('Function under test',{exact:false}).selectOption('sms');
  await trialForm.getByLabel('Operator / contracted provider',{exact:false}).fill('Synthetic host');
  await trialForm.getByLabel('Exact device and test scope reference',{exact:false}).fill(deviceScope);
  await trialForm.getByLabel('Test scenario',{exact:false}).fill('Synthetic satellite observation record');
  await trialForm.getByLabel('Pass criteria agreed before the test',{exact:false}).fill('Synthetic test: three of three fixture messages recorded. No RF was transmitted.');
  const trial=await save(staffPage,trialForm,'/v1/ops/trials');
  await openDetails(staffPage,'Record result for Synthetic satellite observation record');
  const resultForm=staffPage.getByRole('form',{name:'Record result '+trial.id,exact:true});
  await resultForm.getByLabel('Result',{exact:false}).selectOption('pass');
  await resultForm.getByLabel('Evidence source',{exact:false}).selectOption('manual_field_record');
  await resultForm.getByLabel('Observation date and time',{exact:false}).fill(new Date().toISOString().slice(0,19));
  await resultForm.getByLabel('Evidence reference',{exact:false}).fill('SYNTHETIC-NO-RADIO-OBSERVATION');
  await resultForm.getByLabel('Approved test-plan reference',{exact:false}).fill('SYNTHETIC-TEST-PLAN');
  await resultForm.getByLabel('What happened?',{exact:false}).fill('Synthetic software acceptance observation. No carrier or satellite network was used.');
  await assertLayout(staffPage,'trial-result');
  await save(staffPage,resultForm,'/v1/ops/trials/'+trial.id+'/results','POST',409);
  await resultForm.getByRole('alert').waitFor();
  for (const id of evidenceIds) await resultForm.locator(`input[name="trialEvidence_${id}"]`).check();
  const completed=await save(staffPage,resultForm,'/v1/ops/trials/'+trial.id+'/results','POST',200);
  assert.equal(completed.authorizationEvidence.length,4);
  assert.equal(completed.assetSnapshot.id,asset.id);
  assert.equal(completed.networkActionExecuted,false);
  record('manual trial form rejects omitted authorization and captures four matching evidence revisions');
  await assertLayout(staffPage,'trials');

  // A caller with customer cookies must still be refused at the API and staff UI.
  const forbidden=await customerContext.request.get(origin+'/api/v1/ops/snapshot');
  assert.equal(forbidden.status(),403);
  await customerPage.goto(origin+'/internal/');
  await customerPage.getByRole('heading',{name:'Staff access required',exact:true}).waitFor();
  assert.equal(await customerPage.getByRole('button',{name:'Record asset received',exact:true}).count(),0);
  record('a signed-in customer cannot open operations records or staff actions');

  // Complete a real write, then queue its already received body until the client
  // session expires. This models a response already beyond transport cancellation.
  const expiryContext=await context(), expiryPage=await expiryContext.newPage();
  await expiryPage.clock.install({time:new Date()});
  await expiryPage.addInitScript(()=>{
    const original=window.fetch.bind(window);
    window.fetch=async(input,init)=>{
      const response=await original(input,init);
      if(init?.method==='POST'&&new URL(typeof input==='string'?input:input.url,location.href).pathname==='/api/v1/support/tickets'){
        const bytes=await response.arrayBuffer();
        window.__queuedMutationStatus=response.status;
        await new Promise(resolve=>{window.__releaseQueuedMutation=resolve;window.__queuedMutationReady=true;});
        return new Response(bytes,{status:response.status,statusText:response.statusText,headers:response.headers});
      }
      return response;
    };
  });
  await login(expiryPage,accounts.customer,'customer');
  await section(expiryPage,'help','Help & support');
  await openDetails(expiryPage,'Create a support case');
  const queuedForm=expiryPage.getByRole('form',{name:'Create support case',exact:true});
  await queuedForm.getByLabel('What is this about?',{exact:false}).selectOption('other');
  await queuedForm.getByLabel('Short description',{exact:false}).fill('Synthetic queued response');
  await queuedForm.getByLabel('How can the team help?',{exact:false}).fill('Synthetic timing test. This completed response is held until the client session expires.');
  const expirySession=await (await expiryContext.request.get(origin+'/api/v1/session')).json();
  let sessionReads=0;
  expiryPage.on('request',request=>{if(new URL(request.url()).pathname==='/api/v1/session')sessionReads++;});
  await queuedForm.locator('button[type="submit"]').click();
  await expiryPage.waitForFunction(()=>window.__queuedMutationReady===true);
  assert.equal(await expiryPage.evaluate(()=>window.__queuedMutationStatus),201,'the held mutation actually committed');
  const browserNow=await expiryPage.evaluate(()=>Date.now());
  await expiryPage.clock.fastForward(Math.max(1000,expirySession.user.expiresAt*1000-browserNow+1000));
  const expiredSignIn=expiryPage.getByRole('form',{name:'Customer sign-in',exact:true});
  await expiredSignIn.waitFor();
  const readsAtExpiry=sessionReads;
  await expiryPage.evaluate(()=>window.__releaseQueuedMutation());
  await expiredSignIn.locator('button[type="submit"][aria-busy="false"]').waitFor();
  assert.equal(sessionReads,readsAtExpiry,'a completed stale mutation must not refresh and restore the old session');
  assert.equal(await expiryPage.getByText('Support case saved. Follow its progress below.',{exact:true}).count(),0);
  record('a completed mutation delivered after client expiry cannot restore private data or show a stale success');
  await expiryContext.close();

  // Inject a real transport failure, then exercise the visible recovery control.
  const outageContext=await context(), outagePage=await outageContext.newPage();
  await outagePage.route('**/api/v1/session', route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{code:'BACKEND_NOT_CONNECTED',message:'Synthetic temporary outage'}})}));
  await outagePage.goto(origin+'/account/');
  await outagePage.getByRole('button',{name:'Retry connection',exact:true}).waitFor();
  assert.equal(await outagePage.getByRole('form',{name:'Customer sign-in',exact:true}).count(),0);
  await outagePage.unroute('**/api/v1/session');
  await outagePage.getByRole('button',{name:'Retry connection',exact:true}).click();
  await outagePage.getByRole('form',{name:'Customer sign-in',exact:true}).waitFor();
  record('an unavailable account service has a working retry and never invents a signed-in state');
  await outageContext.close();

  // Clear the authenticated workspace through its actual sign-out control.
  await section(staffPage,'hardware','Sites & equipment');
  await staffPage.getByRole('button',{name:'Sign out',exact:true}).click();
  await staffPage.getByRole('form',{name:'Staff sign-in',exact:true}).waitFor();
  assert.equal(await staffPage.getByText('SYNTH-PHONE-01',{exact:true}).count(),0);
  record('sign-out removes private hardware records from the rendered workspace');
  assert.deepEqual(runtimeErrors,[],'browser runtime produced no uncaught JavaScript errors');
  assert.deepEqual(unexpectedRequests,[],'the browser did not request non-loopback services');
  const report={kind:'onesa-mobile-browser-qualification',generatedAt:new Date().toISOString(),data:'synthetic-only',providerActions:false,result:'passed',checks,layouts,engine:await browser.version(),limitations:['Automated Chromium on loopback, not physical handset or native UI qualification.','Synthetic accepted evidence exercises software checks; no operator/regulatory permission is established.','Local static gateway is a test harness; production hosting is verified separately.','Client expiry is clock-emulated and a completed response is deliberately queued to exercise the session race.']};
  await writeFile(join(artifacts,'qualification.json'),JSON.stringify(report,null,2)+'\n');
  console.info(`Browser qualification passed: ${checks.length} journeys/check groups; ${layouts.length} layout observations. Artifacts: ${artifacts}`);
} catch(error) {
  console.error('Browser qualification failed: '+sanitize(error?.stack ?? error));
  await writeFile(join(artifacts,'qualification.json'),JSON.stringify({kind:'onesa-mobile-browser-qualification',generatedAt:new Date().toISOString(),data:'synthetic-only',providerActions:false,result:'failed',checks,layouts,error:sanitize(error?.message??error)},null,2)+'\n');
  process.exitCode=1;
} finally {
  await browser?.close();
  if (instance) await close(instance.server);
  await close(gateway);
  await rm(temporary,{recursive:true,force:true});
}
