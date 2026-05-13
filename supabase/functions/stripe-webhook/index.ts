// Stripe webhook handler. Optional but recommended.
// Configure in Stripe dashboard → Developers → Webhooks, endpoint:
//   https://<project>.supabase.co/functions/v1/stripe-webhook
// Events: checkout.session.completed, customer.subscription.updated,
//         customer.subscription.deleted
// Then add the signing secret as STRIPE_WEBHOOK_SECRET in Cloud secrets.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const PRICE_TO_PLAN: Record<string, "creator" | "studio" | "lifetime"> = {
  price_1TWgZ9Fjlt1yiQGFO4VizMuB: "creator",
  price_1TWgZfFjlt1yiQGF79uXnZfu: "creator",
  price_1TWgaIFjlt1yiQGFAz7qALSH: "studio",
  price_1TWgcFFjlt1yiQGFYYHKXgGJ: "studio",
  price_1TWgcWFjlt1yiQGFRJvY2hMV: "lifetime",
};

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2025-08-27.basil",
});
const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } },
);

async function findUserId(opts: {
  metadataUserId?: string | null;
  customerId?: string | null;
  email?: string | null;
}): Promise<string | null> {
  if (opts.metadataUserId) return opts.metadataUserId;
  if (opts.customerId) {
    const { data } = await admin
      .from("profiles")
      .select("id")
      .eq("stripe_customer_id", opts.customerId)
      .maybeSingle();
    if (data?.id) return data.id;
  }
  if (opts.email) {
    const { data } = await admin
      .from("profiles")
      .select("id")
      .eq("email", opts.email)
      .maybeSingle();
    if (data?.id) return data.id;
  }
  return null;
}

serve(async (req) => {
  const sig = req.headers.get("stripe-signature");
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!sig || !secret) {
    return new Response("Webhook not configured", { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const body = await req.text();
    event = await stripe.webhooks.constructEventAsync(body, sig, secret);
  } catch (err) {
    console.error("[stripe-webhook] signature verification failed", err);
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        const customerId = typeof s.customer === "string" ? s.customer : s.customer?.id ?? null;
        const userId = await findUserId({
          metadataUserId: s.metadata?.user_id,
          customerId,
          email: s.customer_details?.email ?? s.customer_email,
        });
        if (!userId) { console.warn("[webhook] no user resolved", s.id); break; }

        let plan: "creator" | "studio" | "lifetime" | null = null;
        let subscriptionId: string | null = null;
        let status: string | null = s.status ?? null;

        if (s.mode === "payment") {
          const priceId = s.metadata?.price_id;
          if (priceId && PRICE_TO_PLAN[priceId]) plan = PRICE_TO_PLAN[priceId];
        } else if (s.mode === "subscription" && s.subscription) {
          subscriptionId = typeof s.subscription === "string" ? s.subscription : s.subscription.id;
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          const priceId = sub.items.data[0]?.price?.id;
          if (priceId && PRICE_TO_PLAN[priceId]) plan = PRICE_TO_PLAN[priceId];
          status = sub.status;
        }

        await admin.from("profiles").update({
          ...(plan ? { plan } : {}),
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          subscription_status: status,
        }).eq("id", userId);
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        const userId = await findUserId({ metadataUserId: sub.metadata?.user_id, customerId });
        if (!userId) break;
        const priceId = sub.items.data[0]?.price?.id;
        const mapped = priceId ? PRICE_TO_PLAN[priceId] : null;
        await admin.from("profiles").update({
          ...(mapped ? { plan: mapped } : {}),
          subscription_status: sub.status,
          stripe_subscription_id: sub.id,
          stripe_customer_id: customerId,
        }).eq("id", userId);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        const userId = await findUserId({ metadataUserId: sub.metadata?.user_id, customerId });
        if (!userId) break;
        // Don't downgrade lifetime users
        const { data: prof } = await admin
          .from("profiles").select("plan").eq("id", userId).maybeSingle();
        if (prof?.plan === "lifetime") break;
        await admin.from("profiles").update({
          plan: "free",
          subscription_status: "canceled",
          stripe_subscription_id: null,
        }).eq("id", userId);
        break;
      }
    }
    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (e) {
    console.error("[stripe-webhook] handler error", e);
    return new Response("Webhook handler error", { status: 500 });
  }
});
