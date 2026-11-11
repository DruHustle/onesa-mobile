# Onesa Mobile native app

Independent Expo / React Native customer app for **iPhone, iPad and Android**, with generated native projects and an authenticated API connection. The preview bundle identifiers remain `eu.onesa.mobile.preview` so lab builds are distinct from any future commercial app.

## Implemented journeys

- Home: actual application state, next action, explicit account-refresh age and unprovisioned service status.
- Launch: signed-in customers can register and withdraw a free expression of interest. The app shows the latest saved status and change time. Satellite service is pending a provider agreement.
- Application (lab): pilot details, device/SIM preference, consent and corrections requested by the team.
- Help: support cases, staff replies and customer follow-up, with bounded older-record pages.
- Account: own requests/status, protected test PDFs, complete JSON export and sign-out.
- Optional Explore preview: the earlier Home/Plans/Network/Account concept experience remains clearly fictional.

No app action attaches a phone to a satellite, verifies subscriber registration, activates a SIM, moves money or creates a tax invoice. The app is not currently qualified for a carrier's constrained satellite app list. Direct-to-cell, terrestrial access and dish-based Wi-Fi remain separate explanations and test paths.

## Configure and run

Use Node 24.22.1 and the locked Expo 58 toolchain:

```sh
npm ci
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.20:4000 npm start
```

Replace the example address with the deliberately exposed lab API. Loopback on a phone refers to the phone; use a reachable private LAN address, or `10.0.2.2` for an Android emulator reaching its host. Production builds reject cleartext HTTP and need an HTTPS origin or HTTPS gateway URL ending in `/api`. No API address means account access is unconfigured and the concept preview remains available.

The public customer origin `https://mobile.onesa.eu` requires production service discovery and shared Onesa sign-in. A response from an isolated lab at this address leaves account access closed. Use the lab's own address for hardware tests.

The only public build variable is the API address. **Never embed an OIDC client secret, encryption key or provider credential in an Expo public variable.** Server configuration and secrets stay on the API.

Local customer accounts use administrator-issued lab credentials. Central registration/recovery occurs in the shared Onesa browser flow when configured. Staff operations remain a protected web workspace, not a native credential shortcut.

## Session and connectivity behavior

Onesa sign-in uses the system browser and a native PKCE challenge. The callback has exactly the registered custom scheme/host/path and a one-time handoff code/state; it never carries a bearer token. Pending verifier/state is device-bound and expires. Session tokens are stored in Expo SecureStore with device-local, unlocked-only access, scoped to a hash of the API origin.

The offline cache stores only account display metadata and a small application-status summary. It excludes support conversations, payment history and identity documents. Cache age is shown; mutations are explicit and not silently queued. API requests time out, reject redirects and retain an idempotency key for an identical retry. Sign-out clears the local token/cache immediately and reports failure to confirm server revocation without pretending the device is still signed in.

PDF and account exports download only on request to temporary app storage, use the native share sheet and are removed from that temporary location afterward. A recipient or share destination may retain its own copy. No application analytics or background polling is configured.

## Native build and verification

```sh
npm run typecheck
npm test
npm run export
npm run prebuild
```

`npm run verify` runs typecheck, tests and both platform JavaScript exports. `prebuild` regenerates native files from `app.json` and `plugins/`; review its diff. SecureStore, WebBrowser and Sharing plugins are included. iPhone and iPad share the generated iOS target.

The tracked `ios/.xcode.env.example` contains the public Node executable lookup. `npm run prepare:ios` copies it to the ignored `ios/.xcode.env` only when that file is missing, preserving existing local configuration. `npm run ios` runs this preparation automatically; run it explicitly before invoking CocoaPods or Xcode directly. Local overrides in `ios/.xcode.env.local` remain untracked.

On macOS with compatible Xcode/CocoaPods, run `npm run ios`. With the pinned Android SDK/JDK and an emulator or authorized device, run `npm run android`. The root native workflow compiles Android debug and an unsigned iOS simulator target; consult the exact run for results. Successful compiler jobs retain exact build artifacts for seven days: an Android arm64 debug APK and a compressed unsigned iOS simulator app. Both Debug builds require a Metro development server; the simulator archive is not an installable iPhone/iPad device package. Configure the approved API address when starting Metro. These artifacts contain no release signing material. JavaScript export, compiler success, signed distribution and physical-device acceptance are separate evidence levels.

The Android signing plugin uses each development machine's normal private debug key and keeps release builds unsigned. No keystore, Apple signing identity or provisioning profile is committed. Production distribution needs the owner's signing/developer configuration.

## Source map

| Path | Purpose |
| --- | --- |
| `App.tsx` | Customer journeys, native browser sign-in, secure storage and document sharing |
| `src/api.ts` | Independent HTTP client, URL/callback validation and minimized cache contract |
| `src/PreviewApp.tsx`, `src/domain.ts` | Isolated concept preview and local state |
| `src/ui.tsx` | Forest/mint components, readable typography, accessible target sizes |
| `app.json`, `plugins/` | Native generation, package IDs, permissions and signing rules |
| `ios/`, `android/` | Generated native projects |

The project does not request camera, microphone, location or legacy external storage. Review generated manifests and actual OS prompts after every plugin update. Test secure storage, callbacks, sharing, text scaling, VoiceOver/TalkBack, intermittent data and recovery on the physical matrix before release. [Validation](../../docs/VALIDATION.md) records completed evidence; [hardware acceptance](../../docs/HARDWARE_PILOT.md) defines the remaining device work.
