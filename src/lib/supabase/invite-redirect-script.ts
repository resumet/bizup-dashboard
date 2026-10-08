// Run before hydration: a server-rendered login redirect must not discard the
// default invite's fragment. Only invitation sessions and Auth errors are handled.
// Keep this script static; never interpolate tokens or other request data into it.
export const inviteRedirectScript = `(() => {
  if (window.location.pathname === "/auth/callback") return;
  const hash = window.location.hash;
  const params = new URLSearchParams(hash.slice(1));
  const hasError = ["error", "error_code", "error_description"].some((key) => params.has(key));
  if (hasError || (params.get("type") === "invite" && hash.length > 32768)) {
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    window.location.replace("/auth/invite-error?reason=invalid");
  } else if (params.get("type") === "invite") {
    window.location.replace("/auth/callback" + hash);
  }
})();`;
