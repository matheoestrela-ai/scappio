// Pulls the current Stripe state for the logged-in user and writes it back
// to public.profiles. Called from the client after checkout success and on demand.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PRICE_TO_PLAN: Record<string, string> = {
  price_1TWgZ9Fjlt1yiQGFO4VizMuB: "creator",
  price_1TWgZfFjlt1yiQGF79uXnZfu: "creator",
  price_1TWgaIFjlt1yiQGFAz7qALSH: "studio",
  price_1TWgcFFjlt1yiQGFYYHKXgGJ: "studio",
  price_1TWgcWFjlt1yiQGFRJvY2hMV: "lifetime",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not configured");

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    );
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const { data: userData, error: userErr } = await userClient.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (userErr) throw userErr;
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    const customers = await stripe.customers.list({ email: user.email, limit: 1 });

    let plan: "free" | "creator" | "studio" | "lifetime" = "free";
    let stripeCustomerId: string | null = null;
    let stripeSubscriptionId: string | null = null;
    let subscriptionStatus: string | null = null;

    if (customers.data.length > 0) {
      const customer = customers.data[0];
      stripeCustomerId = customer.id;

      // Lifetime: any one-time succeeded payment with our lifetime price?
      const lifetimePriceId = "price_1TWgcWFjlt1yiQGFRJvY2hMV";
      const charges = await stripe.checkout.sessions.list({
        customer: customer.id,
        limit: 20,
      });
      const lifetimePaid = charges.data.some(
        (s) =>
          s.mode === "payment" &&
          s.payment_status === "paid" &&
          (s.metadata?.price_id === lifetimePriceId),
      );
      if (lifetimePaid) plan = "lifetime";

      // Active subscription overrides only if not lifetime
      if (plan !== "lifetime") {
        const subs = await stripe.subscriptions.list({
          customer: customer.id,
          status: "all",
          limit: 5,
        });
        const active = subs.data.find(
          (s) => s.status === "active" || s.status === "trialing" || s.status === "past_due",
        );
        if (active) {
          stripeSubscriptionId = active.id;
          subscriptionStatus = active.status;
          const priceId = active.items.data[0]?.price?.id;
          const mapped = priceId ? PRICE_TO_PLAN[priceId] : null;
          if (mapped === "creator" || mapped === "studio") plan = mapped;
        }
      }
    }

    await adminClient.from("profiles").update({
      plan,
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: stripeSubscriptionId,
      subscription_status: subscriptionStatus,
    }).eq("id", user.id);

    return new Response(
      JSON.stringify({ plan, subscription_status: subscriptionStatus }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[check-subscription] ERROR", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
