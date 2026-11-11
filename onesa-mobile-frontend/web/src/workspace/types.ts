export type Surface = 'customer' | 'staff';
export type Role = 'admin' | 'operations' | 'support' | 'finance' | 'agent' | 'auditor' | 'customer';
export type Collection = 'sites' | 'assets' | 'trials' | 'gates' | 'launchInterests' | 'applications' | 'tickets' | 'ledger' | 'requests' | 'billingAccounts' | 'audit';
export interface User {
  subject: string; displayName: string; role: Role; source: 'lab' | 'onesa';
  mfa: boolean; authenticatedAt: number; expiresAt: number;
}
export interface Session {
  authenticated: boolean; mode: 'lab' | 'production'; authMode: 'lab' | 'onesa';
  ssoAvailable: boolean; user: User | null; csrfToken: string | null;
}
export interface Item {
  id: string; kind: string; owner: string; revision: number; createdAt: string; updatedAt: string;
  [key: string]: unknown;
}
export interface ServiceStatus {
  mode: 'lab' | 'production'; serviceStatus: string; productionReady: boolean;
  networkConnected: boolean; commercialSalesEnabled: boolean; updatedAt: string;
  capabilities: Record<string, boolean>;
}
export interface Readiness {
  commercialServiceEnabled: boolean; automaticNetworkActivation: boolean;
  providerIntegrations: string; notice: string;
  gates: { key: string; label: string; currentEvidence: number }[];
}
export interface LaunchInterest extends Item {
  state: 'registered' | 'withdrawn';
}
export interface CustomerData {
  launchInterest?: LaunchInterest | null;
  profile: { subject: string; displayName: string };
  applications: Item[]; tickets: Item[]; ledger: Item[]; requests: Item[];
  pageLimit: number; counts: Record<string, number>; cursors: Partial<Record<Collection, string | null>>;
  network: { state: string; source: string; usage: unknown; lastMeasuredAt: string | null };
  status: ServiceStatus;
}
export interface StaffData {
  launchInterests?: LaunchInterest[];
  permissions: string[]; status: ServiceStatus; readiness: Readiness | null;
  sites: Item[]; assets: Item[]; trials: Item[]; gates: Item[];
  applications: Item[]; tickets: Item[]; requests: Item[]; ledger: Item[];
  billingAccounts: { id: string; displayName: string }[];
  audit: { sequence: number; id: string; actor: string; role: string; action: string; target: string; at: string; hash: string; previousHash: string }[];
  auditIntegrity: boolean | null; pageLimit: number; counts: Record<string, number>; cursors: Partial<Record<Collection, string | null>>;
}
export type Mutation = (path: string, input: Record<string, unknown>, method?: 'POST' | 'PATCH', success?: string) => Promise<Item>;
export interface WorkspaceContext {
  user: User; mode: 'lab' | 'production'; pending: boolean; mutate: Mutation;
  download: (path: string, name: string) => Promise<void>;
}
