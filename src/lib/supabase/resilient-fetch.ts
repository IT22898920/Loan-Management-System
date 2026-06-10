// Resilient fetch for Supabase — retries transient network failures so a single
// dropped connection (flaky mobile data / VPN) doesn't crash a page render.
// Only retries on network-level throws and transient gateway statuses; normal
// 4xx/5xx app responses pass straight through (retrying those is pointless).

const MAX_RETRIES = 2; // => up to 3 attempts total
const BACKOFF_MS = [400, 1000];
const ATTEMPT_TIMEOUT_MS = 15000;

function isTransientStatus(status: number): boolean {
  return status === 408 || status === 502 || status === 503 || status === 504;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Only retry SAFE/idempotent methods. Retrying a POST/PATCH/DELETE whose
// response was lost (but which committed server-side) would silently
// duplicate a write — e.g. a phantom second payment. Reads (GET/HEAD/OPTIONS)
// are safe to repeat.
function isIdempotent(input: RequestInfo | URL, init?: RequestInit): boolean {
  let method = init?.method;
  if (!method && typeof input === 'object' && 'method' in input) method = (input as Request).method;
  const m = (method || 'GET').toUpperCase();
  return m === 'GET' || m === 'HEAD' || m === 'OPTIONS';
}

export const resilientFetch: typeof fetch = async (input, init) => {
  let lastError: unknown;
  const retryable = isIdempotent(input, init);
  const maxRetries = retryable ? MAX_RETRIES : 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);

    // Honour a caller-supplied abort signal (e.g. React cancelling a request)
    const callerSignal = init?.signal ?? undefined;
    if (callerSignal) {
      if (callerSignal.aborted) controller.abort();
      else callerSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    try {
      const res = await fetch(input, { ...init, signal: controller.signal });
      clearTimeout(timer);

      if (isTransientStatus(res.status) && attempt < maxRetries) {
        await delay(BACKOFF_MS[attempt] ?? 1000);
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;

      // If the caller intentionally aborted, don't retry — propagate.
      if (callerSignal?.aborted) throw err;

      if (attempt < maxRetries) {
        await delay(BACKOFF_MS[attempt] ?? 1000);
        continue;
      }
    }
  }

  throw lastError;
};
