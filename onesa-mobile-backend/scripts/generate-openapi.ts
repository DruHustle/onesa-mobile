import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { z } from 'zod';
import { schemas, roles, commissioningKeys, gateKeys, permissions } from '../src/platform/model.ts';
import { catalog, readiness, demoAccount } from '../src/fixtures.ts';

type Schema = Record<string, unknown>;
type Operation = Record<string, unknown>;
type PathItem = Record<string, Operation>;
const ref = (name: string): Schema => ({ $ref: '#/components/schemas/' + name });
const array = (items: Schema, extra: Schema = {}): Schema => ({ type: 'array', items, ...extra });
const object = (properties: Record<string, Schema>, required = Object.keys(properties), additionalProperties: boolean | Schema = false): Schema => ({ type: 'object', properties, required, additionalProperties });
const nullable = (schema: Schema): Schema => ({ anyOf: [schema, { type: 'null' }] });
const text = (extra: Schema = {}): Schema => ({ type: 'string', ...extra });
const integer = (minimum = 0): Schema => ({ type: 'integer', minimum });
const literal = (value: string | number | boolean): Schema => ({ type: typeof value === 'number' ? 'integer' : typeof value, const: value });
const uuid = (): Schema => text({ format: 'uuid' });
const timestamp = (): Schema => text({ format: 'date-time' });
const token = (): Schema => text({ pattern: '^[A-Za-z0-9_-]{43}$', minLength: 43, maxLength: 43 });
const enumText = (values: readonly string[]): Schema => text({ enum: [...values] });
const jsonSchema = (schema: z.ZodType, io: 'input' | 'output' = 'input'): Schema => {
  const { $schema: _dialect, ...result } = z.toJSONSchema(schema, { target: 'draft-2020-12', io });
  return result;
};
function fixtureSchema(value: unknown): Schema {
  if (value === null) return { type: 'null' };
  if (Array.isArray(value)) return value.length ? array(fixtureSchema(value[0])) : { type: 'array', maxItems: 0, items: {} };
  if (typeof value === 'object') return object(Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, fixtureSchema(item)])));
  if (typeof value === 'boolean') return literal(value);
  return { type: typeof value, examples: [value] };
}
const metadata = { id: uuid(), kind: text(), owner: uuid(), revision: integer(1), createdAt: timestamp(), updatedAt: timestamp() };
function recordSchema(kind: string, schema: z.ZodType, extra: Record<string, Schema>, optional: readonly string[] = []): Schema {
  const payload = jsonSchema(schema, 'output');
  const properties = { ...(payload.properties as Record<string, Schema>), ...metadata, kind: literal(kind), ...extra };
  const required = [...new Set([...(payload.required as string[] ?? []), ...Object.keys(metadata), ...Object.keys(extra).filter(key => !optional.includes(key))])];
  return object(properties, required, true);
}
const identitySecurity = [{ sessionCookie: [] }, { labSessionCookie: [] }, { nativeBearer: [] }];
const sharedHeaders = {
  'X-Request-Id': { description: 'Server-generated correlation identifier; contains no account credential.', schema: uuid() },
  'Cache-Control': { description: 'All responses are private to the request and are never cached.', schema: literal('no-store') },
};
const authMutationParameters = [
  { name: 'Origin', in: 'header', required: false, schema: text({ format: 'uri' }), description: 'Required for cookie mutations and cookie lab sign-in; must exactly match a configured allowed origin. Native bearer requests may omit Origin; a supplied foreign Origin is rejected.' },
  { name: 'X-CSRF-Token', in: 'header', required: false, schema: token(), description: 'Required with an existing cookie session. Read csrfToken from GET /v1/session. Not required for native bearer transport. Never put it in a URL.' },
];
const idempotencyParameter = { name: 'Idempotency-Key', in: 'header', required: true, schema: text({ pattern: '^[A-Za-z0-9_-]{16,128}$', minLength: 16, maxLength: 128 }), description: 'Generate once for an intended business mutation, retain through uncertain retries, and replace when input changes. Scope is the authenticated subject. Same operation/input returns the committed original result; changed operation/input returns 409 IDEMPOTENCY_CONFLICT. No TTL is imposed by the pilot store.' };
const errors: Record<string, string> = {
  '400': 'Invalid input, target, page marker, auth flow, CSRF header shape or missing idempotency key.',
  '401': 'Missing, expired or invalid account capability/credentials, or an invalid identity assertion.',
  '403': 'Forbidden role/ownership scope, Origin/CSRF failure, missing staff MFA or fresh authentication, or separate reviewer required.',
  '404': 'Record/path unavailable. Customer ownership mismatches do not disclose another customer record.',
  '409': 'Revision/idempotency conflict, duplicate reference, immutable/closed state, or unmet workflow precondition.',
  '413': 'JSON body exceeds 16,384 bytes.',
  '414': 'Request target exceeds 4,096 characters.',
  '415': 'A JSON mutation requires application/json with optional charset=utf-8.',
  '429': 'Rate limit reached; Retry-After is present for the generic address limiter.',
  '500': 'Sanitized internal failure. Preserve the request identifier and retry a mutation with its existing idempotency key.',
  '503': 'Identity/provider unavailable or operation not commissioned. No carrier, satellite, SIM or payment effect is executed.',
};
const errorResponses = (): Record<string, unknown> => Object.fromEntries(Object.keys(errors).map(code => [code, { $ref: '#/components/responses/Error' + code }]));
const response = (description: string, schema: Schema, extraHeaders: Schema = {}): Schema => ({ description, headers: { ...sharedHeaders, ...extraHeaders }, content: { 'application/json': { schema } } });
const requestBody = (name: string): Schema => ({ required: true, description: 'At most 16 KiB UTF-8 JSON. Unknown fields are rejected. Text is trimmed; forbidden control characters and obvious credential-bearing evidence references are rejected by domain validation.', content: { 'application/json': { schema: ref(name) } } });
const mutationRules = 'Cookie mutations require exact Origin and X-CSRF-Token; native bearer requests may omit both. Every business mutation requires Idempotency-Key. Existing records require their current positive revision; a stale revision returns 409 without applying the action. Identity and role are revalidated before business processing.';

export function buildOpenApi(): Record<string, unknown> {
  const components: Record<string, Schema> = {};
  for (const [name, schema] of Object.entries(schemas)) components[name[0]!.toUpperCase() + name.slice(1) + 'Input'] = jsonSchema(schema);
  components.ApplicationResubmitInput = jsonSchema(schemas.application.extend({ revision: schemas.review.shape.revision }));
  components.LabLoginInput = jsonSchema(z.object({ username: z.string().min(1).max(254), password: z.string().min(1).max(256), totp: z.string().regex(/^\d{6}$/).optional(), surface: z.enum(['customer', 'staff']).default('customer'), transport: z.enum(['cookie', 'bearer']).default('cookie') }).strict());
  components.NativeExchangeInput = object({ code: token(), state: token(), verifier: text({ pattern: '^[A-Za-z0-9._~-]{43,128}$', minLength: 43, maxLength: 128 }) });
  components.Error = object({ error: object({ code: text({ description: 'Stable machine-readable error code. Handle unknown future codes safely; do not infer an account exists from a failed login.' }), message: text() }), requestId: uuid() });
  components.Profile = object({ subject: uuid(), displayName: text() });
  components.Principal = object({ subject: uuid(), displayName: text(), role: enumText(roles), source: enumText(['lab', 'onesa']), authenticatedAt: integer(1), mfa: { type: 'boolean' }, expiresAt: integer(1), csrfToken: token() });
  components.Session = object({ authenticated: { type: 'boolean' }, mode: enumText(['lab', 'production']), authMode: enumText(['lab', 'onesa']), ssoAvailable: { type: 'boolean' }, user: nullable(ref('Principal')), csrfToken: nullable(token()) });
  components.LabLogin = object({ authenticated: literal(true), mode: literal('lab'), user: ref('Principal'), csrfToken: token(), token: token() }, ['authenticated', 'mode', 'user', 'csrfToken']);
  components.NativeExchange = object({ authenticated: literal(true), mode: enumText(['lab', 'production']), user: ref('Principal'), token: token() });
  components.Logout = object({ signedOut: literal(true), centralRevocation: enumText(['confirmed', 'unavailable', 'not_applicable']) });
  components.Health = object({ status: literal('ok'), mode: enumText(['lab', 'production']), serviceStatus: literal('prelaunch'), networkConnected: literal(false) });
  components.Status = object({ mode: enumText(['lab', 'production']), serviceStatus: literal('prelaunch'), productionReady: literal(false), networkConnected: literal(false), commercialSalesEnabled: literal(false), capabilities: object({ hardwareInventory: literal(true), commissioning: literal(true), fieldTrialRecords: literal(true), subscriberPilot: { type: 'boolean' }, support: literal(true), labBilling: { type: 'boolean' }, carrierProvisioning: literal(false), satelliteEntitlement: literal(false), livePayments: literal(false) }), updatedAt: timestamp() });
  components.Readiness = object({ commercialServiceEnabled: literal(false), automaticNetworkActivation: literal(false), providerIntegrations: literal('not_commissioned'), gates: array(object({ key: enumText(gateKeys), label: text(), currentEvidence: integer() })), evidenceScope: text(), notice: text() });
  components.Catalog = { ...fixtureSchema(catalog), description: 'Public fictional product concepts; price and allowance are null. Nothing can be purchased or activated.' };
  components.LegacyReadiness = { ...fixtureSchema(readiness), description: 'Legacy fixed demo fixture. Its mode is demo and its identity text describes the original starter. Use /v1/status and /v1/session for the actual control plane, and /v1/ops/snapshot for current scoped evidence.' };
  components.DemoAccount = { ...fixtureSchema(demoAccount), description: 'Public fictional account/usage illustration; never connected to authenticated customer data.' };
  components.SiteRecord = recordSchema('sites', schemas.site, { state: literal('planning'), country: literal('ZW') });
  const check = object({ result: enumText(['not_run', 'pass', 'fail', 'not_applicable']), evidenceRef: text(), note: text(), checkedBy: uuid(), checkedAt: timestamp() }, ['result']);
  components.AssetRecord = recordSchema('assets', schemas.asset, { state: enumText(['planned', 'received', 'faulty', 'commissioned', 'retired']), faultReported: { type: 'boolean', description: 'A manually reported physical fault remains open until all commissioning checks are repeated.' }, powerRatingRecorded: { type: 'boolean', description: 'True only when the nameplate/rated power was explicitly recorded. Missing on legacy records means unverified; never infer a measurement from zero.' }, checks: object(Object.fromEntries(commissioningKeys.map(key => [key, check]))), telemetry: { type: 'null' }, connectivityState: literal('unobserved'), commissioningHistory: array(object({}, [], true), { maxItems: 200, description: 'Included on the single-record endpoint; deliberately omitted from page/snapshot items.' }) }, ['commissioningHistory', 'powerRatingRecorded', 'faultReported']);
  components.TrialPlannedAsset = object({ id: uuid(), assetType: text(), manufacturer: text(), model: text(), firmware: text(), serialReference: nullable(text()), typeApprovalRef: nullable(text()) });
  components.TrialAssetSnapshot = object({ id: uuid(), revision: integer(1), tag: text(), assetType: text(), manufacturer: text(), model: text(), firmware: text(), typeApprovalRef: nullable(text()), state: text() });
  components.TrialAuthorizationEvidence = object({ id: uuid(), revision: integer(1), gate: enumText(gateKeys), country: literal('ZW'), operator: text(), service: enumText(['terrestrial', 'direct_to_cell', 'dish_wifi']), deviceScope: text(), evidenceRef: text(), issuer: text(), issuedAt: text({format: 'date'}), expiresAt: timestamp(), reviewedBy: uuid(), reviewedAt: timestamp() });
  components.TrialRecord = recordSchema('trials', schemas.trial, { state: enumText(['planned', 'completed']), result: nullable(enumText(['pass', 'fail', 'blocked'])), networkActionExecuted: literal(false), plannedAsset: ref('TrialPlannedAsset'), observedAt: timestamp(), source: enumText(['manual_field_record', 'lab_simulator']), observation: text(), evidenceRef: text(), recordedBy: uuid(), authorizationRef: text(), evidenceIds: array(uuid(), {maxItems: 12, uniqueItems: true}), assetSnapshot: ref('TrialAssetSnapshot'), authorizationEvidence: array(ref('TrialAuthorizationEvidence'), {maxItems: 12}), authorizationAssessment: enumText(['simulation_only', 'internal_evidence_review', 'not_assessed']), latencyMs: { type: 'number', minimum: 0 }, downloadMbps: { type: 'number', minimum: 0 } }, ['plannedAsset', 'observedAt', 'source', 'observation', 'evidenceRef', 'recordedBy', 'authorizationRef', 'evidenceIds', 'assetSnapshot', 'authorizationEvidence', 'authorizationAssessment', 'latencyMs', 'downloadMbps']);
  components.EvidenceRecord = recordSchema('gates', schemas.evidence, { state: enumText(['in_review', 'accepted', 'rejected', 'revoked']), submittedBy: uuid(), reviewedBy: nullable(uuid()), reviewedAt: timestamp(), reviewReason: text() }, ['reviewedAt', 'reviewReason']);
  components.ApplicationRecord = recordSchema('applications', schemas.application, { state: enumText(['review_required', 'information_required', 'awaiting_host', 'declined']), registrationVerified: literal(false), provisioningState: literal('not_requested'), networkState: literal('not_provisioned'), mode: literal('lab'), registrationReference: nullable(text()), reviewNote: nullable(text()), reviewedBy: uuid() }, ['registrationReference', 'reviewNote', 'reviewedBy']);
  components.TicketRecord = recordSchema('tickets', schemas.ticket, { status: enumText(['open', 'in_progress', 'resolved']), assignee: nullable(text()), notes: array(object({ text: text(), at: timestamp(), authorRole: enumText(roles) }), { maxItems: 100, description: 'Customer-visible conversation entries; this is not a private internal-note channel.' }) });
  components.LedgerRecord = recordSchema('ledger', schemas.ledger, { state: enumText(['test_recorded', 'test_partially_refunded', 'test_refunded']), soldBy: uuid(), refunds: array(object({ amountMinor: integer(1), reason: text(), recordedBy: uuid(), at: timestamp() })), refundedMinor: integer(), documentType: literal('test_receipt'), legalInvoice: literal(false), moneyMoved: literal(false) });
  components.RequestRecord = recordSchema('requests', schemas.request, { status: enumText(['received', 'in_progress', 'resolved']), automaticAction: literal(false), responseNote: text(), handledBy: uuid(), handledAt: timestamp() }, ['responseNote', 'handledBy', 'handledAt']);
  components.BillingAccount = object({ id: uuid(), displayName: text() });
  components.AuditEntry = object({ sequence: integer(1), id: uuid(), actor: uuid(), role: enumText(roles), action: text(), target: text(), at: timestamp(), previousHash: text(), hash: text({ pattern: '^[a-f0-9]{64}$' }) });
  const recordNames = ['SiteRecord', 'AssetRecord', 'TrialRecord', 'EvidenceRecord', 'ApplicationRecord', 'TicketRecord', 'LedgerRecord', 'RequestRecord'];
  components.Record = { oneOf: recordNames.map(ref), discriminator: { propertyName: 'kind', mapping: Object.fromEntries(['sites', 'assets', 'trials', 'gates', 'applications', 'tickets', 'ledger', 'requests'].map((kind, index) => [kind, '#/components/schemas/' + recordNames[index]!])) } };
  components.Page = object({ items: array({ oneOf: [...recordNames.map(ref), ref('BillingAccount'), ref('AuditEntry')] }, { maxItems: 50 }), total: integer(), nextCursor: nullable(text({ pattern: '^[A-Za-z0-9_-]{1,256}$', maxLength: 256 })) });
  const ownCollections = { applications: array(ref('ApplicationRecord'), { maxItems: 50 }), tickets: array(ref('TicketRecord'), { maxItems: 50 }), ledger: array(ref('LedgerRecord'), { maxItems: 50 }), requests: array(ref('RequestRecord'), { maxItems: 50 }) };
  const ownNames = Object.keys(ownCollections);
  const pagingMaps = (names: string[]) => ({ pageLimit: literal(50), counts: object(Object.fromEntries(names.map(kind => [kind, integer()]))), cursors: object(Object.fromEntries(names.map(kind => [kind, nullable(text())]))) });
  components.Account = object({ profile: ref('Profile'), ...ownCollections, ...pagingMaps(ownNames), network: object({ state: literal('not_provisioned'), source: literal('no_host_integration'), usage: { type: 'null' }, lastMeasuredAt: { type: 'null' } }), status: ref('Status') });
  components.AccountExport = object({ exportedAt: timestamp(), profile: ref('Profile'), applications: array(ref('ApplicationRecord')), tickets: array(ref('TicketRecord')), ledger: array(ref('LedgerRecord')), requests: array(ref('RequestRecord')) });
  const opsCollections = { sites: array(ref('SiteRecord'), { maxItems: 50 }), assets: array(ref('AssetRecord'), { maxItems: 50 }), trials: array(ref('TrialRecord'), { maxItems: 50 }), gates: array(ref('EvidenceRecord'), { maxItems: 50 }), ...ownCollections, billingAccounts: array(ref('BillingAccount'), { maxItems: 50 }), audit: array(ref('AuditEntry'), { maxItems: 50 }) };
  const permissionNames = [...new Set(roles.flatMap(role => permissions({ subject: 'schema', displayName: 'schema', role })))];
  components.OperationsSnapshot = object({ permissions: array(enumText(permissionNames)), status: ref('Status'), readiness: nullable(ref('Readiness')), ...opsCollections, auditIntegrity: nullable({ type: 'boolean' }), ...pagingMaps(Object.keys(opsCollections)) });

  const paths: Record<string, PathItem> = {};
  function operation(path: string, method: string, operationId: string, summary: string, tag: string, success?: Schema, extra: Operation = {}): void {
    paths[path] ??= {};
    paths[path]![method] = { operationId, summary, tags: [tag], security: identitySecurity, responses: { ...(success ? { '200': response(summary, success) } : {}), ...errorResponses() }, ...extra };
  }
  const anonymous = { security: [] };
  for (const [path, name, summary] of [
    ['/healthz', 'Health', 'Check process health; this does not establish telecom readiness'],
    ['/v1/status', 'Status', 'Read actual control-plane mode and disabled provider capabilities'],
    ['/v1/catalog', 'Catalog', 'Read proposed, unpriced product concepts'],
    ['/v1/readiness', 'LegacyReadiness', 'Read the legacy fictional readiness fixture'],
    ['/v1/demo/account', 'DemoAccount', 'Read an explicitly fictional account illustration'],
  ] as const) {
    operation(path, 'get', 'get' + name, summary, 'Public', ref(name), { ...anonymous, description: 'No query parameters or request body. An unknown Origin is rejected. No authentication is needed and no personal data is returned.' });
    operation(path, 'head', 'head' + name, summary + ' headers', 'Public', undefined, { ...anonymous, responses: { '200': { description: 'Same headers/status as GET, without any response body.', headers: sharedHeaders }, default: { description: 'Same failure status as GET, without any response body.' } } });
  }
  operation('/v1/session', 'get', 'getSession', 'Read the current account session or anonymous sign-in configuration', 'Identity', ref('Session'), { security: [{}, ...identitySecurity], description: 'An absent token returns authenticated=false. A central token is revalidated live against Portal. Provider failure returns 503, not a cached authorization. Response never contains a bearer token, password, TOTP seed or upstream credential.' });
  operation('/v1/session/login', 'post', 'loginLabSession', 'Sign in to an explicitly isolated lab', 'Identity', ref('LabLogin'), { ...anonymous, parameters: [authMutationParameters[0]], requestBody: requestBody('LabLoginInput'), description: 'Available only in lab mode; production returns 503 LAB_AUTH_DISABLED. All staff roles require TOTP. Default cookie transport sets an HttpOnly cookie and never returns token; transport=bearer returns an opaque token for native secure storage. No staff signup or self-assigned roles.', responses: { '200': response('Lab sign-in succeeded', ref('LabLogin'), { 'Set-Cookie': { schema: text(), description: 'Cookie transport only; host-only HttpOnly SameSite=Lax, Secure on HTTPS, up to eight hours.' } }), ...errorResponses() } });
  operation('/v1/session/logout', 'post', 'logoutPresentedSession', 'Destroy the presented local session even during a Portal outage', 'Identity', ref('Logout'), { security: [{}, ...identitySecurity], parameters: authMutationParameters, description: 'Cookie transport requires exact Origin and, when a stored session exists, its CSRF token. Native bearer logout may omit Origin. Local destruction precedes best-effort central token revocation. confirmed does not claim global Onesa logout; unavailable means central revocation was not confirmed. Already absent local sessions are idempotent. No Idempotency-Key or JSON body is required.' });
  operation('/v1/auth/onesa/start', 'get', 'startOnesaSignIn', 'Start the Portal Authorization Code + S256 flow', 'Identity', undefined, { ...anonymous, parameters: [
    { name: 'surface', in: 'query', schema: enumText(['customer', 'staff']), description: 'Defaults to customer; staff requests MFA and source authentication no older than five minutes.' },
    { name: 'codeChallenge', in: 'query', schema: token(), description: 'Native customer flow only: S256 challenge derived from a fresh native verifier. Must be supplied together with state.' },
    { name: 'state', in: 'query', schema: token(), description: 'Native customer flow only: fresh 32-byte base64url state; pair with codeChallenge.' },
  ], description: 'Navigate in the system browser. The BFF uses its own independent state/nonce/verifier and a browser-bound 10-minute flow cookie. A caller cannot set an arbitrary return URL. Requires an explicitly configured Mobile client; otherwise 503.', responses: { '302': { description: 'Redirect to the exact configured Portal authorization endpoint.', headers: { ...sharedHeaders, Location: { schema: text({ format: 'uri' }) }, 'Set-Cookie': { schema: text(), description: 'HttpOnly flow cookie; expire after ten minutes.' } } }, ...errorResponses() } });
  operation('/v1/auth/onesa/callback', 'get', 'completeOnesaSignIn', 'Complete the browser-bound one-use Portal authorization flow', 'Identity', undefined, { ...anonymous, parameters: [
    { name: 'code', in: 'query', schema: text(), description: 'Authorization code delivered by the configured issuer.' },
    { name: 'state', in: 'query', required: true, schema: token(), description: 'BFF state; must match the presented flow cookie and stored unconsumed flow.' },
    { name: 'iss', in: 'query', schema: text({ format: 'uri' }), description: 'Issuer response parameter, when provided by Portal.' },
    { name: 'error', in: 'query', schema: text(), description: 'Provider-denied flow; cannot issue a session.' },
    { name: 'error_description', in: 'query', schema: text() },
  ], description: 'The public proxy path is /api/v1/auth/onesa/callback and must be registered exactly in Portal; the API itself receives /v1/auth/onesa/callback after stripping /api. State, nonce, S256 and signed ID token are checked; current Mobile access/MFA is then obtained from live Portal /session. Web returns only to /account/ or /internal/. Native emits only a 60-second one-time handoff code bound to the native state/verifier; no session token appears in its URL.', responses: { '302': { description: 'Web account/staff redirect with session cookie, or onesamobile://auth/callback?code=...&state=... with no web session cookie.', headers: { ...sharedHeaders, Location: { schema: text() }, 'Set-Cookie': { schema: text(), description: 'Clear the flow cookie; web completion also sets the local opaque session cookie.' } } }, ...errorResponses() } });
  operation('/v1/auth/onesa/native/exchange', 'post', 'exchangeNativeHandoff', 'Redeem a one-time native code with its original state and verifier', 'Identity', ref('NativeExchange'), { ...anonymous, requestBody: requestBody('NativeExchangeInput'), description: 'No client secret belongs on the phone. The code expires after 60 seconds, is single-use and requires the original state/S256 verifier. The central grant is checked again before returning the local bearer token. Store it only in OS secure storage. No browser cookie is set.' });
  operation('/v1/me', 'get', 'getOwnAccount', 'Read the first page of the current account records', 'Customer', ref('Account'), { description: 'Ownership comes from the authenticated subject. Each collection has at most 50 entries and an independently scoped count/next cursor. There is no measured or billable mobile-network usage.' });
  operation('/v1/me/export', 'get', 'exportOwnAccount', 'Stream every owned account record from one consistent database snapshot', 'Customer', ref('AccountExport'), { description: 'Contains all owned applications, support cases, ledger rows and account requests, not just the first page. No identity credential or another customer record is included. Export is audited and stops on disconnect or timeout. A stream failure after headers closes the response; discard partial JSON and retry the download.', responses: { '200': response('Complete account export; no collection page cap', ref('AccountExport'), { 'Content-Disposition': { schema: literal('attachment; filename="onesa-mobile-account.json"') } }), ...errorResponses() } });
  operation('/v1/ops/snapshot', 'get', 'getOperationsSnapshot', 'Read role-filtered first pages for the internal workspace', 'Operations', ref('OperationsSnapshot'), { description: 'Staff only. Unavailable collections are empty with zero counts/null cursors. Agents see only their own sales; billing account lookup requires billing.read. Every collection is capped at 50. Current evidence counts do not enable commercial service. Audit integrity is a local hash-chain check, not independently anchored proof.' });
  for (const surface of ['me', 'ops'] as const) {
    const collections = surface === 'me' ? ownNames : Object.keys(opsCollections);
    const scope = surface === 'me' ? 'Owned customer records only.' : 'Current staff permission required for the requested kind; agent ledger pages are additionally restricted to soldBy=current subject.';
    const kindParameter = { name: 'kind', in: 'path', required: true, schema: enumText(collections) };
    operation('/v1/' + surface + '/records/{kind}', 'get', surface === 'me' ? 'pageOwnRecords' : 'pageOperationsRecords', 'Read a bounded page of ' + (surface === 'me' ? 'owned' : 'authorized') + ' records', surface === 'me' ? 'Customer' : 'Operations', ref('Page'), { parameters: [kindParameter, { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 50, default: 50 } }, { name: 'cursor', in: 'query', schema: text({ pattern: '^[A-Za-z0-9_-]{1,256}$', maxLength: 256 }) }], description: scope + ' Only one cursor and one limit are allowed; extra query parameters are rejected. Pass nextCursor verbatim until null. It is a stateless position marker, not a bearer capability or permission grant. Every request reapplies role and ownership filters; cursors have no independent TTL. Records sort by createdAt/id descending (audit by sequence). New rows may require restarting pagination; use the account export for one consistent complete snapshot. Collection items omit commissioningHistory; use single-record detail for that history.' });
    operation('/v1/' + surface + '/records/{kind}/{id}', 'get', surface === 'me' ? 'getOwnRecord' : 'getOperationsRecord', 'Read one authorized record and its full retained history', surface === 'me' ? 'Customer' : 'Operations', surface === 'me' ? ref('Record') : { oneOf: [ref('Record'), ref('BillingAccount')] }, { parameters: [{ ...kindParameter, schema: enumText(collections.filter(kind => kind !== 'audit')) }, { name: 'id', in: 'path', required: true, schema: uuid() }], description: scope + ' No query parameters. Unknown or unowned records return 404. Audit uses the paginated collection only. billingAccounts returns only id/displayName.' });
  }
  operation('/v1/documents/{id}.pdf', 'get', 'getOwnOrAuthorizedTestReceipt', 'Download an authorized test receipt as PDF', 'Billing', undefined, { parameters: [{ name: 'id', in: 'path', required: true, schema: uuid(), description: 'Ledger record identifier.' }], description: 'Available to the ledger owner, a current billing.read role, or the agent who recorded that sale. Always marked a test receipt; not a legal invoice and no money was moved. Failures remain JSON.', responses: { '200': { description: 'Test receipt PDF', headers: { ...sharedHeaders, 'Content-Disposition': { schema: literal('attachment; filename="onesa-mobile-test-receipt.pdf"') } }, content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } } }, ...errorResponses() } });

  type Mutation = readonly [string, 'post' | 'patch', string, string, string, string, string, string];
  const mutations: Mutation[] = [
    ['/v1/ops/sites', 'post', 'createSite', 'Create a hardware pilot site', 'Hardware', 'SiteInput', 'SiteRecord', 'hardware.write. country remains ZW; site begins planning.'],
    ['/v1/ops/assets', 'post', 'createAsset', 'Register a physical asset', 'Hardware', 'AssetInput', 'AssetRecord', 'hardware.write. Site must exist; asset tag is unique. Missing rated power stays null, never a measured zero. Optional custody/procurement references are non-secret. Creates no device command or telemetry.'],
    ['/v1/ops/assets/{id}', 'patch', 'updateAsset', 'Update received asset state or configuration', 'Hardware', 'AssetUpdateInput', 'AssetRecord', 'hardware.write. Retired assets are read-only. Firmware, serial, type-approval and rated-power changes invalidate affected checks and retain bounded history. powerWatts:null explicitly clears an unknown rating. A rating is never a load measurement. Declaring faulty invalidates every check and retains an unresolved-fault marker until full requalification; changing state to received cannot clear it.'],
    ['/v1/ops/assets/{id}/checks', 'post', 'recordAssetCheck', 'Record one commissioning check with evidence', 'Hardware', 'CheckInput', 'AssetRecord', 'hardware.write. Receive asset first. Asset label, power, management security and equipment approval must be assessed for every item. Firmware/connectivity/recovery can be not_applicable only for test_sim, ups or other, and require an explicit note. Active managed equipment must pass every check. Failure remains faulty; no remote equipment action is performed.'],
    ['/v1/ops/trials', 'post', 'createTrial', 'Plan a scoped terrestrial, dish/Wi-Fi or direct-to-cell trial', 'Hardware', 'TrialInput', 'TrialRecord', 'hardware.write. Site/asset must match. Direct-to-cell requires the actual Android phone or iPhone, not a SIM by itself. Planning captures equipment configuration. Record deviceScope and acceptanceCriteria before a manual passing observation; old plans without them need to be replanned.'],
    ['/v1/ops/trials/{id}/results', 'post', 'recordTrialResult', 'Record an immutable completed field observation', 'Hardware', 'TrialResultInput', 'TrialRecord', 'hardware.write. Passing requires commissioned equipment. Manual pass additionally requires an unchanged planned equipment configuration, agreed criteria preceding observedAt at second precision, approved test-plan authorizationRef and unique evidenceIds. Linked evidence needs independent current acceptance, exact ZW/operator/path/deviceScope match and validity both at observation and now. Required gates: host_agreement and equipment_approval, plus satellite_authorization and satellite_entitlement for direct_to_cell. Documentary issue dates are date-granular; authority/authenticity are not independently verified. Results snapshot equipment/evidence revisions, not ongoing permission or coverage. Failed/blocked and lab_simulator results cannot carry authorization references. Simulations remain simulation_only. No observation more than one minute in the future; no radio/network action occurs.'],
    ['/v1/ops/evidence', 'post', 'submitReadinessEvidence', 'Submit readiness evidence with explicit scope and expiry', 'Readiness', 'EvidenceInput', 'EvidenceRecord', 'readiness.write. Issuer and issuedAt (YYYY-MM-DD) are required. The issue date cannot be in the future; expiresAt must be in the future and after the issue date. References are not fetched and are not independently verified by this API.'],
    ['/v1/ops/evidence/{id}/review', 'post', 'reviewReadinessEvidence', 'Accept, reject or revoke readiness evidence', 'Readiness', 'EvidenceReviewInput', 'EvidenceRecord', 'readiness.approve plus original authentication within five minutes. A submitter cannot accept their own record; expired evidence cannot be accepted. Acceptance never enables commercial service.'],
    ['/v1/applications', 'post', 'createOwnPilotApplication', 'Submit a lab-only customer pilot application', 'Customer', 'ApplicationInput', 'ApplicationRecord', 'Customer role and lab mode only. Existing non-declined application conflicts. Consent is required; no identity document, registration proof or live SIM is accepted or activated.'],
    ['/v1/applications/{id}', 'patch', 'resubmitOwnPilotApplication', 'Correct an owned pilot application before host review', 'Customer', 'ApplicationResubmitInput', 'ApplicationRecord', 'Lab mode and exact owner. Only review_required or information_required records can be changed. Earlier review markers are cleared; real subscriber registration remains false.'],
    ['/v1/ops/applications/{id}/review', 'post', 'reviewPilotApplication', 'Record staff review of a lab pilot application', 'Operations', 'ReviewInput', 'ApplicationRecord', 'subscribers.review and lab mode. ready_for_host requires a registrationReference but does not verify legal registration or provision a SIM. Declined applications are closed.'],
    ['/v1/support/tickets', 'post', 'createOwnSupportCase', 'Create an owned support case', 'Support', 'TicketInput', 'TicketRecord', 'Authenticated account. The owner is fixed to the current subject; clients cannot supply another owner.'],
    ['/v1/support/tickets/{id}', 'patch', 'updateSupportCase', 'Update a support case and add a visible reply', 'Support', 'TicketUpdateInput', 'TicketRecord', 'support.write. Notes are customer-visible conversation entries, capped at 100; they are not an internal secret-note field.'],
    ['/v1/support/tickets/{id}/replies', 'post', 'replyToOwnSupportCase', 'Add a reply to an owned support case', 'Support', 'ReplyInput', 'TicketRecord', 'Exact owner required. Reopens the case, with at most 100 conversation entries.'],
    ['/v1/ops/ledger', 'post', 'recordTestPayment', 'Record a lab-only cash/card/mobile-money test entry', 'Billing', 'LedgerInput', 'LedgerRecord', 'billing.write and lab mode only. Application must exist; reference is unique. USD integer minor units only. The customer owns the resulting record and the actor is recorded as seller. No money moves.'],
    ['/v1/ops/ledger/{id}/refunds', 'post', 'recordTestRefund', 'Record a lab-only refund without moving money', 'Billing', 'RefundInput', 'LedgerRecord', 'billing.write, non-agent role, lab mode and original authentication within five minutes. Cumulative refund cannot exceed the original amount.'],
    ['/v1/account/requests', 'post', 'createOwnAccountRequest', 'Record a closure, correction, SIM-replacement or porting request', 'Customer', 'RequestInput', 'RequestRecord', 'Authenticated account. No automatic closure, erasure, SIM replacement or number transfer is executed.'],
    ['/v1/ops/requests/{id}', 'patch', 'handleAccountRequest', 'Record staff handling of an account request', 'Support', 'RequestUpdateInput', 'RequestRecord', 'support.write. A resolved request is closed. Recording resolved does not establish that a provider transfer, erasure or other external action occurred.'],
  ];
  for (const [path, method, operationId, summary, tag, input, output, rules] of mutations) {
    const create = method === 'post' && !path.includes('{id}');
    operation(path, method, operationId, summary, tag, undefined, { parameters: [...(path.includes('{id}') ? [{ name: 'id', in: 'path', required: true, schema: uuid() }] : []), ...authMutationParameters, idempotencyParameter], requestBody: requestBody(input), description: rules + '\n\n' + mutationRules, responses: { [create ? '201' : '200']: response(summary, ref(output)), ...errorResponses() } });
  }
  for (const [path, id] of [['/v1/activations', 'Activation'], ['/v1/payments', 'Payment'], ['/v1/provisioning', 'Provisioning'], ['/v1/satellite/attach', 'SatelliteAttach']] as const) operation(path, 'post', 'refuseUncommissioned' + id, 'Refuse uncommissioned ' + id.toLowerCase() + ' effects', 'Provider boundaries', undefined, { parameters: authMutationParameters, description: 'Always refuses with 503 PROVIDER_NOT_COMMISSIONED after authentication/CSRF. There is no provider request schema, network attachment, SIM action or money transfer. Do not submit provider credentials or payment data.', responses: errorResponses(), 'x-provider-effects-enabled': false });
  for (const [path, item] of Object.entries(paths)) item.options = { operationId: 'options' + path.replace(/[^A-Za-z0-9]/g, '_'), summary: 'Validate CORS preflight for this path', tags: ['Transport'], security: [], parameters: [...[...path.matchAll(/\{([^}]+)\}/g)].map(match => ({ name: match[1]!, in: 'path', required: true, schema: text() })), { name: 'Origin', in: 'header', schema: text({ format: 'uri' }), description: 'If supplied, must exactly match an allowed origin.' }, { name: 'Access-Control-Request-Method', in: 'header', schema: enumText(['GET', 'HEAD', 'POST', 'PATCH']), description: 'The general preflight method allowlist does not promise every method is implemented at every path.' }, { name: 'Access-Control-Request-Headers', in: 'header', schema: text(), description: 'Case-insensitive subset of Accept, Authorization, Content-Type, Idempotency-Key, X-CSRF-Token.' }], responses: { '204': { description: 'Allowed preflight; no body.', headers: sharedHeaders }, '400': { $ref: '#/components/responses/Error400' }, '403': { $ref: '#/components/responses/Error403' }, '405': { description: 'Requested method is not in the preflight allowlist.', content: { 'application/json': { schema: ref('Error') } } }, '429': { $ref: '#/components/responses/Error429' } } };
  return {
    openapi: '3.1.0', jsonSchemaDialect: 'https://json-schema.org/draft/2020-12/schema',
    info: { title: 'Onesa Mobile hardware pilot and operations API', version: '0.2.0', description: 'Persistent prelaunch control plane for a physical hardware pilot, customer accounts and internal operations. Lab/production identity mode never enables mobile-network, satellite, payment or subscriber-registration effects. All responses use Cache-Control:no-store. Browser mutations require exact Origin/CSRF; native opaque bearer transport is separate. Domain request schemas are generated from the actual exported Zod schemas. JSON Schema does not express all time, ownership, secret-reference and cross-field workflow checks; operation descriptions define those runtime conditions. HTTP parser/transport failures before the application handler may close the connection without a JSON error. No arbitrary query strings, redirected business requests or client-supplied roles/owners are supported.' },
    servers: [{ url: '/api', description: 'Same-origin web reverse proxy; strips /api before reaching the backend.' }, { url: 'http://127.0.0.1:4000', description: 'Loopback isolated development API only; production public origin must use HTTPS.' }],
    tags: ['Public', 'Identity', 'Customer', 'Operations', 'Hardware', 'Readiness', 'Support', 'Billing', 'Provider boundaries', 'Transport'].map(name => ({ name })),
    security: identitySecurity,
    'x-generated-by': 'node scripts/generate-openapi.ts',
    'x-authorization-roles': Object.fromEntries(roles.map(role => [role, permissions({ subject: 'schema', displayName: 'schema', role })])),
    paths,
    components: {
      securitySchemes: {
        sessionCookie: { type: 'apiKey', in: 'cookie', name: '__Host-onesa_mobile_session', description: 'Opaque HTTPS BFF cookie; HttpOnly, Secure, SameSite=Lax. Never a JWT; role/source authorization is revalidated server-side.' },
        labSessionCookie: { type: 'apiKey', in: 'cookie', name: 'onesa_mobile_lab_session', description: 'HTTP development lab cookie only. Production rejects lab identities and uses the Secure host-prefixed cookie.' },
        nativeBearer: { type: 'http', scheme: 'bearer', bearerFormat: 'opaque base64url 32-byte token', description: 'Native capability obtained from lab bearer login or native one-time handoff. Never send alongside the session cookie. Store only in OS secure storage.' },
      },
      responses: Object.fromEntries(Object.entries(errors).map(([code, description]) => ['Error' + code, response(description, ref('Error'), code === '429' ? { 'Retry-After': { schema: text(), description: 'Provided by the generic address limiter; not guaranteed for every authentication-specific rate limit.' } } : {})])),
      schemas: components,
    },
  };
}
export function serializedOpenApi(): string { return JSON.stringify(buildOpenApi(), null, 2) + '\n'; }
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const destination = new URL('../openapi.json', import.meta.url), output = serializedOpenApi();
  if (process.argv.includes('--check')) {
    if (readFileSync(destination, 'utf8') !== output) throw new Error('OpenAPI is stale. Run node scripts/generate-openapi.ts and review the contract change.');
    console.info('OpenAPI matches the current generator and domain schemas.');
  } else {
    if (process.argv.length > 2) throw new Error('Use no arguments to generate, or --check to verify.');
    writeFileSync(destination, output);
    console.info('Generated hardware pilot and account API contract.');
  }
}
