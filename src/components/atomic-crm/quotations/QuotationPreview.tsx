import { useConfigurationContext } from "../root/ConfigurationContext";
import {
  formatMoney,
  itemsTotal,
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
  const { title, lightModeLogo } = useConfigurationContext();
  const t = printLabels[quote.language];
  const total = itemsTotal(quote.items);
  const lang = quote.language;
  return (
    <div
      className="quote-print-area mx-auto w-full max-w-[800px] bg-white p-10 text-[13px] text-black shadow-sm"
      dir={lang === "ar" ? "rtl" : "ltr"}
    >
      <div className="flex items-start justify-between border-b pb-5">
        <div className="flex items-center gap-3">
          {lightModeLogo ? (
            <img src={lightModeLogo} alt={title} className="h-10" />
          ) : null}
          <span className="text-lg font-semibold">{title}</span>
        </div>
        <div className="text-end">
          <div className="text-2xl font-bold">{t.title}</div>
          <div className="text-gray-600">
            {t.number} {quote.number || "—"}
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
              <td className="whitespace-pre-wrap p-2">{item.description}</td>
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
