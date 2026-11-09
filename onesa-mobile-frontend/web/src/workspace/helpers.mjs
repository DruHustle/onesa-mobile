/** Integer minor units avoid floating-point rounding at the input boundary. */
export function usdMinor(value) {
  const text = String(value).trim();
  if (!/^\d{1,6}(?:\.\d{1,2})?$/.test(text)) throw new Error('Enter a USD amount with no more than two decimal places.');
  const [whole, fraction = ''] = text.split('.');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (result < 1 || result > 10000000) throw new Error('The test amount must be between USD 0.01 and USD 100,000.00.');
  return result;
}
export function makeRetryKeys(createKey = () => crypto.randomUUID()) {
  const attempts = new Map();
  return {
    get(operation, input) {
      const fingerprint = operation + '\n' + JSON.stringify(input);
      if (!attempts.has(fingerprint)) attempts.set(fingerprint, createKey());
      return { fingerprint, key: attempts.get(fingerprint) };
    },
    confirmed(fingerprint) { attempts.delete(fingerprint); },
    clear() { attempts.clear(); },
  };
}
const stateCopy = {
  review_required: ['Review required', 'The team will review your pilot application. No mobile line has been activated.'],
  information_required: ['Information needed', 'Read the review note, update your application, and send it back to the team.'],
  awaiting_host: ['Awaiting host operator', 'The pilot review is recorded. Activation still needs the contracted host operator.'],
  declined: ['Application closed', 'Read the review note. You can contact support or submit a new pilot application.'],
};
export function applicationState(state) {
  return stateCopy[state] ?? ['Not submitted', 'Complete your pilot application to begin the review.'];
}
export function stateTone(value) {
  if (['pass', 'commissioned', 'resolved', 'accepted'].includes(value)) return 'confirmed';
  if (['fail', 'faulty', 'declined', 'rejected', 'revoked'].includes(value)) return 'error';
  if (['review_required', 'information_required', 'awaiting_host', 'in_review', 'in_progress', 'open', 'received'].includes(value)) return 'pending';
  return 'neutral';
}
export function humanize(value) {
  return String(value ?? 'Not recorded').replaceAll('_', ' ').replace(/^./, (s) => s.toUpperCase());
}
/** Cursor pages may overlap if records move while the user works. Never duplicate
 * a row or replace a newer local revision with an older page result. */
export function mergeRecordPage(existing, incoming) {
  const rows = new Map(existing.map(item => [item.id, item]));
  for (const item of incoming) {
    const previous = rows.get(item.id);
    if (!previous || Number(item.revision ?? 0) >= Number(previous.revision ?? 0)) rows.set(item.id, item);
  }
  return [...rows.values()];
}

/** A private download belongs to the session that requested it. Aborting the
 * request is not enough: a response or Blob conversion may already be queued. */
export function createSessionDownloadScope() {
  let epoch = 0;
  const controllers = new Set();
  return {
    invalidate() {
      epoch++;
      for (const controller of controllers) controller.abort();
      controllers.clear();
    },
    /**
     * @param {(signal: AbortSignal) => Promise<{blob: () => Promise<Blob>}>} read
     * @param {(blob: Blob) => void} deliver
     * @param {(error: unknown) => void} onError
     */
    async run(read, deliver, onError = () => {}) {
      const started = epoch, controller = new AbortController();
      const current = () => started === epoch && !controller.signal.aborted;
      controllers.add(controller);
      try {
        const response = await read(controller.signal);
        if (!current()) return false;
        const blob = await response.blob();
        if (!current()) return false;
        // Delivery is synchronous: no session transition can interleave between
        // this check and the browser download / success notification.
        deliver(blob);
        return true;
      } catch (error) {
        // An obsolete 401 must not sign out a subsequently authenticated user.
        if (!current()) return false;
        // Handle session-wide errors in the guarded turn, before a caller's
        // later Promise continuation could belong to a different session.
        onError(error);
        if (!current()) return false;
        throw error;
      } finally {
        controllers.delete(controller);
      }
    },
  };
}
