export const ALL_CONTACTS_BOOK_NAME = "전체 명단";

export function isProtectedAddressBook(book: { name: string }) {
  return book.name.trim() === ALL_CONTACTS_BOOK_NAME;
}

export function pinProtectedAddressBook<T extends { name: string }>(books: readonly T[]): T[] {
  return [...books].sort((a, b) => Number(isProtectedAddressBook(b)) - Number(isProtectedAddressBook(a)));
}
