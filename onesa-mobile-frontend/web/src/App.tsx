import { useEffect, useRef, useState } from "react";
import { AppAvailability } from "./AppAvailability";
import { pasofi } from "./pasofi";
import { describeReadiness, publicLaunchInterestOpen } from "./readiness.mjs";

type DemoTab = "Overview" | "My plan" | "Billing" | "Help";
type PlanId = "everyday" | "reach" | "family-farm";
type PathId = "mobile" | "satellite" | "wifi";
const plans: {
  id: PlanId;
  name: string;
  eyebrow: string;
  description: string;
  features: string[];
}[] = [
  {
    id: "everyday",
    name: "Everyday",
    eyebrow: "Keep it simple",
    description:
      "A straightforward mobile plan for the things you do every day.",
    features: [
      "Clear allowances and renewal dates",
      "SIM and eSIM options planned",
      "Spending controls in your pocket",
    ],
  },
  {
    id: "reach",
    name: "Reach",
    eyebrow: "Go further",
    description:
      "The mobile experience, with satellite access when a partner can provide it.",
    features: [
      "Satellite eligibility shown clearly",
      "Supported messaging and apps only",
      "Device and country approval required",
    ],
  },
  {
    id: "family-farm",
    name: "Family & Farm",
    eyebrow: "Stay close",
    description:
      "A proposed way to manage connectivity for your people, wherever you are.",
    features: [
      "Sponsor a family member’s plan",
      "Separate controls for each line",
      "Farm and small-business workflows",
    ],
  },
];
const paths: Record<
  PathId,
  {
    name: string;
    steps: string[];
    title: string;
    description: string;
    note: string;
  }
> = {
  mobile: {
    name: "Mobile network",
    steps: ["Your phone", "Local cell tower", "Host mobile network"],
    title: "Your everyday mobile connection.",
    description:
      "Onesa would provide the app, plan and support. A licensed network partner would provide the mobile service.",
    note: "Host partnership required. No Onesa cellular service is active in this preview.",
  },
  satellite: {
    name: "Direct to satellite",
    steps: ["Eligible phone", "Starlink satellite", "Partner mobile core"],
    title: "A planned extension beyond towers.",
    description:
      "Eligible phones could connect directly to satellites under an approved operator agreement. The phone and network manage the connection.",
    note: "Zimbabwe availability, supported devices and Onesa wholesale access are unverified. Native satellite calls and unrestricted broadband are not promised.",
  },
  wifi: {
    name: "Pasofi Wi-Fi",
    steps: ["Your phone on Wi-Fi", "Pasofi hotspot", "Site internet connection"],
    title: "Pasofi community Wi-Fi",
    description:
      `${pasofi.introduction} A nearby hotspot connects your phone to the site’s internet connection over Wi-Fi.`,
    note: pasofi.status,
  },
};

function Mark({ small = false }: { small?: boolean }) {
  return (
    <span className={`mark ${small ? "small" : ""}`} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}
function Arrow() {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 18 18 6M6 6h12v12" />
    </svg>
  );
}

function Balance({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`balance ${compact ? "compact" : ""}`}>
      <div className="spread">
        <span>Illustrative data balance</span>
        <span className="pill subtle">Demo</span>
      </div>
      <div className="amount">
        2.6 <span>GB remaining</span>
      </div>
      <div
        className="meter"
        role="meter"
        aria-label="Illustrative remaining data"
        aria-valuemin={0}
        aria-valuemax={5}
        aria-valuenow={2.6}
      >
        <span />
      </div>
      <div className="spread secondary">
        <span>2.4 GB used of 5 GB</span>
        <span>Fictional allowance</span>
      </div>
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState<"explore" | "demo">(() =>
    window.location.hash === "#demo" ? "demo" : "explore",
  );
  const [demoTab, setDemoTab] = useState<DemoTab>("Overview");
  const [selectedPlan, setSelectedPlan] = useState<PlanId>("everyday");
  const [path, setPath] = useState<PathId>("mobile");
  const [apiStatus, setApiStatus] = useState(
    "Checking account availability…",
  );
  const [checking, setChecking] = useState(true);
  const [interestOpen, setInterestOpen] = useState(false);
  const [statusCheck, setStatusCheck] = useState(0);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const plan = plans.find((item) => item.id === selectedPlan)!;
  const connection = paths[path];
  useEffect(() => {
    const changed = () => {
      if (window.location.hash === "#main") return;
      setScreen(window.location.hash === "#demo" ? "demo" : "explore");
    };
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);

  function navigate(next: "explore" | "demo", tab: DemoTab = "Overview") {
    setScreen(next);
    setDemoTab(tab);
    window.location.hash = next === "demo" ? "demo" : "explore";
    window.scrollTo({ top: 0, behavior: "auto" });
    requestAnimationFrame(() => titleRef.current?.focus());
  }
  function previewPlan(id: PlanId) {
    setSelectedPlan(id);
    navigate("demo", "My plan");
  }
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 5000);
    let current = true;
    async function readStatus() {
      setChecking(true);
      const options: RequestInit = {
        signal: controller.signal, credentials: "omit", cache: "no-store",
        headers: { Accept: "application/json" },
      };
      try {
        let response = await fetch("/api/v1/status", options);
        // Older preview servers only expose the fictional readiness endpoint.
        if (response.status === 404) response = await fetch("/api/v1/readiness", options);
        const value = await response.json();
        const description = describeReadiness(value, response.status);
        if (current) {
          setApiStatus(description);
          setInterestOpen(publicLaunchInterestOpen(value, response.status));
        }
      } catch {
        if (current) {
          setInterestOpen(false);
          setApiStatus("Service status is temporarily unavailable. You can browse the preview and try again later.");
        }
      } finally {
        window.clearTimeout(timer);
        if (current) setChecking(false);
      }
    }
    void readStatus();
    return () => {
      current = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [statusCheck]);

  return (
    <>
      <a
        href="#main"
        className="skip"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main")?.focus();
        }}
      >
        Skip to content
      </a>
      <header className="site-header">
        <div className="shell header-inner">
          <a
            className="brand"
            href="#explore"
            onClick={(event) => {
              event.preventDefault();
              navigate("explore");
            }}
            aria-label="Onesa Mobile home"
          >
            <Mark />
            <span>
              onesa<span className="brand-mobile">mobile</span>
            </span>
          </a>
          <nav aria-label="Main navigation">
            <a href="#how" onClick={() => setScreen("explore")}>
              How it works
            </a>
            <a href="#plans" onClick={() => setScreen("explore")}>
              Our idea
            </a>
            <a className="account-link" href="/account/">
              My account
            </a>
            <button
              className="button small light"
              onClick={() => navigate(screen === "demo" ? "explore" : "demo")}
            >
              {screen === "demo" ? "Explore Onesa" : "Try the demo"} <Arrow />
            </button>
          </nav>
        </div>
      </header>
      <div className="preview-bar">
        <div className="shell">
          <span className="status-dot" />
          {screen === "demo" ? "Customer demo" : "Development preview"}{" "}
          <span className="separator">·</span>{" "}
          {screen === "demo"
            ? "Fictional account. No mobile service is active."
            : "Plans and network access are proposed. No service is being sold."}
        </div>
      </div>
      <main id="main" tabIndex={-1}>
        {screen === "explore" ? (
          <>
            <section className="hero shell">
              <div className="hero-copy">
                <p className="eyebrow">Built around life in Zimbabwe</p>
                <h1 ref={titleRef} tabIndex={-1}>
                  Your world.
                  <br />
                  <em>Within reach.</em>
                </h1>
                <p className="lead">
                  A simpler mobile experience. One place for your plan, your
                  spending and your people.
                </p>
                <p className="hero-detail">
                  We’re preparing mobile service for Zimbabwe. The satellite
                  agreement is pending, and a launch date has yet to be set.
                </p>
                <div className="hero-actions">
                  {interestOpen ? (
                    <a className="button primary" href="/account/">Register your interest <Arrow /></a>
                  ) : (
                    <button className="button primary" onClick={() => navigate("demo")}>
                      Explore the app <Arrow />
                    </button>
                  )}
                  <a className="text-link" href="#how">
                    Understand the connection ↓
                  </a>
                </div>
                <div className="pasofi-intro">
                  <a className="pasofi-link" href={pasofi.url}>Visit Pasofi Wi-Fi <Arrow /></a>
                  <p>{pasofi.introduction} {pasofi.status}</p>
                </div>
              </div>
              <div className="hero-visual">
                <div className="orbit orbit-one" />
                <div className="orbit orbit-two" />
                <div className="orbit-caption">
                  Closer, wherever life takes you.
                </div>
                <div className="phone-preview">
                  <div className="spread">
                    <span className="mini-brand">
                      <Mark small /> My Onesa
                    </span>
                    <span className="pill">Preview</span>
                  </div>
                  <p className="greeting">Hello, explorer.</p>
                  <h2>A little more connected.</h2>
                  <Balance compact />
                  <div className="mini-row">
                    <span className="round-icon">
                      <Arrow />
                    </span>
                    <div>
                      <strong>Reach is on the roadmap</strong>
                      <span>Satellite access · partner pending</span>
                    </div>
                  </div>
                  <button
                    className="preview-link"
                    onClick={() => navigate("demo")}
                  >
                    Take a look inside <Arrow />
                  </button>
                </div>
                <span className="visual-label">
                  Illustrative app · no live account
                </span>
              </div>
            </section>
            <section id="how" className="connection-section">
              <div className="shell">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">A clear connection</p>
                    <h2>Three paths. Different possibilities.</h2>
                  </div>
                  <p>
                    See what connects your phone — and what each path needs.
                  </p>
                </div>
                <div
                  className="path-tabs"
                  role="group"
                  aria-label="Connectivity paths"
                >
                  {(Object.keys(paths) as PathId[]).map((id) => (
                    <button
                      key={id}
                      id={`path-${id}`}
                      aria-pressed={path === id}
                      aria-controls="connection-details"
                      onClick={() => setPath(id)}
                    >
                      {paths[id].name}
                    </button>
                  ))}
                </div>
                <div
                  className="connection-panel"
                  role="region"
                  id="connection-details"
                  aria-labelledby={`path-${path}`}
                >
                  <div>
                    <h3>{connection.title}</h3>
                    <p>{connection.description}</p>
                    <p className="connection-note">{connection.note}</p>
                    {path === "wifi" && <a className="pasofi-link" href={pasofi.url}>Visit Pasofi Wi-Fi <Arrow /></a>}
                  </div>
                  <ol className="route-steps">
                    {connection.steps.map((step, index) => (
                      <li key={step}>
                        <span className="step-number">0{index + 1}</span>
                        <strong>{step}</strong>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </section>
            <section id="plans" className="shell plans-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">The service we want to build</p>
                  <h2>Simple choices, shaped around you.</h2>
                </div>
                <p>
                  Concepts to explore. Prices and allowances will follow partner
                  agreements.
                </p>
              </div>
              <div className="plan-grid">
                {plans.map((item) => (
                  <article
                    className={`plan-card ${item.id === "reach" ? "featured" : ""}`}
                    key={item.id}
                  >
                    <div className="spread">
                      <p className="eyebrow">{item.eyebrow}</p>
                      <span className="plan-index">
                        0{plans.indexOf(item) + 1}
                      </span>
                    </div>
                    <h3>{item.name}</h3>
                    <p>{item.description}</p>
                    <ul>
                      {item.features.map((feature) => (
                        <li key={feature}>{feature}</li>
                      ))}
                    </ul>
                    <div className="plan-price">Pricing to be confirmed</div>
                    <button
                      className="button plan-button"
                      onClick={() => previewPlan(item.id)}
                    >
                      View concept <Arrow />
                    </button>
                  </article>
                ))}
              </div>
            </section>
            <section className="shell answers-section">
              <div>
                <p className="eyebrow">Before we go further</p>
                <h2>
                  Good questions.{' '}
                  <br />
                  Clear answers.
                </h2>
                <p className="muted">
                  We are developing the idea openly, with a practical path to
                  launch.
                </p>
              </div>
              <div className="answers">
                <details>
                  <summary>Can I buy or activate a SIM today?</summary>
                  <p>
                    No. This is a development preview. A host agreement, the
                    applicable licence and tested customer workflows are needed
                    before Onesa can offer service.
                    {interestOpen && <> You can <a href="/account/">record your interest in your account</a> for free.</>}
                  </p>
                </details>
                <details>
                  <summary>Will I need a Starlink dish?</summary>
                  <p>
                    Direct-to-cell service uses a compatible phone and an
                    eligible mobile subscription, without your own dish. With
                    Pasofi Wi-Fi, your phone joins a nearby community hotspot.
                    {" "}{pasofi.status}
                  </p>
                </details>
                <details>
                  <summary>
                    Will every phone and every app work by satellite?
                  </summary>
                  <p>
                    We cannot promise that. Eligibility depends on the provider,
                    exact device, software, territory and service. Messaging,
                    app data and native calls must be verified separately.
                  </p>
                </details>
                <details>
                  <summary>
                    Can family abroad pay for someone in Zimbabwe?
                  </summary>
                  <p>
                    That is part of the proposed Family & Farm experience. The
                    payer and the registered SIM user would have separate roles.
                    Payments and customer verification still require approved
                    integrations.
                  </p>
                </details>
              </div>
            </section>
            <section className="shell closing">
              <div>
                <p className="eyebrow">Start with the experience</p>
                <h2>See how simple mobile could feel.</h2>
              </div>
              <button
                className="button primary"
                onClick={() => navigate("demo")}
              >
                Open the demo <Arrow />
              </button>
            </section>
          </>
        ) : (
          <section className="shell workspace">
            <div className="workspace-heading">
              <div>
                <p className="eyebrow">My Onesa</p>
                <h1 ref={titleRef} tabIndex={-1}>
                  Your mobile, at a glance.
                </h1>
              </div>
              <span className="pill outlined">Fictional account</span>
            </div>
            <div className="workspace-grid">
              <nav className="workspace-nav" aria-label="Demo navigation">
                {(["Overview", "My plan", "Billing", "Help"] as DemoTab[]).map(
                  (tab, index) => (
                    <button
                      key={tab}
                      aria-current={demoTab === tab ? "page" : undefined}
                      onClick={() => setDemoTab(tab)}
                    >
                      <span aria-hidden="true">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      {tab}
                    </button>
                  ),
                )}
                <p>No live subscriber, SIM or payment is connected.</p>
              </nav>
              <div className="workspace-content">
                {demoTab === "Overview" && (
                  <>
                    <div className="overview-grid">
                      <article className="account-card">
                        <div className="spread">
                          <h2>Good to see you.</h2>
                          <span className="pill subtle">Demo line</span>
                        </div>
                        <p className="muted">
                          Explore your mobile account, without creating one.
                        </p>
                        <Balance />
                        <div className="spread plan-summary">
                          <span>
                            <small>Selected concept</small>
                            <strong>{plan.name}</strong>
                          </span>
                          <button
                            className="text-link"
                            onClick={() => setDemoTab("My plan")}
                          >
                            Explore plans <Arrow />
                          </button>
                        </div>
                      </article>
                      <article className="network-card">
                        <span className="network-symbol" aria-hidden="true">
                          <Arrow />
                        </span>
                        <p className="eyebrow">Network readiness</p>
                        <h2>Service availability</h2>
                        <dl>
                          <div>
                            <dt>Cellular service</dt>
                            <dd>Partner pending</dd>
                          </div>
                          <div>
                            <dt>Starlink Mobile</dt>
                            <dd>Unverified in Zimbabwe</dd>
                          </div>
                          <div>
                            <dt>Customer activation</dt>
                            <dd>Unavailable</dd>
                          </div>
                        </dl>
                        <button
                          className="text-link"
                          onClick={() => setDemoTab("Help")}
                        >
                          What needs to happen? <Arrow />
                        </button>
                      </article>
                    </div>
                    <article className="activity-card">
                      <div className="spread">
                        <h2>Your next steps</h2>
                        <span className="muted">Explore only</span>
                      </div>
                      <button
                        className="activity-row"
                        onClick={() => setDemoTab("My plan")}
                      >
                        <span className="round-icon">01</span>
                        <span>
                          <strong>Find the plan that fits your life</strong>
                          <small>Compare the three proposed concepts.</small>
                        </span>
                        <Arrow />
                      </button>
                      <button
                        className="activity-row"
                        onClick={() => setDemoTab("Billing")}
                      >
                        <span className="round-icon">02</span>
                        <span>
                          <strong>Understand how billing would work</strong>
                          <small>
                            Clear renewal, payment and invoice records.
                          </small>
                        </span>
                        <Arrow />
                      </button>
                    </article>
                  </>
                )}
                {demoTab === "My plan" && (
                  <article className="content-card">
                    <p className="eyebrow">Concept explorer</p>
                    <h2>What does your everyday look like?</h2>
                    <p className="muted">
                      Selection changes this preview only. It does not order or
                      activate a service.
                    </p>
                    <div
                      className="concept-options"
                      role="group"
                      aria-label="Select a proposed plan"
                    >
                      {plans.map((item) => (
                        <button
                          className={selectedPlan === item.id ? "selected" : ""}
                          aria-pressed={selectedPlan === item.id}
                          key={item.id}
                          onClick={() => setSelectedPlan(item.id)}
                        >
                          {item.name}
                        </button>
                      ))}
                    </div>
                    <div className="selected-plan">
                      <span className="pill subtle">Proposed</span>
                      <h3>{plan.name}</h3>
                      <p>{plan.description}</p>
                      <ul>
                        {plan.features.map((feature) => (
                          <li key={feature}>{feature}</li>
                        ))}
                      </ul>
                      <div className="notice">
                        Pricing and allowances are not yet set. The illustrative
                        balance in the demo is not an offer for this plan.
                      </div>
                    </div>
                  </article>
                )}
                {demoTab === "Billing" && (
                  <article className="content-card">
                    <p className="eyebrow">Your money, clearly</p>
                    <h2>A record for every payment.</h2>
                    <p className="muted">
                      The proposed service will show your charges, renewals and
                      invoices together. This preview has no real transactions.
                    </p>
                    <div className="billing-empty">
                      <span className="round-icon large">≡</span>
                      <h3>No invoices in this demo</h3>
                      <p>
                        You have not been charged. No payment method has been
                        collected.
                      </p>
                    </div>
                    <dl className="billing-details">
                      <div>
                        <dt>Mobile money and cards</dt>
                        <dd>Provider integration pending</dd>
                      </div>
                      <div>
                        <dt>Cash through an authorised agent</dt>
                        <dd>Reconciliation workflow planned</dd>
                      </div>
                      <div>
                        <dt>Family sponsorship</dt>
                        <dd>Separate payer and subscriber roles planned</dd>
                      </div>
                      <div>
                        <dt>Auto-renewal</dt>
                        <dd>Explicit opt-in planned</dd>
                      </div>
                    </dl>
                  </article>
                )}
                {demoTab === "Help" && (
                  <article className="content-card">
                    <p className="eyebrow">From idea to service</p>
                    <h2>What is ready — and what comes next.</h2>
                    <div className="readiness-list">
                      <div>
                        <span className="status-label built">Built</span>
                        <div>
                          <h3>Experience prototype</h3>
                          <p>
                            Explore sample plans and account screens using fictional
                            data.
                          </p>
                        </div>
                      </div>
                      <div>
                        <span className="status-label pending">Pending</span>
                        <div>
                          <h3>Network and regulatory agreements</h3>
                          <p>
                            Host operator, licence scope, SIM registration
                            responsibilities and satellite access.
                          </p>
                        </div>
                      </div>
                      <div>
                        <span className="status-label pending">Pending</span>
                        <div>
                          <h3>Real customer operations</h3>
                          <p>
                            Verified identity, provisioning, payments, invoices,
                            support and physical handset acceptance tests.
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="api-check">
                      <h3>Service availability</h3>
                      <p role="status" aria-live="polite">
                        {apiStatus}
                      </p>
                      <button
                        className="button light"
                        disabled={checking}
                        aria-busy={checking}
                        onClick={() => setStatusCheck(n => n + 1)}
                      >
                        {checking ? "Checking…" : "Check service status"}
                      </button>
                    </div>
                    <p className="muted">
                      Satellite attachment is controlled by the device and
                      network. This app does not switch on a satellite
                      connection or provide emergency calling.
                    </p>
                  </article>
                )}
              </div>
            </div>
          </section>
        )}
      </main>
      <footer>
        <div className="shell">
          <AppAvailability heading="Onesa Mobile apps" unpublished="Not published" />
        </div>
        <div className="shell footer-inner">
          <a
            className="brand"
            href="#explore"
            onClick={(event) => {
              event.preventDefault();
              navigate("explore");
            }}
          >
            <Mark small />
            <span>
              onesa<span className="brand-mobile">mobile</span>
            </span>
          </a>
          <p>
            A Zimbabwe-focused concept by Onesa.
            <br />
            Development preview · no affiliation with Starlink is claimed.
          </p>
          <a href="/internal/">Staff sign-in</a>
          <a
            href="https://github.com/DruHustle/onesa-mobile"
            target="_blank"
            rel="noreferrer"
          >
            Project repository <Arrow />
          </a>
        </div>
      </footer>
    </>
  );
}
