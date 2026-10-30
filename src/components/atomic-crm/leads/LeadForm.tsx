import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { getSupabaseClient } from "../providers/supabase/supabase";

/** Public "Request a demo" page: no login, creates a lead in the CRM. */
export const LeadForm = () => {
  const [values, setValues] = useState({
    name: "",
    contact_name: "",
    phone: "",
    email: "",
    city: "",
    message: "",
    hp: "",
  });
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const set = (key: keyof typeof values, value: string) =>
    setValues((v) => ({ ...v, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error: fnError } = await getSupabaseClient().functions.invoke(
      "lead_capture",
      { method: "POST", body: { ...values, whatsapp_opt_in: consent } },
    );
    if (fnError) {
      const detail = await (fnError as any).context?.json?.().catch(() => null);
      setError(detail?.message ?? "Something went wrong, please try again.");
    } else {
      setDone(true);
    }
    setBusy(false);
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center p-4">
      <Card>
        <CardContent className="py-6">
          {done ? (
            <div
              className="flex flex-col items-center gap-2 py-8 text-center"
              dir="auto"
            >
              <h1 className="text-2xl font-semibold">Thank you!</h1>
              <p className="text-muted-foreground">
                We received your request and will contact you shortly.
              </p>
            </div>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-4">
              <div>
                <h1 className="text-2xl font-semibold">Request a demo</h1>
                <p className="text-sm text-muted-foreground">
                  Tell us a little about your company and we will get back to
                  you.
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="lead-name">Company name *</Label>
                <Input
                  id="lead-name"
                  required
                  dir="auto"
                  value={values.name}
                  onChange={(e) => set("name", e.target.value)}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="lead-contact">Your name</Label>
                  <Input
                    id="lead-contact"
                    dir="auto"
                    value={values.contact_name}
                    onChange={(e) => set("contact_name", e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="lead-phone">WhatsApp / phone number *</Label>
                  <Input
                    id="lead-phone"
                    required
                    type="tel"
                    dir="ltr"
                    placeholder="01xxxxxxxxx"
                    value={values.phone}
                    onChange={(e) => set("phone", e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="lead-email">Email</Label>
                  <Input
                    id="lead-email"
                    type="email"
                    dir="ltr"
                    value={values.email}
                    onChange={(e) => set("email", e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="lead-city">City</Label>
                  <Input
                    id="lead-city"
                    dir="auto"
                    value={values.city}
                    onChange={(e) => set("city", e.target.value)}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="lead-message">How can we help?</Label>
                <Textarea
                  id="lead-message"
                  rows={3}
                  dir="auto"
                  value={values.message}
                  onChange={(e) => set("message", e.target.value)}
                />
              </div>
              {/* Hidden field: real people never fill it, bots do */}
              <input
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="absolute -left-[9999px] h-0 w-0 opacity-0"
                value={values.hp}
                onChange={(e) => set("hp", e.target.value)}
              />
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                <span>
                  I agree to be contacted on WhatsApp about this request. I can
                  reply STOP at any time.
                </span>
              </label>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={busy}>
                {busy ? "Sending…" : "Send request"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default LeadForm;
