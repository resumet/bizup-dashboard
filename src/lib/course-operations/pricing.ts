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

