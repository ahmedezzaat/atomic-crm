import { getSupabaseClient } from "../providers/supabase/supabase";

export type EnrichSummary = {
  enriched: number;
  emails: number;
  phones: number;
  results: { id: number; status: string }[];
};

/** Looks for emails, extra numbers and social links on the companies' websites. */
export const enrichCompanies = async (ids: number[]) => {
  const { data, error } =
    await getSupabaseClient().functions.invoke<EnrichSummary>(
      "company_enrich",
      { method: "POST", body: { company_ids: ids } },
    );
  if (error || !data) {
    const detail = await (error as any)?.context?.json?.().catch(() => null);
    throw new Error(detail?.message ?? error?.message ?? "Request failed");
  }
  return data;
};
