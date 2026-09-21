const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const formatCurrency = (amountCents) =>
  currencyFormatter.format((Number(amountCents) || 0) / 100);

export default formatCurrency;
