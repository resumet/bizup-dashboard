export function calculateDiscountRate(
  listPriceValue: string | number,
  salePriceValue: string | number,
) {
  const listPrice = Number(String(listPriceValue).replace(/\D/gu, ""));
  const salePrice = Number(String(salePriceValue).replace(/\D/gu, ""));

  if (!Number.isFinite(listPrice) || listPrice <= 0) return null;
  if (!Number.isFinite(salePrice) || salePrice < 0 || salePrice > listPrice) {
    return null;
  }

  return Math.round((1 - salePrice / listPrice) * 1_000) / 10;
}

function enteredPrice(value: string | number) {
  const normalized = String(value).replace(/\D/gu, "");
  if (!normalized) return null;
  const amount = Number(normalized);
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
}

export function calculateEarlyBirdDiscountAmount(
  listPriceValue: string | number,
  salePriceValue: string | number,
) {
  const listPrice = enteredPrice(listPriceValue);
  const salePrice = enteredPrice(salePriceValue);
  if (listPrice === null || salePrice === null || salePrice > listPrice) {
    return null;
  }
  return listPrice - salePrice;
}

export function calculateTwelveMonthInstallment(
  listPriceValue: string | number,
  salePriceValue: string | number,
) {
  const listPrice = enteredPrice(listPriceValue);
  const salePrice = enteredPrice(salePriceValue);
  if (listPrice === null || salePrice === null || salePrice > listPrice) {
    return null;
  }
  return Math.round(salePrice / 12 / 100) * 100;
}
