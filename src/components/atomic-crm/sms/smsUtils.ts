export type SmsStatus = "draft" | "scheduled" | "sending" | "sent" | "failed";

export type SmsAudience = {
  city?: string;
  sector?: string;
  competitor?: string;
  size?: string;
  company_id?: string;
};

export type SmsCampaign = {
  id: number;
  name: string;
  sender_id: string;
  message: string;
  audience: SmsAudience;
  schedule_at: string | null;
  status: SmsStatus;
  recipients: number;
  error: string | null;
  created_at: string;
  nb_messages?: number;
  nb_sent?: number;
  nb_delivered?: number;
  nb_failed?: number;
};

export type SmsMessage = {
  id: number;
  phone: string;
  status: "pending" | "sent" | "delivered" | "undelivered" | "failed";
  error: string | null;
};

export const ANY = "__all";

// GSM-7 messages hold 160 characters (153 when split in parts); anything
// outside basic ASCII, such as Arabic, switches to UCS-2: 70 (67 when split).
export const measureSms = (message: string) => {
  const unicode = [...message].some((ch) => ch.charCodeAt(0) > 127);
  const length = [...message].length;
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  const segments =
    length === 0 ? 0 : length <= single ? 1 : Math.ceil(length / multi);
  return {
    length,
    unicode,
    segments,
    perSegment: segments > 1 ? multi : single,
  };
};

export const fillPlaceholders = (
  message: string,
  values: { name: string; city: string },
) =>
  message
    .replace(/\{\{\s*name\s*\}\}/gi, values.name)
    .replace(/\{\{\s*city\s*\}\}/gi, values.city);

export const statusLabel: Record<SmsStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  sending: "Sending…",
  sent: "Sent",
  failed: "Failed",
};
