import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildOpenApi, serializedOpenApi } from '../scripts/generate-openapi.ts';
import { roles, permissions, schemas } from '../src/platform/model.ts';
import { roles as authRoles } from '../src/auth/service.ts';
import { z } from 'zod';

type Json = Record<string, unknown>;
const object = (value: unknown): Json => { assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value)); return value as Json; };
const document = buildOpenApi(), paths = object(document.paths), components = object(document.components), definitions = object(components.schemas);
const schemaRef = (value: unknown): string => String(object(value).$ref);

test('the checked-in API contract exactly matches the current domain-schema generator', () => {
  assert.equal(readFileSync(new URL('../openapi.json', import.meta.url), 'utf8'), serializedOpenApi());
  assert.equal(document.openapi, '3.1.0');
  assert.deepEqual(authRoles, roles);
  for (const role of roles) assert.deepEqual(object(document['x-authorization-roles'])[role], permissions({ subject: 'schema', displayName: 'schema', role }));
  for (const [name, schema] of Object.entries(schemas)) {
    const { $schema: _dialect, ...expected } = z.toJSONSchema(schema, { target: 'draft-2020-12', io: 'input' });
    assert.deepEqual(definitions[name[0]!.toUpperCase() + name.slice(1) + 'Input'], expected);
  }
});

test('every schema reference resolves locally and operations have unique identities and response contracts', () => {
  const identifiers = new Set<string>();
  function walk(value: unknown): void {
    if (Array.isArray(value)) { value.forEach(walk); return; }
    if (value === null || typeof value !== 'object') return;
    for (const [key, nested] of Object.entries(value)) {
      if (key === '$ref') {
        assert.equal(typeof nested, 'string'); assert.ok(String(nested).startsWith('#/'));
        let target: unknown = document;
        for (const segment of String(nested).slice(2).split('/')) target = object(target)[segment.replaceAll('~1', '/').replaceAll('~0', '~')];
        assert.ok(target, 'Unresolved reference: ' + nested);
      } else walk(nested);
    }
  }
  walk(document);
  for (const [path, item] of Object.entries(paths)) {
    assert.match(path, /^(\/healthz|\/v1\/)/);
    for (const [method, value] of Object.entries(object(item))) {
      assert.ok(['get', 'head', 'post', 'patch', 'options'].includes(method));
      const operation = object(value), identifier = String(operation.operationId);
      assert.ok(identifier && !identifiers.has(identifier), 'Duplicate operation ' + identifier); identifiers.add(identifier);
      assert.ok(Array.isArray(operation.security)); assert.ok(Object.keys(object(operation.responses)).length > 0);
      const placeholders = [...path.matchAll(/\{([^}]+)\}/g)].map(match => match[1]!);
      for (const name of placeholders) assert.ok((operation.parameters as Json[]).some(parameter => parameter.name === name && parameter.in === 'path' && parameter.required === true));
    }
  }
});

test('literal HTTP route inventory is represented and authenticated operations never inherit public access', () => {
  const source = readFileSync(new URL('../src/platform/http.ts', import.meta.url), 'utf8');
  const literals = new Set([...source.matchAll(/['"]((?:\/v1\/[a-zA-Z0-9/-]+)|\/healthz)['"]/g)].map(match => match[1]!));
  for (const path of literals) {
    // Prefix allowlists are not endpoint registrations.
    if (path.endsWith('/')) continue;
    assert.ok(paths[path], 'Missing literal runtime path: ' + path);
  }
  for (const path of ['/v1/me', '/v1/me/export', '/v1/ops/snapshot', '/v1/ops/records/{kind}', '/v1/me/records/{kind}/{id}', '/v1/documents/{id}.pdf']) {
    const operation = object(object(paths[path]).get);
    assert.equal((operation.security as Json[]).some(requirement => Object.keys(requirement).length === 0), false, path);
    assert.ok(object(operation.responses)['401']); assert.ok(object(operation.responses)['403']);
  }
});

test('domain mutations document cookie CSRF, idempotency, revisions and exact generated input schemas', () => {
  let mutations = 0;
  for (const [path, item] of Object.entries(paths)) for (const [method, value] of Object.entries(object(item))) {
    if (!['post', 'patch'].includes(method)) continue;
    const operation = object(value), parameters = (operation.parameters ?? []) as Json[];
    if (path.startsWith('/v1/auth/') || path.startsWith('/v1/session/')) continue;
    assert.ok(parameters.some(parameter => parameter.name === 'Origin'));
    assert.ok(parameters.some(parameter => parameter.name === 'X-CSRF-Token'));
    if (operation['x-provider-effects-enabled'] === false) {
      assert.equal(operation.requestBody, undefined);
      assert.ok(object(operation.responses)['503']);
      assert.equal(Object.keys(object(operation.responses)).some(code => code.startsWith('2')), false);
      continue;
    }
    mutations++;
    assert.ok(parameters.some(parameter => parameter.name === 'Idempotency-Key' && parameter.required === true));
    const input = object(object(object(operation.requestBody).content)['application/json']).schema;
    const name = schemaRef(input).split('/').at(-1)!;
    assert.equal(object(definitions[name]).additionalProperties, false);
    if (path.includes('{id}')) assert.ok((object(definitions[name]).required as string[]).includes('revision'));
    assert.ok(object(operation.responses)['409']);
  }
  assert.equal(mutations, 18);
});

test('read pages stay bounded while account export is complete, receipts are binary and fixtures remain marked fictional', () => {
  const page = object(object(definitions.Page).properties);
  assert.equal(object(page.items).maxItems, 50);
  const exported = object(object(definitions.AccountExport).properties);
  for (const kind of ['applications', 'tickets', 'ledger', 'requests']) assert.equal(object(exported[kind]).maxItems, undefined);
  const receipt = object(object(object(paths['/v1/documents/{id}.pdf']).get).responses);
  assert.deepEqual(Object.keys(object(object(receipt['200']).content)), ['application/pdf']);
  const forbidden = object(object(components.responses).Error403);
  assert.equal(schemaRef(object(object(forbidden.content)['application/json']).schema), '#/components/schemas/Error');
  for (const name of ['DemoAccount', 'LegacyReadiness']) assert.match(String(object(definitions[name]).description), /fictional|demo/);
  const status = object(object(definitions.Status).properties);
  for (const key of ['productionReady', 'networkConnected', 'commercialSalesEnabled']) assert.equal(object(status[key]).const, false);
});
