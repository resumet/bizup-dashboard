// Loaded only by verify-invite-auth.mjs; never contact the real Supabase project.
const upstream = process.env.INVITE_TEST_SUPABASE_ORIGIN;
const fixture = process.env.INVITE_TEST_FIXTURE_ORIGIN;
if (!upstream || !fixture || new URL(fixture).hostname !== "127.0.0.1") {
  throw new Error("Invite auth test requires a local fixture server.");
}
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.origin !== upstream) return originalFetch(input, init);
  const replacement = new URL(url.pathname + url.search, fixture);
  return originalFetch(input instanceof Request ? new Request(replacement, input) : replacement, init);
};
