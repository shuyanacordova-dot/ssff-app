export const paymentMethods = [
  { value: "efectivo", label: "Efectivo" },
  { value: "transferencia", label: "Transferencia" },
  { value: "tarjeta", label: "Tarjeta de crédito" },
  { value: "otro", label: "Otro" },
] as const;

export const paymentMethodLabels: Record<string, string> = {
  ...Object.fromEntries(paymentMethods.map(({ value, label }) => [value, label])),
  credito: "Crédito",
};
