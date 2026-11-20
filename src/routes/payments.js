const express = require("express");
const Stripe = require("stripe");
const Payment = require("../models/Payment");
const User = require("../models/User");
const { verifyToken } = require("../middlewares/auth");

const router = express.Router();
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

// POST /api/payments/checkout — creates Stripe Checkout session for Pro subscriptions
router.post("/checkout", verifyToken, async (req, res) => {
  try {
    if (!stripe) {
      return res
        .status(503)
        .json({ message: "Stripe is not configured on the server" });
    }

    const { plan, planName, amount, userRole } = req.body;
    const user = await User.findOne({ email: req.user.email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const effectiveRole = ["tutor", "student"].includes(user.role)
      ? user.role
      : userRole === "tutor"
      ? "tutor"
      : "student";

    const effectivePlanName =
      planName || (effectiveRole === "tutor" ? "Tutor Pro" : "Student Pro");
    const parsedAmount =
      Number(amount) || (effectiveRole === "tutor" ? 15 : 10);

    const clientUrl =
      process.env.CLIENT_URL || "https://mentor-lagbe.vercel.app";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: user.email,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: effectivePlanName,
              description: `MentorLagbe Pro Membership Subscription for ${effectiveRole}s`,
            },
            unit_amount: Math.round(parsedAmount * 100),
          },
          quantity: 1,
        },
      ],
      success_url: `${clientUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${clientUrl}/payment/cancel`,
      metadata: {
        userId: user._id.toString(),
        userEmail: user.email,
        userName: user.name,
        userRole: effectiveRole,
        planName: effectivePlanName,
        amount: String(parsedAmount),
      },
    });

    res.json({
      url: session.url,
      checkoutUrl: session.url,
      sessionId: session.id,
    });
  } catch (error) {
    console.error("POST /api/payments/checkout error:", error);
    res
      .status(500)
      .json({ message: error.message || "Failed to create checkout session" });
  }
});

// GET /api/payments/verify-session — verify checkout session and ensure payment document exists
router.get("/verify-session", async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({ message: "Stripe is not configured" });
    }
    const { session_id } = req.query;
    if (!session_id) {
      return res.status(400).json({ message: "session_id query param is required" });
    }

    const session = await stripe.checkout.sessions.retrieve(session_id);
    if (!session) {
      return res.status(404).json({ message: "Checkout session not found" });
    }

    if (session.payment_status === "paid") {
      const transactionId =
        (typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id) || session.id;

      const userEmail =
        session.customer_details?.email ||
        session.customer_email ||
        session.metadata?.userEmail;
      const userName =
        session.customer_details?.name ||
        session.metadata?.userName ||
        "Subscriber";
      const userRole = session.metadata?.userRole || "student";
      const planName =
        session.metadata?.planName ||
        (userRole === "tutor" ? "Tutor Pro" : "Student Pro");
      const amount = (session.amount_total || 0) / 100;
      const currency = session.currency || "usd";

      const payment = await Payment.findOneAndUpdate(
        { transactionId },
        {
          userEmail,
          userName,
          userRole,
          planName,
          amount,
          currency,
          transactionId,
          stripeSessionId: session.id,
          paymentStatus: "paid",
          paidAt: new Date(),
        },
        { upsert: true, new: true }
      );

      if (userEmail) {
        await User.findOneAndUpdate(
          { email: userEmail },
          { $set: { plan: "pro" } }
        );
      }

      return res.json({ verified: true, payment });
    }

    res.json({ verified: false, status: session.payment_status });
  } catch (error) {
    console.error("GET /api/payments/verify-session error:", error);
    res
      .status(500)
      .json({ message: error.message || "Failed to verify session" });
  }
});

// POST /api/payments/webhook — Stripe Webhook handler
router.post("/webhook", async (req, res) => {
  let event = req.body;
  const sig = req.headers["stripe-signature"];

  if (process.env.STRIPE_WEBHOOK_SECRET && sig && stripe) {
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("Webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
  } else if (typeof req.body === "string" || Buffer.isBuffer(req.body)) {
    try {
      event = JSON.parse(req.body.toString("utf8"));
    } catch {
      // Keep event as is
    }
  }

  if (event?.type === "checkout.session.completed") {
    const session = event.data.object;
    const transactionId =
      (typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id) || session.id;

    const userEmail =
      session.customer_details?.email ||
      session.customer_email ||
      session.metadata?.userEmail;
    const userName =
      session.customer_details?.name ||
      session.metadata?.userName ||
      "Subscriber";
    const userRole = session.metadata?.userRole || "student";
    const planName =
      session.metadata?.planName ||
      (userRole === "tutor" ? "Tutor Pro" : "Student Pro");
    const amount = (session.amount_total || 0) / 100;
    const currency = session.currency || "usd";

    try {
      await Payment.findOneAndUpdate(
        { transactionId },
        {
          userEmail,
          userName,
          userRole,
          planName,
          amount,
          currency,
          transactionId,
          stripeSessionId: session.id,
          paymentStatus: "paid",
          paidAt: new Date(),
        },
        { upsert: true, new: true }
      );

      if (userEmail) {
        await User.findOneAndUpdate(
          { email: userEmail },
          { $set: { plan: "pro" } }
        );
      }
    } catch (dbError) {
      console.error("Failed to record payment from webhook:", dbError);
    }
  }

  res.json({ received: true });
});

module.exports = router;
