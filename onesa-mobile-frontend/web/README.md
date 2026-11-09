# Onesa Mobile web

Public concept website and separate authenticated customer/staff workspaces. Built with React, TypeScript and Vite; the package has no backend source imports.

## Run

```sh
npm ci
npm run dev
```

Use Node 24.22.1. Open `http://localhost:5173`. Start the backend on loopback port 4000 for account/staff operations; Vite proxies `/api`. From the product root, `npm run dev` starts both independent processes after both packages' dependencies are installed. A production gateway must serve the same-origin `/api` proxy; use the reviewed runtime configuration.

| Route | Behavior |
| --- | --- |
| `/` | Public concept plans, connectivity explanations, FAQs and account/staff entry points |
| `/account/` | Protected pilot application, support/replies, account requests, test PDFs and complete export |
| `/internal/` | Staff MFA sign-in and permission-filtered hardware, readiness, customer support, test billing and audit workflows |
| `/#demo` | Explicitly fictional customer preview, independent of authentication |
| `/preview/internal/` | Preserved fictional company preview; browser-local changes have no business effect |

The production workspaces use cookies, anti-CSRF tokens, server permissions, current revisions and retained per-payload retry keys. They show pending, empty, error and stale/conflict states without inventing network measurements or payment success. Collection cursors expose older records. Sensitive approval/refund failures require reauthentication when the API says the original proof is too old.

Lab credentials come from the private backend bootstrap file, not from constants in the website. Staff need an authenticator code. Central identity is exposed only when configured. Public code never contains a client secret, bearer token or real subscriber fixture.

The layout uses readable text, visible focus, 44 px controls, compact mobile cards, full staff navigation and bounded table scrolling. These design rules still require assistive-technology and device acceptance. All plan prices and commercial allowances remain unset.

## Verify

```sh
npm test
npm run build
```

Tests cover readiness honesty, preview isolation, retry-key behavior and the workspace contracts. Browser visual checks use a local ignored `.validation/` harness with synthetic component fixtures; this harness is excluded from the build/deployment. Real HTTP integration and security tests live in the backend package. Browser component checks are not evidence of hosted SSO or device-network success.
