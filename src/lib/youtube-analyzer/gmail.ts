const GOOGLE_ACCOUNT_CHOOSER_URL = "https://accounts.google.com/AccountChooser";
const GMAIL_COMPOSE_URL = "https://mail.google.com/mail/";

type GmailDraft = {
  body?: string | null;
  signatureMode?: "gmail_default" | "custom";
  customSignature?: string | null;
};

export function buildGmailMessage({ body, signatureMode = "gmail_default", customSignature }: GmailDraft = {}) {
  const message = body?.trim() ? body : "";
  if (signatureMode !== "custom" || !customSignature?.trim()) return message;
  return message ? `${message}\n\n${customSignature}` : customSignature;
}

export function buildGmailComposeWithAccountChooser(recipient: string, draft: GmailDraft = {}) {
  const message = buildGmailMessage(draft);
  const composeParams: Record<string,string> = {
    view: "cm",
    fs: "1",
    tf: "1",
    to: recipient.trim(),
  };
  if (message) composeParams.body = message;
  const composeUrl = new URL(GMAIL_COMPOSE_URL);
  composeUrl.search = new URLSearchParams(composeParams).toString();

  const accountChooserUrl = new URL(GOOGLE_ACCOUNT_CHOOSER_URL);
  accountChooserUrl.search = new URLSearchParams({
    service: "mail",
    continue: composeUrl.toString(),
  }).toString();

  return accountChooserUrl.toString();
}
