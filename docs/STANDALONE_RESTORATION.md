# Standalone restoration — 9 November 2026

The owner requested that Onesa products return to their existing standalone repositories and that `onesa-ug` be removed only after the move. This change restores the entire Mobile source, native projects, documentation, binary resources, lockfiles, runtime and recovery tooling to `DruHustle/onesa-mobile`.

## Source provenance

- Source repository: `DruHustle/onesa-ug`.
- Reviewed source commit: `0341f51dfc6bf41ee84bedb0dbac4de40f2725b5`.
- Imported product directory: `onesa-mobile/`.
- Imported Git tree: `50fb9c7aadda2e6df2acaa77ee1db6800b3409d6`.
- The prior standalone repository contained a README-only retirement stub. The source commit and all monorepo refs are preserved in the migration backup.

Application code, dependencies and runtime behavior are preserved. The changes for standalone operation are repository references and build paths, root-owned GitHub workflows, and relocation of the Portal identity-provider qualification responsibility to Portal. The old generated workflow templates are removed; the workflows in `.github/workflows/` are maintained directly. Existing public-runner/visibility guards remain in place.

## Qualification ownership

Mobile's workflow runs the web tests/build, backend types and HTTP contracts, native types/tests/JS exports, container restart/recovery and synthetic browser journeys. The separate native workflow retains Android debug and unsigned iOS simulator compilation. These workflows reference only files in this repository.

The restoration's hosted Android jobs encountered HTTP 504 responses while downloading Gradle and Kotlin, followed by the wrapper's 10-second read timeout. The wrapper now waits up to 60 seconds for network operations. The Android job retries recognized transient download failures at most twice using the same job cache; other build failures keep their nonzero exit status. Toolchain versions, application source and dependency lockfiles are unchanged. A successful native build is still required; a retry alone is not qualification.

The former monorepo `portal_identity` job exercised Portal's migration 015 and identity-provider tests. That source and check belong in `DruHustle/onesa-company-portal`; they must be retained there when Portal is restored. Mobile continues to test its OIDC client, recovery and grant checks locally. No live identity client or backend is commissioned by moving source.

## Existing Vercel project

Keep `onesa-mobile` (`prj_VsgXltJg2z5BKPadggrKqZEBAOZ0`) in team `team_ZCFijEEeYUAKYka9HEyEeyGm`. Its custom domain is `mobile.onesa.eu`. Set its Git source to `DruHustle/onesa-mobile` and its root directory to `onesa-mobile-frontend/web`; preserve Node 24, Vite, `npm ci`, `npm run build` and `dist`.

The initial read-only provider inventory on 9 November still found the project linked to `onesa-ug`. Production deployment `dpl_6csCVqHajhPfbzFCSnKmnok6E2FJ` was READY from the reviewed monorepo commit. Preserve that deployment for rollback. Qualify the restored source, reconnect the existing project, build a production candidate without assigning domains, verify its deployed routes/assets and explicit API-unavailable behavior, then promote that exact artifact. Recheck the actual Git link and production source before deleting `onesa-ug`.

The website deliberately returns JSON 503 for `/api` until the persistent backend and Portal identity client are commissioned. Moving repositories must preserve this behavior. Native compilation and physical-device acceptance remain distinct from the website deployment.

## Historical evidence

Earlier qualification and deployment links in the product documents refer to the monorepo and are retained as historical receipts. They do not establish that the standalone branch or a new deployment has passed. Current restoration checks and any provider cutover must be recorded separately.
