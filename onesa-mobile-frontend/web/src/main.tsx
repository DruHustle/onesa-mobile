/// <reference types="vite/client" />

import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

const InternalDemo = import.meta.env.DEV ? lazy(() => import("./internal/InternalApp")) : null;
const WorkspaceApp = lazy(() => import("./workspace/WorkspaceApp"));
const path = window.location.pathname;
const isInternalPreview = path === '/preview/internal' || path.startsWith('/preview/internal/');
const workspaceSurface = path === '/internal' || path.startsWith('/internal/') ? 'staff' : path === '/account' || path.startsWith('/account/') ? 'customer' : null;

function StaffIntroduction() {
  return (
    <main className="shell plans-section">
      <header className="section-heading">
        <h1>Onesa Mobile staff operations</h1>
        <p>Authorized staff use this workspace to manage pilot equipment, respond to support requests and review readiness records.</p>
      </header>
      <div className="hero-actions">
        <a className="button primary" href="/internal/">Continue to staff sign-in</a>
        <a className="button light" href="/">Onesa Mobile home</a>
      </div>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Suspense fallback={<p style={{padding:24}}>Opening Onesa Mobile…</p>}>
      {workspaceSurface ? <WorkspaceApp surface={workspaceSurface} /> :
        isInternalPreview ? (InternalDemo ? <InternalDemo /> : <StaffIntroduction />) : <App />}
    </Suspense>
  </React.StrictMode>,
);
