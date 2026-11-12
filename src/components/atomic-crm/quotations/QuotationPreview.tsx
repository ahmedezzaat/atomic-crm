import logo from "./kords-logo.png";
import {
  computeTotals,
  formatMoney,
  printLabels,
  type Quotation,
} from "./quoteUtils";

// The printable page. "Print / PDF" prints only this block.
export const QuotationPreview = ({
  quote,
  companyName,
  contactName,
}: {
  quote: Omit<Quotation, "id" | "created_at" | "sales_id">;
  companyName: string;
  contactName?: string;
}) => {
  const t = printLabels[quote.language];
  const { subtotal, discount, total } = computeTotals(
    quote.items,
    quote.discount_type,
    quote.discount_value,
  );
  const lang = quote.language;
  return (
    <div
      className="quote-print-area mx-auto min-h-[297mm] w-[210mm] bg-white p-[14mm] text-[13px] text-black shadow-sm"
      dir={lang === "ar" ? "rtl" : "ltr"}
    >
      <div className="flex items-start justify-between border-b pb-5">
        <div>
          <img src={logo} alt="Kords" className="h-12" />
          <div className="mt-1 text-sm font-medium text-gray-800">
            Real Estate Operating System
          </div>
          <div className="text-gray-600">{t.address}</div>
          <div className="text-gray-600" dir="ltr">
            info@kords.ai
          </div>
        </div>
        <div className="text-end">
          <div className="text-2xl font-bold">{t.title}</div>
          <div className="text-gray-600">
            {t.number} {quote.number || (lang === "ar" ? "تلقائي" : "Auto")}
          </div>
        </div>
      </div>

      <div className="mt-5 flex justify-between gap-6">
        <div>
          <div className="text-xs uppercase text-gray-500">{t.to}</div>
          <div className="text-base font-semibold">{companyName || "—"}</div>
          {contactName ? (
            <div className="text-gray-600">
              {t.attn}: {contactName}
            </div>
          ) : null}
        </div>
        <div className="text-end text-gray-700">
          <div>
            {t.date}: {quote.issue_date}
          </div>
          {quote.valid_until ? (
            <div>
              {t.validUntil}: {quote.valid_until}
            </div>
          ) : null}
        </div>
      </div>

      <table className="mt-6 w-full border-collapse">
        <thead>
          <tr className="bg-gray-100 text-start">
            <th className="p-2 text-start">{t.description}</th>
            <th className="p-2 text-end">{t.qty}</th>
            <th className="p-2 text-end">{t.price}</th>
            <th className="p-2 text-end">{t.amount}</th>
          </tr>
        </thead>
        <tbody>
          {quote.items.map((item, i) => (
            <tr key={i} className="border-b align-top">
              <td className="whitespace-pre-wrap p-2">
                <span className="font-bold">
                  {item.description.split("\n")[0]}
                </span>
                {item.description.includes("\n")
                  ? `\n${item.description.split("\n").slice(1).join("\n")}`
                  : ""}
                {item.period ? (
                  <div className="text-xs text-gray-500">
                    {t.periods[item.period]}
                  </div>
                ) : null}
              </td>
              <td className="p-2 text-end">{item.quantity}</td>
              <td className="p-2 text-end">
                {formatMoney(
                  Number(item.unit_price) || 0,
                  quote.currency,
                  lang,
                )}
              </td>
              <td className="p-2 text-end">
                {formatMoney(
                  (Number(item.quantity) || 0) * (Number(item.unit_price) || 0),
                  quote.currency,
                  lang,
                )}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          {discount > 0 ? (
            <>
              <tr>
                <td colSpan={3} className="p-2 pt-4 text-end">
                  {t.subtotal}
                </td>
                <td className="p-2 pt-4 text-end">
                  {formatMoney(subtotal, quote.currency, lang)}
                </td>
              </tr>
              <tr>
                <td colSpan={3} className="p-2 text-end">
                  {t.discount}
                  {quote.discount_type === "percent"
                    ? ` (${quote.discount_value}%)`
                    : ""}
                  {quote.discount_note ? (
                    <div className="text-xs text-gray-500">
                      {quote.discount_note}
                    </div>
                  ) : null}
                </td>
                <td className="p-2 text-end">
                  - {formatMoney(discount, quote.currency, lang)}
                </td>
              </tr>
            </>
          ) : null}
          <tr>
            <td colSpan={3} className="p-2 pt-4 text-end font-semibold">
              {t.total}
            </td>
            <td className="p-2 pt-4 text-end text-base font-bold">
              {formatMoney(total, quote.currency, lang)}
            </td>
          </tr>
        </tfoot>
      </table>

      {quote.notes ? (
        <div className="mt-6">
          <div className="font-semibold">{t.notes}</div>
          <div className="whitespace-pre-wrap text-gray-700">{quote.notes}</div>
        </div>
      ) : null}
      {quote.terms ? (
        <div className="mt-4">
          <div className="font-semibold">{t.terms}</div>
          <div className="whitespace-pre-wrap text-gray-700">{quote.terms}</div>
        </div>
      ) : null}
    </div>
  );
};
