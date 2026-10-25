export const formatMoney = (
  value: number | string | null | undefined,
  currency: string,
) =>
  Number(value ?? 0).toLocaleString("en-US", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 0,
  });
