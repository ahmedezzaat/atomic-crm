export type QuoteStatus = "draft" | "sent" | "accepted" | "rejected";

export type Period = "monthly" | "quarterly" | "biannual" | "annual";

export type QuoteItem = {
  description: string;
  quantity: number;
  unit_price: number;
  product_id?: number;
  period?: Period;
};

export type Quotation = {
  id: number;
  number: string;
  company_id: number;
  contact_id: number | null;
  sales_id: number | null;
  status: QuoteStatus;
  issue_date: string;
  valid_until: string | null;
  currency: string;
  language: "en" | "ar";
  items: QuoteItem[];
  total: number;
  discount_type: "amount" | "percent";
  discount_value: number;
  discount_note: string;
  notes: string;
  terms: string;
  created_at: string;
};

export type Product = {
  id: number;
  name: string;
  description: string;
  price_monthly: number;
  price_quarterly: number;
  price_biannual: number;
  price_annual: number;
  active: boolean;
};

export const periodLabel: Record<Period, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  biannual: "Bi-annual",
  annual: "Annual",
};

export const periodPrice = (p: Product, period: Period) =>
  Number(
    period === "monthly"
      ? p.price_monthly
      : period === "quarterly"
        ? p.price_quarterly
        : period === "biannual"
          ? p.price_biannual
          : p.price_annual,
  );

export const quoteStatusLabel: Record<QuoteStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  rejected: "Rejected",
};

export const CURRENCIES = ["EGP", "USD", "SAR", "AED", "EUR"];

export const itemsTotal = (items: QuoteItem[]) =>
  items.reduce(
    (sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0),
    0,
  );

export const computeTotals = (
  items: QuoteItem[],
  discountType: "amount" | "percent",
  discountValue: number,
) => {
  const subtotal = itemsTotal(items);
  const raw =
    discountType === "percent"
      ? (subtotal * (Number(discountValue) || 0)) / 100
      : Number(discountValue) || 0;
  const discount = Math.min(Math.max(raw, 0), subtotal);
  return { subtotal, discount, total: subtotal - discount };
};

export const formatMoney = (value: number, currency: string, _lang = "en") =>
  `${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)} ${currency}`;

// Wording on the printed page
export const printLabels = {
  en: {
    title: "Quotation",
    number: "No.",
    date: "Date",
    validUntil: "Valid until",
    to: "Quotation for",
    attn: "Attention",
    description: "Description",
    qty: "Users",
    price: "Unit price",
    amount: "Amount",
    subtotal: "Subtotal",
    discount: "Discount",
    total: "Total",
    periods: {
      monthly: "Monthly",
      quarterly: "Quarterly",
      biannual: "Bi-annual",
    },
    address: "Nasr City, Cairo, Egypt",
    notes: "Notes",
    terms: "Terms & conditions",
  },
  ar: {
    title: "عرض سعر",
    number: "رقم",
    date: "التاريخ",
    validUntil: "صالح حتى",
    to: "مقدم إلى",
    attn: "عناية",
    description: "البيان",
    qty: "عدد المستخدمين",
    price: "سعر الوحدة",
    amount: "الإجمالي",
    subtotal: "المجموع",
    discount: "الخصم",
    total: "الإجمالي الكلي",
    periods: {
      monthly: "شهري",
      quarterly: "ربع سنوي",
      biannual: "نصف سنوي",
      annual: "سنوي",
    },
    address: "مدينة نصر، القاهرة، مصر",
    notes: "ملاحظات",
    terms: "الشروط والأحكام",
  },
} as const;
