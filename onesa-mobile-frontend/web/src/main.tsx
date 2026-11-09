import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

const InternalApp = lazy(() => import("./internal/InternalApp"));
const WorkspaceApp = lazy(() => import("./workspace/WorkspaceApp"));
const path = window.location.pathname;
const isInternalPreview = path === '/preview/internal' || path.startsWith('/preview/internal/');
const workspaceSurface = path === '/internal' || path.startsWith('/internal/') ? 'staff' : path === '/account' || path.startsWith('/account/') ? 'customer' : null;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Suspense fallback={<p style={{padding:24}}>Opening Onesa Mobile…</p>}>
      {workspaceSurface ? <WorkspaceApp surface={workspaceSurface}/> : isInternalPreview ? <InternalApp /> : <App />}
    </Suspense>
  </React.StrictMode>,
);
