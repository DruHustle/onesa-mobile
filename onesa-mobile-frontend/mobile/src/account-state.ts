import type { Account, Credential, Item } from './api';

export interface SessionDiscovery {
  mode: 'lab' | 'production';
  authMode: 'lab' | 'onesa';
  ssoAvailable: boolean;
}

export function isPublicAccountApi(base: string | null, development = false): boolean {
  if (!base || !development) return true;
  const {hostname} = new URL(base);
  return !["localhost", "127.0.0.1", "[::1]", "10.0.2.2"].includes(hostname) && !/\.(test|invalid)$/.test(hostname);
}

export function isSessionDiscovery(value: unknown, productionRequired = false): value is SessionDiscovery {
  const data = value as SessionDiscovery | null;
  return !!data && ['lab', 'production'].includes(data.mode) &&
    data.authMode === (data.mode === 'lab' ? 'lab' : 'onesa') &&
    (!productionRequired || data.mode === 'production') && typeof data.ssoAvailable === 'boolean';
}

/** Validate the account before it becomes an actionable or persisted snapshot. */
export function isAccountSnapshot(value: unknown, subject: string): value is Account {
  const data = value as Account | null;
  return !!data && data.profile?.subject === subject &&
    typeof data.profile.displayName === 'string' &&
    [data.applications, data.tickets, data.ledger, data.requests].every(rows =>
      Array.isArray(rows) && rows.every(item => typeof item?.id === 'string' &&
        Number.isInteger(item.revision) && item.revision > 0)) &&
    !!data.network && typeof data.network.state === 'string' &&
    !!data.status && ['lab', 'production'].includes(data.status.mode);
}

export function sessionRemainingMs(value: Credential | null, now = Date.now()): number {
  const expiry = value?.user?.expiresAt;
  return typeof expiry === 'number' && Number.isFinite(expiry)
    ? Math.max(0, expiry * 1000 - now)
    : 0;
}

export function canEditPilotApplication(account: Account | null, application: Item | undefined, credential: Credential | null): boolean {
  return !!account && account.status.mode === 'lab' && credential?.user.role === 'customer' &&
    (!application || ['review_required', 'information_required', 'declined'].includes(String(application.state)));
}

export function launchInterestChange(account: Account | null, credential: Credential | null) {
  if (!account || credential?.user.role !== 'customer' ||
      credential.user.subject !== account.profile.subject ||
      account.status.capabilities?.launchInterest !== true) return null;
  const record = account.launchInterest;
  if (record === null) return { interested: true, revision: 0 };
  if (!record || !['registered', 'withdrawn'].includes(record.state) ||
      !Number.isSafeInteger(record.revision) || record.revision < 1 ||
      typeof record.updatedAt !== 'string' || !Number.isFinite(Date.parse(record.updatedAt))) return null;
  return { interested: record.state === 'withdrawn', revision: record.revision };
}

/** Session identity and freshness are separate: an old response from the same
 * account must not overwrite a newer refresh or make failed reads actionable. */
export class AccountReadTracker {
  private version = 0;
  private confirmed = false;

  get isFresh(): boolean { return this.confirmed; }

  invalidate(): void {
    this.version++;
    this.confirmed = false;
  }

  begin() {
    const version = ++this.version;
    this.confirmed = false;
    const isCurrent = () => version === this.version;
    return {
      isCurrent,
      accept: () => { if (isCurrent()) this.confirmed = true; },
      fail: () => { if (isCurrent()) this.confirmed = false; },
    };
  }
}
