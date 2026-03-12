import express from "express";
import cors from "cors";
import Stripe from "stripe";
import admin from "firebase-admin";
import "dotenv/config";
import { createMarketGateway } from "./services/marketGateway.js";
import { createMarketRouter } from "./routes/market.js";

const app = express();
const MARKET_DATA_API = process.env.MARKET_DATA_API || process.env.DATA_API_BASE || "http://127.0.0.1:8000";
const rankStatusCache = new Map();

// Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

// Firebase Admin
if (!admin.apps.length) {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Falta FIREBASE_SERVICE_ACCOUNT_JSON en .env");

  const serviceAccount = JSON.parse(raw);
  serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();
const auth = admin.auth();

function getBearerToken(req) {
  const h = req.headers.authorization || "";
  if (!h.startsWith("Bearer ")) return null;
  return h.slice("Bearer ".length);
}

function toFiniteNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function normalizeSymbol(x) {
  return String(x ?? "").trim().toUpperCase();
}

function buildMarketRowsWithStatus(tf, rows) {
  const now = Date.now();
  const seen = new Set();

  const out = (rows || []).map((r, idx) => {
    const symbol = normalizeSymbol(r?.symbol);
    const rankFlow = toFiniteNum(r?.rankFlow ?? r?.rank ?? r?.Rank ?? (idx + 1));
    if (!symbol || rankFlow == null) return r;

    const key = `${tf}|${symbol}`;
    seen.add(key);
    const prev = rankStatusCache.get(key);

    let dir = "flat";
    let changedAt = now;
    if (prev) {
      dir = prev.dir;
      changedAt = prev.changedAt;
      if (rankFlow < prev.rankFlow) {
        dir = "up";
        changedAt = now;
      } else if (rankFlow > prev.rankFlow) {
        dir = "down";
        changedAt = now;
      }
    }

    rankStatusCache.set(key, { rankFlow, dir, changedAt, lastSeenAt: now });
    return { ...r, rankStatus: { dir, changedAt } };
  });

  for (const [key, v] of rankStatusCache.entries()) {
    if (!key.startsWith(`${tf}|`)) continue;
    if (seen.has(key)) continue;
    if (now - (v?.lastSeenAt || 0) > 60 * 60 * 1000) {
      rankStatusCache.delete(key);
    }
  }

  return out;
}

async function requireAuth(req, res, next) {
  try {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ error: "Missing token" });

    req.user = await auth.verifyIdToken(token);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}


app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    let event;

    try {
      const sig = req.headers["stripe-signature"];
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("Webhook signature failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        const uid = session?.metadata?.uid;

        if (uid) {
          const customerId = session.customer || null;
          const subscriptionId = session.subscription || null;

          let sub = null;
          if (subscriptionId) {
            sub = await stripe.subscriptions.retrieve(subscriptionId);
          }

          await db.collection("users").doc(uid).set(
            {
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId,
              subscription_status: sub?.status ?? (subscriptionId ? "active" : "inactive"),
              subscription_end: sub?.current_period_end
                ? new Date(sub.current_period_end * 1000)
                : null,
              cancel_at_period_end: sub?.cancel_at_period_end ?? null,
              updated_at: new Date(),
            },
            { merge: true }
          );

          console.log("Guardado desde checkout.session.completed", {
            uid,
            customerId,
            subscriptionId,
          });
        }
      }

      if (
        event.type === "customer.subscription.created" ||
        event.type === "customer.subscription.updated" ||
        event.type === "customer.subscription.deleted"
      ) {
        const sub = event.data.object;
        const customerId = sub.customer;

        const snap = await db
          .collection("users")
          .where("stripe_customer_id", "==", customerId)
          .limit(1)
          .get();

        if (!snap.empty) {
          await snap.docs[0].ref.set(
            {
              subscription_status: sub.status,
              subscription_end: sub.current_period_end
                ? new Date(sub.current_period_end * 1000)
                : null,
              cancel_at_period_end: sub.cancel_at_period_end,
              stripe_subscription_id: sub.id,
              updated_at: new Date(),
            },
            { merge: true }
          );

          console.log("Guardado desde subscription event", {
            customerId,
            subId: sub.id,
            status: sub.status,
          });
        } else {
          console.log("No encontré user con stripe_customer_id:", customerId);
        }
      }

      return res.json({ received: true });
    } catch (err) {
      console.error("Webhook handler error:", err);
      return res.status(500).send("Webhook handler failed");
    }
  }
);

app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json());
const marketGateway = createMarketGateway({ marketDataApi: MARKET_DATA_API });
app.use("/api/market", createMarketRouter({ marketGateway, buildMarketRowsWithStatus }));

app.get("/api/me", requireAuth, async (req, res) => {
  const uid = req.user.uid;

  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) return res.status(404).json({ error: "User doc not found" });

  const data = snap.data();
  if (data.disabled) return res.status(403).json({ error: "Account disabled", disabled: true });

  const end = data.subscription_end?.toDate ? data.subscription_end.toDate() : data.subscription_end;

  res.json({
    uid,
    email: data.email ?? req.user.email ?? null,
    first_name: data.first_name ?? "",
    last_name: data.last_name ?? "",
    phone: data.phone ?? "",
    access_level: data.access_level ?? "user",
    disabled: !!data.disabled,
    language: data.language ?? "es",
    notify_renewal_days: data.notify_renewal_days ?? 7,
    subscription_status: data.subscription_status ?? "inactive",
    subscription_end: end ? new Date(end).toISOString() : null,
    stripe_customer_id: data.stripe_customer_id ?? null,
    stripe_subscription_id: data.stripe_subscription_id ?? null,
  });
});

// update profile lang notify
app.patch("/api/me", requireAuth, async (req, res) => {
  const uid = req.user.uid;
  const { first_name, last_name, phone, language, notify_renewal_days } = req.body;

  await db.collection("users").doc(uid).set(
    {
      ...(first_name !== undefined ? { first_name } : {}),
      ...(last_name !== undefined ? { last_name } : {}),
      ...(phone !== undefined ? { phone } : {}),
      ...(language !== undefined ? { language } : {}),
      ...(notify_renewal_days !== undefined ? { notify_renewal_days } : {}),
      updated_at: new Date(),
    },
    { merge: true }
  );

  res.json({ ok: true });
});


app.delete("/api/me", requireAuth, async (req, res) => {
  const uid = req.user.uid;
  await db.collection("users").doc(uid).delete();
  await admin.auth().deleteUser(uid);
  res.json({ ok: true });
});

app.post("/api/checkout", requireAuth, async (req, res) => {
  try {
    const { plan } = req.body;

    const prices = {
      monthly: process.env.PRICE_MONTHLY,
      "3months": process.env.PRICE_3MONTHS,
      yearly: process.env.PRICE_YEARLY,
    };

    const priceId = prices[plan];
    if (!priceId) return res.status(400).json({ error: "Plan inválido" });

    const uid = req.user.uid;
    const email = req.user.email || undefined;

    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    let customerId = userSnap.data()?.stripe_customer_id || null;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email,
        metadata: { uid },
      });
      customerId = customer.id;

      await userRef.set(
        { stripe_customer_id: customerId, updated_at: new Date() },
        { merge: true }
      );
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.CLIENT_URL}/dashboard?success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL}/dashboard?canceled=1`,
      metadata: { uid, plan },
      subscription_data: { metadata: { uid, plan } },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudo crear el checkout" });
  }
});

app.post("/api/billing/sync-checkout", requireAuth, async (req, res) => {
  try {
    const { session_id } = req.body;
    const uid = req.user.uid;

    if (!session_id) return res.status(400).json({ error: "Missing session_id" });

    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ["subscription"],
    });

    const customerId = session.customer || null;
    const sub = session.subscription || null;

    if (!sub) return res.status(400).json({ error: "No subscription on session" });

    await db.collection("users").doc(uid).set(
      {
        stripe_customer_id: customerId,
        stripe_subscription_id: sub.id,
        subscription_status: sub.status,
        subscription_end: sub.current_period_end
          ? new Date(sub.current_period_end * 1000)
          : null,
        cancel_at_period_end: sub.cancel_at_period_end,
        updated_at: new Date(),
      },
      { merge: true }
    );

    return res.json({ ok: true, subId: sub.id, status: sub.status });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to sync checkout" });
  }
});

app.post("/api/billing/portal", requireAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const snap = await db.collection("users").doc(uid).get();
    const customerId = snap.data()?.stripe_customer_id;

    if (!customerId) return res.status(400).json({ error: "No stripe_customer_id todavía" });

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${process.env.CLIENT_URL}/dashboard`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudo abrir portal" });
  }
});

app.get("/api/billing/invoices", requireAuth, async (req, res) => {
  const uid = req.user.uid;
  const snap = await db.collection("users").doc(uid).get();
  const customerId = snap.data()?.stripe_customer_id;
  if (!customerId) return res.status(400).json({ error: "No stripe_customer_id" });

  const invoices = await stripe.invoices.list({ customer: customerId, limit: 20 });

  res.json({
    invoices: invoices.data.map((inv) => ({
      id: inv.id,
      created: inv.created,
      status: inv.status,
      amount_paid: inv.amount_paid,
      currency: inv.currency,
      hosted_invoice_url: inv.hosted_invoice_url,
      invoice_pdf: inv.invoice_pdf,
    })),
  });
});

app.get("/api/billing/subscription", requireAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const userRef = db.collection("users").doc(uid);
    const snap = await userRef.get();
    if (!snap.exists) return res.status(404).json({ error: "User doc not found" });

    const data = snap.data();

if (data?.free_pass === true) {
  return res.json({
    hasSubscription: true,
    status: "free",
    current_period_start: null,
    current_period_end: null,
    cancel_at_period_end: false,
  });
}


    const customerId = data?.stripe_customer_id;
    if (!customerId) return res.json({ hasSubscription: false });

    let sub = null;
    const subId = data?.stripe_subscription_id;

    if (subId) {
      sub = await stripe.subscriptions.retrieve(subId);
    } else {
      const subs = await stripe.subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 10,
      });

      const priority = {
        active: 1,
        trialing: 2,
        past_due: 3,
        unpaid: 4,
        incomplete: 5,
        incomplete_expired: 6,
        canceled: 7,
      };

      sub =
        subs.data
          .slice()
          .sort((a, b) => {
            const pa = priority[a.status] ?? 99;
            const pb = priority[b.status] ?? 99;
            if (pa !== pb) return pa - pb;
            return (b.created ?? 0) - (a.created ?? 0);
          })[0] || null;
          
      if (sub) {
        await userRef.set(
          {
            stripe_subscription_id: sub.id,
            subscription_status: sub.status,
            subscription_end: sub.current_period_end
              ? new Date(sub.current_period_end * 1000)
              : null,
            cancel_at_period_end: sub.cancel_at_period_end,
            updated_at: new Date(),
          },
          { merge: true }
        );
      }
    }

    if (!sub) return res.json({ hasSubscription: false });

    return res.json({
      hasSubscription: true,
      id: sub.id,
      status: sub.status,
      current_period_start: sub.current_period_start,
      current_period_end: sub.current_period_end,
      cancel_at_period_end: sub.cancel_at_period_end,
      cancel_at: sub.cancel_at,
      price_id: sub.items.data?.[0]?.price?.id || null,
      interval: sub.items.data?.[0]?.price?.recurring?.interval || null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load subscription" });
  }
});

app.post("/api/billing/auto-renew", requireAuth, async (req, res) => {
  try {
    const { enabled } = req.body;
    const uid = req.user.uid;

    const snap = await db.collection("users").doc(uid).get();
    const customerId = snap.data()?.stripe_customer_id;
    if (!customerId) return res.status(400).json({ error: "No stripe_customer_id" });

    let subId = snap.data()?.stripe_subscription_id;

    if (!subId) {
      const subs = await stripe.subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 10,
      });

      const best = subs.data.find((s) => s.status === "active") || subs.data[0];
      if (!best) return res.status(404).json({ error: "No subscription" });
      subId = best.id;
    }

    const updated = await stripe.subscriptions.update(subId, {
      cancel_at_period_end: !enabled,
    });

    await db.collection("users").doc(uid).set(
      {
        cancel_at_period_end: updated.cancel_at_period_end,
        subscription_status: updated.status,
        subscription_end: new Date(updated.current_period_end * 1000),
        stripe_subscription_id: updated.id,
        updated_at: new Date(),
      },
      { merge: true }
    );

    res.json({
      ok: true,
      cancel_at_period_end: updated.cancel_at_period_end,
      current_period_end: updated.current_period_end,
      status: updated.status,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update auto-renew" });
  }
});

async function requireAdmin(req, res, next) {
  const uid = req.user.uid;
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) return res.status(403).json({ error: "No profile" });

  const level = snap.data().access_level;
  if (level !== "admin") return res.status(403).json({ error: "Admin only" });

  next();
}

app.get("/api/admin/users", requireAuth, requireAdmin, async (req, res) => {
  const qs = await db.collection("users").limit(200).get();
  const users = qs.docs.map((d) => ({ id: d.id, ...d.data() }));
  res.json({ users });
});

app.post("/api/admin/users/:uid/disable", requireAuth, requireAdmin, async (req, res) => {
  await db.collection("users").doc(req.params.uid).set(
    { disabled: true, updated_at: new Date() },
    { merge: true }
  );
  res.json({ ok: true });
});

app.post("/api/admin/users/:uid/enable", requireAuth, requireAdmin, async (req, res) => {
  await db.collection("users").doc(req.params.uid).set(
    { disabled: false, updated_at: new Date() },
    { merge: true }
  );
  res.json({ ok: true });
});

app.post("/api/admin/users/:uid/freepass/grant", requireAuth, requireAdmin, async (req, res) => {
  await db.collection("users").doc(req.params.uid).set(
    { free_pass: true, free_pass_at: new Date(), updated_at: new Date() },
    { merge: true }
  );
  res.json({ ok: true });
});

app.post("/api/admin/users/:uid/freepass/revoke", requireAuth, requireAdmin, async (req, res) => {
  await db.collection("users").doc(req.params.uid).set(
    { free_pass: false, updated_at: new Date() },
    { merge: true }
  );
  res.json({ ok: true });
});


const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`API corriendo en http://localhost:${PORT}`));
