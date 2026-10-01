const GOOGLE_ACCOUNT_CHOOSER_URL = "https://accounts.google.com/AccountChooser";
const GMAIL_COMPOSE_URL = "https://mail.google.com/mail/";

export function buildGmailComposeWithAccountChooser(recipient: string) {
  const composeUrl = new URL(GMAIL_COMPOSE_URL);
  composeUrl.search = new URLSearchParams({
    view: "cm",
    fs: "1",
    tf: "1",
    to: recipient.trim(),
  }).toString();

  const accountChooserUrl = new URL(GOOGLE_ACCOUNT_CHOOSER_URL);
  accountChooserUrl.search = new URLSearchParams({
    service: "mail",
    continue: composeUrl.toString(),
  }).toString();

  return accountChooserUrl.toString();
}
