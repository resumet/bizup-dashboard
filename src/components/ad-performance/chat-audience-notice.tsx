export function ChatAudienceNotice({ message }: { message?: string | null }) {
  return message ? <p role="status" className="my-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{message}</p> : null;
}
