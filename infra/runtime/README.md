# Onesa Mobile pilot runtime and recovery

This runtime operates the Mobile software control plane: customer pilot records, staff workflows, hardware inventory, commissioning evidence, support and test billing. It does not operate a cellular radio, provision a SIM, route emergency calls, charge a customer or grant satellite entitlement. `GET /api/v1/status` and `/api/healthz` continue to identify the service as prelaunch.

Use the physical bench and acceptance sequence in [HARDWARE_PILOT.md](../../docs/HARDWARE_PILOT.md). A dish connected to a router is a separate satellite-broadband IP path; it does not establish handset direct-to-cell capability.

## Runtime boundaries

| Component | Binding and responsibility |
| --- | --- |
| Web gateway | Unprivileged NGINX, container port 8080, host `127.0.0.1:8080` by default. Serves the public, customer and protected staff application shells. |
| API | Node.js 24.22.1, internal port 4000, no published host port. The gateway removes the `/api` prefix. |
| Persistence | One named volume, one SQLite file for operational and authentication tables. The API is one instance. |
| Lab identities | Random per-install passwords; all staff roles require an authenticator. No default password is embedded in the image. |
| Production identities | Explicitly registered Onesa Mobile confidential client, HTTPS origin and externally supplied authentication encryption key. |
| Recovery | SQLite online backup, authenticated encrypted archive and restore into a new database path. No provider or radio connection is needed. |

The API and gateway run without root, with read-only root filesystems, dropped Linux capabilities, bounded process/memory limits and health checks. Only their required data or temporary directories are writable. The API stays on an internal network with no external egress. The web gateway alone also joins an ingress bridge to publish its loopback port. Containers still share the host kernel; protect the host and Docker administration separately.

The gateway overwrites `X-Forwarded-For` with the connection address. The API trusts only its configured gateway IP, not an arbitrary forwarded chain. Static private addresses make that boundary explicit. Raw API access and proxy error logs are suppressed because OAuth callback URLs can contain authorization codes. Backend request failures emit sanitized request IDs. Static access logs exclude query strings.

## Start a fresh local lab

Requirements: Docker with Compose 2.24.4 or newer, sufficient disk space, and an operator-controlled workstation. Run these commands from the repository root:

```sh
docker compose -f infra/runtime/compose.lab.yaml config --quiet
docker compose -f infra/runtime/compose.lab.yaml up --build -d --wait --wait-timeout 120
docker compose -f infra/runtime/compose.lab.yaml exec -T api node src/auth/bootstrap.ts --all-roles --second-customer
```

Open `http://localhost:8080/`, `http://localhost:8080/account/` and `http://localhost:8080/internal/`. The internal route serves a sign-in shell until the API verifies staff access. The separate synthetic demonstration remains clearly labelled.

Bootstrap writes `/app/var/lab-credentials.json` with generated credentials for `admin`, `operations`, `support`, `finance`, `agent`, `auditor`, `customer` and `customer-two`. It refuses to overwrite accounts or a previous output file. Retrieve that private file into an owner-only local directory:

```sh
umask 077
mkdir -p private
chmod 700 private
docker compose -f infra/runtime/compose.lab.yaml cp api:/app/var/lab-credentials.json private/lab-credentials.json
chmod 600 private/lab-credentials.json
```

Open it in a trusted local editor, enroll each staff authenticator from its own `otpAuthUri` or seed, and retain credentials in the approved password manager. Do not paste the contents into a terminal transcript, issue, chat, test report or Git. After confirming secure custody, remove the extra container copy:

```sh
docker compose -f infra/runtime/compose.lab.yaml exec -T api node -e "require('node:fs').unlinkSync('/app/var/lab-credentials.json')"
```

The `.authkey` file is different: retain it with the lab database. Losing or replacing it makes encrypted authentication state unreadable. Encrypted lab archives include this key inside their ciphertext.

Create a bench site and register actual devices before recording checks. A recorded hardware check is an operator observation, not device telemetry. Passing all checks does not send network commands. Use two different authorized people when submitting and accepting regulatory/provider evidence.

### Port and subnet changes

If port 8080 is occupied, set both `MOBILE_LAB_PORT` and `MOBILE_LAB_ORIGIN`; an origin includes the exact scheme, hostname and port. The default Docker subnet is `172.31.248.0/28`. If it conflicts with a local network, set all three of `MOBILE_LAB_SUBNET`, `MOBILE_LAB_PROXY_IP` and `MOBILE_LAB_API_IP` to a new private subnet and two distinct addresses inside it. The gateway address is also the exact `TRUST_PROXY_IPS` value. A wildcard, subnet CIDR or user-supplied forwarding chain is not accepted by the API.

Loopback binding intentionally limits this lab to the host. A physical phone needs a qualified USB forwarding arrangement or an approved HTTPS lab ingress and matching native API configuration. Opening a public HTTP listener is not part of these instructions.

### Stop, restart and inspect

```sh
docker compose -f infra/runtime/compose.lab.yaml ps
docker compose -f infra/runtime/compose.lab.yaml logs --tail 50 api
docker compose -f infra/runtime/compose.lab.yaml restart api
docker compose -f infra/runtime/compose.lab.yaml stop
```

`stop` and an ordinary `down` preserve the named volume. Never add `--volumes` to an operator shutdown command: it deletes the database volume. CI uses that flag only for its explicitly named disposable project. A green web health check means its process serves requests; the API health check does not prove network connectivity, successful provider integration, storage capacity or business readiness.

## Encrypted backups

The recovery scripts require Node.js 24.22.1 and only Node built-ins at runtime. Generate a random recovery key directly into a protected file; it is never printed:

```sh
node scripts/backup.mjs --generate-key private/backup.key
node scripts/backup.mjs --help
node scripts/restore.mjs --help
```

Retain the recovery key separately from archive storage, with an accountable custodian and a recoverable second copy under the approved key policy. The backup key is distinct from `AUTH_ENCRYPTION_KEY` and the lab `.authkey`. No recovery mechanism can decrypt an archive after its only recovery key is lost.

For an API running directly on the host:

```sh
node scripts/backup.mjs --mode lab --database onesa-mobile-backend/var/onesa-mobile.sqlite --output backups/pilot-001.omb --key-file private/backup.key
```

An output directory is created with mode 0700 if absent; an existing output directory must already be owner-only. Archives and key files use mode 0600. Existing archives are never overwritten. Choose a new archive name per run.

For Compose, use the isolated maintenance image. Prepare absolute `MOBILE_RECOVERY_DIRECTORY` and `MOBILE_RECOVERY_KEY_FILE` environment variables pointing to an existing protected archive directory and key file. The directory must be owned by UID 1000 and mode 0700; the key must be readable by UID 1000 and mode 0600. Docker Desktop and native Linux mount permissions differ, so verify access without making the key world-readable. The bind mounts refuse to create missing host paths.

Select the source explicitly using `MOBILE_RECOVERY_VOLUME` and `MOBILE_RECOVERY_MODE`. Confirm the named volume mounted at `/app/var` in the intended API container's `docker inspect` output; project-name overrides change volume names. For the default lab started above, that volume is `onesa-mobile-lab_mobile-data`:

```sh
export MOBILE_RECOVERY_VOLUME=onesa-mobile-lab_mobile-data
export MOBILE_RECOVERY_MODE=lab
docker volume inspect "$MOBILE_RECOVERY_VOLUME" --format '{{.Name}}'
docker compose -f infra/runtime/compose.lab.yaml -f infra/runtime/compose.recovery.yaml --profile maintenance build recovery
docker compose -f infra/runtime/compose.lab.yaml -f infra/runtime/compose.recovery.yaml --profile maintenance run --rm --no-deps recovery backup.mjs --mode lab --database /data/onesa-mobile.sqlite --output /backups/pilot-001.omb --key-file /run/recovery.key
```

The overlay has no default source volume. Its external volume declaration refuses to create an empty replacement, and missing volume/mode selection fails configuration. The container entrypoint rejects a `--mode` that differs from `MOBILE_RECOVERY_MODE` before accessing database paths. Combining a production overlay with maintenance therefore cannot silently choose the lab volume. These checks require the operator to select the correct existing volume; they do not establish its business ownership.

The helper has no network and runs as UID 1000. It mounts the selected data volume for online SQLite access and possible restoration; its backup operation opens the source database read-only. The archive is an AES-256-GCM authenticated stream: versioned header, encrypted metadata/checksum, database bytes and authentication tag. The lab key is encrypted in metadata. Production archives deliberately exclude the external authentication encryption key and refuse databases containing lab identities or a lab sidecar.

Backup creation uses SQLite's online-backup API so committed WAL changes are included consistently. Do not replace it with `cp` or `docker cp` of a running `.sqlite` main file. The snapshot must pass SQLite integrity, expected schema version and audit-chain checks before it is encrypted. The format currently supports schema version 1 and databases up to 16 GiB; larger stores require separate qualification.

Set backup frequency, retention and recovery targets before storing real customer data. Initial engineering targets to measure in a pilot are a 24-hour maximum data-loss window and a four-hour restoration window; neither is an achieved SLA. Keep an off-host encrypted copy and perform a restore drill after runtime, schema or key changes. No scheduler or external backup destination is silently enabled by these files.

## Restore drill and controlled recovery

A drill restores to a separate, unused database. A cutover additionally requires stopping the API and explicitly choosing the recovered database. The restore script never replaces an existing database, WAL, SHM or auth-key path.

Host drill:

```sh
node scripts/restore.mjs --mode lab --input backups/pilot-001.omb --database restored/onesa-mobile.sqlite --key-file private/backup.key
```

Compose drill into a new subdirectory of the explicitly selected lab data volume, retaining the four recovery environment variables above:

```sh
docker compose -f infra/runtime/compose.lab.yaml -f infra/runtime/compose.recovery.yaml --profile maintenance run --rm --no-deps recovery restore.mjs --mode lab --input /backups/pilot-001.omb --database /data/recovered-001/onesa-mobile.sqlite --key-file /run/recovery.key
```

Before any SQLite parsing or installation, the archive must authenticate. Then the restore verifies the database length, checksum, integrity, schema and audit chain. It clears every restored local bearer/cookie session, OAuth flow and native handoff. All restored lab identities are disabled and their revisions increase: an old snapshot must not resurrect a password, staff grant or account revoked after the backup. Reconcile current authority and explicitly reissue each needed lab identity before it can sign in again. Production users sign in again through the live Portal, which rechecks current grants. Staff TOTP replay counters also advance through the current and accepted future time step. Idempotency results and operational audit history remain intact. Restore adds a sanitized authentication event and reports the number of disabled lab identities.

Validate the recovered database in a separate process before switching `DATABASE_PATH`. Reconcile changes made after the backup—particularly access revocations, pending requests, retention/deletion obligations and financial records—from an authorized independent record. A backup cannot reconstruct changes after its snapshot. Do not make an old snapshot authoritative solely because its integrity check passes.

After reviewing the current authority of an individual lab operator, reissue that account explicitly. The expected role must match the reviewed recovered record; the subject remains unchanged so its records retain ownership. The command rotates the password and staff authenticator seed, enables only that user, and writes fresh credentials to a new protected file:

```sh
node onesa-mobile-backend/src/auth/reissue-lab.ts --database restored/onesa-mobile.sqlite --username operations --expected-role operations --output private/reissued-operations.json
```

For a recovered Compose path, run the API image as a one-off CLI without starting its server or dependencies:

```sh
docker compose -f infra/runtime/compose.lab.yaml run --rm --no-deps api node src/auth/reissue-lab.ts --database /app/var/recovered-001/onesa-mobile.sqlite --username operations --expected-role operations --output /app/var/recovered-001/reissued-operations-credentials.json
```

Retrieve and protect the output as for bootstrap, enroll the new authenticator, and keep unapproved accounts disabled. A role mismatch, absent lab-key sidecar, existing output file or production environment causes refusal; reissue never bulk-enables users. Resolve a post-backup role downgrade through the approved access-change process before reissue. Do not restore the old password or authenticator seed manually.

For an actual cutover, stop the API, point it at the selected restored file and its matching lab key (or the retained external production key), reconcile and reissue any needed lab identities, start one API instance, sign in again, and inspect records and audit integrity. Preserve the previous files for an approved rollback until acceptance is complete. Restoring lab data into production is refused.

Production recovery requires the actual approved production volume in `MOBILE_RECOVERY_VOLUME`, `MOBILE_RECOVERY_MODE=production`, the retained external production authentication key, and the protected recovery key/archive paths. Include `compose.production.yaml` between the lab base and the recovery overlay, and use `--mode production` in the backup/restore command. Inspect the merged configuration before the operation. The helper does not infer the source from overlay order, rename a lab volume or copy lab identities into production. The production environment remains a deployment candidate until separately commissioned.

Temporary decrypted snapshots are held in owner-only directories and removed on normal completion or failure. A host/process crash can leave a protected temporary directory; include its controlled cleanup in recovery and use encrypted disks. The live SQLite database is not itself encrypted by these scripts. Host disk encryption, backup storage controls and jurisdictional decisions remain required for real data.

## Production configuration candidate

`compose.production.yaml` is an overlay to review and qualify, not evidence of a hosted production service. It switches to a separate `mobile-production-data` volume and requires:

- `MOBILE_PUBLIC_ORIGIN`: approved HTTPS origin.
- `MOBILE_ONESA_ISSUER`: approved issuer ending `/api/v1/identity`.
- `MOBILE_ONESA_CLIENT_ID`: registered Mobile confidential-client identifier.
- `MOBILE_ONESA_SECRET_FILE`: protected client-secret file.
- `MOBILE_AUTH_KEY_FILE`: protected 64-hex-character authentication encryption key file.

The container entrypoint reads only the two explicit secret-file inputs and refuses an ambiguous file/value pair. Never pass secrets in frontend variables or build arguments. The production configuration refuses missing central identity, missing encryption key, HTTP origins and an existing database with lab identities. The configuration does not turn on commercial service.

An approved TLS ingress must terminate HTTPS, enforce host routing and set transport-security policy before forwarding to the loopback web port. If another proxy is introduced, qualify its real-client-IP handling and update exact proxy trust accordingly; the gateway currently records its direct peer as the client. Do not trust an incoming public forwarding header. The production network permits egress for the identity provider; host-level egress controls, monitoring and alerting must be explicitly deployed.

This is a single-instance SQLite architecture. Do not scale API replicas against the same file, place the database on an unqualified network filesystem, or describe this Compose stack as highly available. A database/process or host failure can stop the control plane. Node.js 24.22.1 documents `node:sqlite` as a release-candidate API; pin and requalify the runtime. Before a customer production launch, commission the approved durable database architecture, load tests, operational monitoring, recovery exercises and provider integrations.

Node image versions are fixed; the official NGINX stable image tag can move when upstream publishes fixes. Record and pin reviewed image digests for each hosted release, together with source revision and test receipts. These files do not claim an unrun image has been qualified.

## Gateway publication and API isolation

The web gateway joins both `ingress` and the internal `private` network. Docker needs a default-gateway network to publish a host port; an internal-only gateway can appear healthy while its requested host port is absent. The API joins only `private`, has no published port and retains outbound isolation. Only the gateway has an ordinary bridge/default route. Its host binding is explicitly `127.0.0.1`; NGINX proxies only to the fixed private API. The container smoke test verifies the actual mapping and network membership before testing requests. [Docker maintainer explanation](https://github.com/moby/moby/discussions/53256); [Compose internal networks](https://docs.docker.com/compose/how-tos/networking/#internal-networks).

## Qualification matrix

| Check | How to run | What it proves |
| --- | --- | --- |
| Local encrypted recovery and source selection | `node --test scripts/tests/*.test.mjs` after backend `npm ci` | Actual operational/auth schemas, WAL capture, integrity, tamper/wrong-key rejection, no overwrite, mode isolation, session invalidation, disabled recovered lab authority and matching recovery invocation. The Compose merge test explicitly skips when Docker is absent. |
| Container runtime | Root workflow `onesa-mobile-ci.yml`, runtime job | Dependency-complete images, gateway/API contracts, identity bootstrap, persistent records/idempotency/audit across restart, and container recovery. |
| Browser journeys | Root workflow `onesa-mobile-ci.yml`, browser job; locally `npm ci` in Mobile root, install the locked Playwright Chromium, build web, then `npm run test:browser` | Real local API/customer/hardware flows with disposable synthetic data, queued-response expiry, role denial, service retry, open forms and page reflow at 320/390/768/1440 px. Captures synthetic screenshots; no external target or provider action. |
| Portal identity | Company Portal repository workflow, ephemeral PostgreSQL job | Additive migration and actual provider regression tests using a loopback `_test` database and synthetic identities. |
| Native JavaScript | Package `npm run verify` | Types, unit tests and iOS/Android JS exports. |
| Native compilation | Root workflow `onesa-mobile-native-compile.yml`, scoped push/PR or manual dispatch | Android debug APK and unsigned iPhone/iPad simulator app compile on hosted toolchains. No release keys or store publication. |
| Physical acceptance | Hardware pilot matrix and signed test evidence | Real device behavior, approved SIM/operator/firmware combinations and observed connectivity. No simulator result substitutes for this. |

The container smoke script refuses any project name outside `onesa-mobile-ci-*`, creates only synthetic records and never prints or uploads its generated credentials or database. CI cleanup removes only that disposable project. Native compilation runs automatically for scoped changes and can also be dispatched manually. GitHub documents the selected standard Ubuntu and macOS runners as free for public repositories; this is the verified public repository's configuration. The workflow does not purchase larger runners, upload release keys or publish apps.

The first release's six recovery tests passed locally and on hosted CI. Its application source `3af4282` passed [qualification run 42080127807](https://github.com/DruHustle/onesa-ug/actions/runs/42080127807), including actual container build/start/restart/recovery and 35 Portal tests against disposable PostgreSQL. The second review adds explicit recovery source selection and browser journeys: eight recovery/entrypoint tests pass locally, with the actual Compose merge test skipped because Docker is absent. Local Chromium launch was denied a required operating-system socket before it opened a page; browser results and screenshots must come from the new hosted job. The new runtime and browser gates now pass in [qualification run 42129021936](https://github.com/DruHustle/onesa-ug/actions/runs/42129021936) on `337142d`: **9 recovery tests with no skips**, actual container persistence/recovery, and **20 browser groups / 31 layout observations**. The earlier run is retained only as history. Docker and Apple/Android native toolchains are unavailable in the editing environment. See [VALIDATION.md](../../docs/VALIDATION.md) for the exact source, tested image IDs, native compilation/artifact receipts and physical acceptance boundaries.

## Primary implementation references

- [Compose external volumes](https://docs.docker.com/reference/compose-file/volumes/) and [required environment interpolation](https://docs.docker.com/reference/compose-file/interpolation/).
- [Playwright library](https://playwright.dev/docs/library) and [clock-controlled expiry testing](https://playwright.dev/docs/clock).
- [Node.js 24.22.1 SQLite API and online backup](https://nodejs.org/download/release/v24.22.1/docs/api/sqlite.html).
- [Official NGINX unprivileged image](https://github.com/nginx/docker-nginx-unprivileged).
- [Compose health-based startup order](https://docs.docker.com/compose/how-tos/startup-order/).
- [Compose `!override` and minimum version](https://docs.docker.com/reference/compose-file/merge/).
- [GitHub hosted runner image inventory](https://github.com/actions/runner-images).
- [GitHub Actions billing for public repositories](https://docs.github.com/en/actions/concepts/billing-and-usage) and [standard runner labels](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).
- [Android Gradle plugin 9.2 compatibility](https://developer.android.com/build/releases/agp-9-2-0-release-notes).
