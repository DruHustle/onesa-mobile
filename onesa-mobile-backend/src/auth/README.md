# Mobile authentication

This module owns local lab identity and the Mobile BFF integration with the existing
Onesa Company Portal. It does not authenticate a subscriber to a mobile network.

## Run an isolated hardware lab

From `onesa-mobile-backend/`, with `APP_MODE=lab` and the same `DATABASE_PATH` used
by the server:

```sh
node src/auth/bootstrap.ts --all-roles --second-customer
```

The CLI creates generated passwords and staff TOTP seeds in
`var/lab-credentials.json`, mode 0600, and an adjacent 0600 auth encryption key.
It prints the destination only. Keep the credentials file private; enroll staff
seeds/otpauth URIs in an authenticator. Staff must supply a fresh six-digit code.
The two customer identities support account-isolation checks. An existing user
or credentials output is never silently overwritten or reset. Use `--database`,
`--output` and `--origin` for explicit alternative local paths/origin. Lab sign-in
has no public staff registration route.

These are lab identities. The production constructor refuses databases containing
lab users or sessions; it never loads a local key file as a production fallback.

## Reissue an identity after a lab restore

Recovery disables every restored lab identity, increments revisions, clears all
sessions/flows/native handoffs and advances accepted TOTP counters. A backup may
contain an old password, revoked role or a user disabled after the snapshot; those
historical credentials must not silently regain access.

Reconcile each person and their restored role against current authorization, then
explicitly reissue one approved account from the backend directory:

```sh
node src/auth/reissue-lab.ts --database ../restored/onesa-mobile.sqlite --username operations --expected-role operations --output ../private/reissued-operations.json
```

Use the actual stored username and reviewed role. The command refuses a mismatch,
production mode, missing lab key sidecar or an existing output file. It preserves
the subject and role, rotates the password and staff authenticator seed, enables
only that user and revokes prior sessions. New credentials are fsynced to an
exclusive 0600 file before the identity transaction commits. A persistence failure
rolls back the identity change. There is no bulk enable command or public recovery
endpoint. Keep revoked users disabled; do not infer current access from the archive.

## Central Onesa identity

Production requires an exact HTTPS public origin, a separately registered Mobile
client and a 64-hex-character `AUTH_ENCRYPTION_KEY` from protected secret custody.
Root platform config supplies `ONESA_ISSUER`, `ONESA_CLIENT_ID` and
`ONESA_CLIENT_SECRET`. The issuer must have the actual Portal shape
`https://<approved-account-host>/api/v1/identity`. The exact Mobile callback is
`https://<approved-mobile-host>/api/v1/auth/onesa/callback`.

Portal must independently release the optional Mobile product/role schema and
migration 015, configure its confidential client, and allow that exact callback
through its frontend protocol proxy. No code in this module registers a client,
guesses a provider endpoint or grants access. Existing Portal source is the
contract: `/auth`, `/token`, `/jwks`, `/.well-known/openid-configuration`, the
Basic-authenticated POST `/session`, and token-scoped POST `/revoke` under its
issuer path.

Authorization Code + S256, state, nonce, issuer, audience and RS256 signatures are
validated using openid-client. The upstream opaque access token remains encrypted
server-side. Every authenticated business request calls Portal `/session` again;
roles from a decoded ID token or client input never authorize an operation.
Source authentication time/factors are retained. Every staff role requires MFA.
Fresh sensitive actions use `requireFresh`, not a newly minted session timestamp.

## HTTP integration

- `beginOnesa` returns an authorization URL and a complete flow `Set-Cookie` value.
- `completeOnesa` takes the full callback URL and raw request `Cookie` header.
  For web it returns an opaque local token for an HttpOnly cookie. For native it
  returns a fixed custom-scheme redirect containing a one-use 60-second code;
  do not also set a web account cookie or put the token in the URL.
- `exchangeNative` requires the original native state and S256 verifier. Use the
  returned opaque token only as native bearer authorization; the app must keep
  it in OS secure storage and erase it with cached account data on sign-out.
- `authenticate` rejects ambiguous cookie/bearer credentials and returns a current
  principal. Call `assertMutation` for authenticated writes; cookies require exact
  Origin and CSRF, bearer requests reject foreign browser Origins.
- Route logout **before live authentication** through `logoutPresented`, passing
  presented headers and local Origin/CSRF. It only destroys a local capability,
  cannot grant business access, and remains available during issuer outages.
  Report `centralRevocation` honestly; local sign-out is not global Onesa logout.
- Use `publicSession` for responses; never serialize a raw session row, flow,
  password hash, authenticator seed, encryption key or upstream token.

All identity routes must be no-store, bounded and excluded from request-body/token
logging. SQLite and encryption-key backup/restore need separate protected custody.
This implementation is a single-instance pilot/control-plane store; do not scale
independent SQLite replicas and assume shared session/revocation semantics.

## Verification

```sh
node --test test/auth*.test.ts
```

The local suite covers password/TOTP, replay, CSRF/origin, disabled/changed users,
opaque token custody, private bootstrap, lab/production isolation, actual signed
OIDC code exchange with synthetic transport, live role/revocation checks, native
handoff and outage logout. Separate actual Portal/PostgreSQL and physical-device
acceptance remain necessary before enabling central identity in a real deployment.
