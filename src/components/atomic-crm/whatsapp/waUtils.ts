export type WaStatus = "draft" | "active" | "done";

export type WaAudience = {
  lead_source?: string;
  tag?: string;
  city?: string;
  country?: string;
  competitor?: string;
  new_only?: boolean;
};

export type WaCampaign = {
  id: number;
  name: string;
  template_name: string;
  template_language: string;
  with_name: boolean;
  audience: WaAudience;
  daily_cap: number;
  auto_daily: boolean;
  send_hour: number;
  status: WaStatus;
  error: string | null;
  nb_messages?: number;
  nb_sent?: number;
  nb_delivered?: number;
  nb_read?: number;
  nb_replied?: number;
  nb_failed?: number;
};

export const waStatusLabel: Record<WaStatus, string> = {
  draft: "Draft",
  active: "Running",
  done: "Finished",
};
