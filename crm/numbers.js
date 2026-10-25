// Business numbers (request, job, claim, spare request) come from the server
// (functions: issueNumber). If the server can't be reached — e.g. the
// functions are not published yet — the page's own counter is used, which
// draws from the same monthly sequence, so numbers never collide.
let callable = null;
export function useNumberServer(fn) { callable = fn; }
export async function serverNumber(kind, fallback, timeoutMs = 8000) {
  if (callable) {
    try {
      const r = await Promise.race([callable({ kind }), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs))]);
      const n = r && r.data && r.data.number;
      if (typeof n === 'string' && /^PE-[A-Z]{2,3}-\d{8}-\d{4,}-[A-Za-z]+$/.test(n)) return n;
    } catch (e) { console.warn('Number from server not available, using the page counter:', e && e.message); }
  }
  return fallback();
}
