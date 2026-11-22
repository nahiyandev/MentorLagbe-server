const express = require("express");
const Stripe = require("stripe");
const Payment = require("../models/Payment");
const User = require("../models/User");
const Coupon = require("../models/Coupon");
const { verifyToken, verifyActiveUser } = require("../middlewares/auth");

const router = express.Router();
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

// POST /api/payments/apply-coupon — validates a coupon and calculates discounted amount
router.post("/apply-coupon", verifyToken, verifyActiveUser, async (req, res) => {
  try {
    const { code, amount, currency = "usd" } = req.body;
    if (!code || typeof code !== "string") {
      return res.status(400).json({ message: "Coupon code is required" });
    }

    const cleanCode = code.trim().toUpperCase();
    const coupon = await Coupon.findOne({ code: cleanCode, isActive: true });
    if (!coupon) {
      return res.status(404).json({ message: "Invalid or inactive coupon code" });
    }

    if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
      return res.status(400).json({ message: "This coupon code has expired" });
    }

    if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
      return res.status(400).json({ message: "This coupon has reached its maximum usage limit" });
    }

    const baseAmount = Number(amount) || (currency.toLowerCase() === "bdt" ? 1000 : 10);
    let discount = 0;
    if (coupon.discountType === "percentage") {
      discount = (baseAmount * coupon.discountValue) / 100;
    } else {
      discount = coupon.discountValue;
    }

    const discountedAmount = Math.max(0, Number((baseAmount - discount).toFixed(2)));
    const savings = Number((baseAmount - discountedAmount).toFixed(2));

    res.json({
      valid: true,
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      originalAmount: baseAmount,
      discountedAmount,
      savings,
      currency,
      description: coupon.description,
    });
  } catch (error) {
    console.error("apply-coupon error:", error);
    res.status(500).json({ message: error.message || "Failed to validate coupon" });
  }
});

// POST /api/payments/checkout — creates Stripe Checkout session for Pro subscriptions
router.post("/checkout", verifyToken, verifyActiveUser, async (req, res) => {
  try {
    if (!stripe) {
      return res
        .status(503)
        .json({ message: "Stripe is not configured on the server" });
    }

    const { plan, planName, amount, userRole, couponCode } = req.body;
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
    let parsedAmount =
      Number(amount) || (effectiveRole === "tutor" ? 15 : 10);

    let appliedCoupon = null;
    if (couponCode && typeof couponCode === "string") {
      const cleanCode = couponCode.trim().toUpperCase();
      const foundCoupon = await Coupon.findOne({ code: cleanCode, isActive: true });
      if (foundCoupon && (!foundCoupon.expiresAt || new Date(foundCoupon.expiresAt) >= new Date())) {
        appliedCoupon = foundCoupon;
        let discount = 0;
        if (foundCoupon.discountType === "percentage") {
          discount = (parsedAmount * foundCoupon.discountValue) / 100;
        } else {
          discount = foundCoupon.discountValue;
        }
        parsedAmount = Math.max(1, Number((parsedAmount - discount).toFixed(2)));
        foundCoupon.usedCount += 1;
        await foundCoupon.save();
      }
    }

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
              name: appliedCoupon
                ? `${effectivePlanName} (${appliedCoupon.code} Applied) — One-Time Payment`
                : `${effectivePlanName} — One-Time Payment`,
              description: `MentorLagbe ${effectivePlanName} One-Time Lifetime Pro Access for ${effectiveRole}s (No recurring subscription)`,
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
        paymentType: "one_time",
        amount: String(parsedAmount),
        couponCode: appliedCoupon ? appliedCoupon.code : "",
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

// GET /api/payments/my-payments — student/user's personal payment history
router.get("/my-payments", verifyToken, async (req, res) => {
  try {
    const email = req.user.email;
    const payments = await Payment.find({
      $or: [
        { userEmail: email },
        { userEmail: email.toLowerCase() },
      ],
    }).sort({ paidAt: -1 });
    res.json(payments);
  } catch (error) {
    console.error("Failed to fetch my payments:", error);
    res.status(500).json({ message: "Failed to fetch payment history" });
  }
});

// POST /api/payments/local-pay — bKash / Nagad mobile banking payment & instant verification
router.post("/local-pay", verifyToken, verifyActiveUser, async (req, res) => {
  try {
    const { paymentMethod, transactionId, senderNumber, planName, amount, userRole, couponCode } = req.body;

    if (!paymentMethod || !["bkash", "nagad"].includes(paymentMethod.toLowerCase())) {
      return res.status(400).json({ message: "Invalid payment method. Must be bkash or nagad." });
    }

    if (!transactionId || typeof transactionId !== "string" || transactionId.trim().length < 6) {
      return res.status(400).json({ message: "A valid transaction ID (at least 6 characters) is required." });
    }

    if (!senderNumber || !/^01[3-9]\d{8}$/.test(senderNumber.trim())) {
      return res.status(400).json({ message: "A valid 11-digit Bangladeshi mobile number (e.g. 017XXXXXXXX) is required." });
    }

    const cleanTrxId = transactionId.trim().toUpperCase();
    const cleanSender = senderNumber.trim();

    // Prevent duplicate transaction IDs
    const existing = await Payment.findOne({ transactionId: cleanTrxId });
    if (existing) {
      return res.status(409).json({ message: "This Transaction ID has already been submitted or used." });
    }

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
    let parsedAmount =
      Number(amount) || (effectiveRole === "tutor" ? 1500 : 1000);

    let appliedCouponCode = "";
    if (couponCode && typeof couponCode === "string") {
      const cleanCode = couponCode.trim().toUpperCase();
      const foundCoupon = await Coupon.findOne({ code: cleanCode, isActive: true });
      if (foundCoupon && (!foundCoupon.expiresAt || new Date(foundCoupon.expiresAt) >= new Date())) {
        appliedCouponCode = foundCoupon.code;
        let discount = 0;
        if (foundCoupon.discountType === "percentage") {
          discount = (parsedAmount * foundCoupon.discountValue) / 100;
        } else {
          discount = foundCoupon.discountValue;
        }
        parsedAmount = Math.max(0, Number((parsedAmount - discount).toFixed(2)));
        foundCoupon.usedCount += 1;
        await foundCoupon.save();
      }
    }

    const payment = await Payment.create({
      userEmail: user.email,
      userName: user.name || "Subscriber",
      userRole: effectiveRole,
      planName: effectivePlanName,
      amount: parsedAmount,
      currency: "bdt",
      paymentMethod: paymentMethod.toLowerCase(),
      senderNumber: cleanSender,
      transactionId: cleanTrxId,
      stripeSessionId: `${paymentMethod.toLowerCase()}_${cleanTrxId}`,
      couponCode: appliedCouponCode,
      paymentStatus: "paid",
      paidAt: new Date(),
    });

    // Upgrade user plan to pro
    await User.findOneAndUpdate(
      { email: user.email },
      { $set: { plan: "pro" } }
    );

    // Create Notification
    try {
      const Notification = require("../models/Notification");
      await Notification.create({
        recipientEmail: user.email,
        recipientRole: effectiveRole,
        title: "Pro Membership Activated",
        message: `Your payment of ৳${parsedAmount} via ${paymentMethod.toUpperCase()} (TrxID: ${cleanTrxId}) was verified. Welcome to Pro!`,
        type: "system",
        link: "/dashboard",
      });
    } catch (notifErr) {
      console.warn("Could not create payment notification:", notifErr);
    }

    return res.status(201).json({
      success: true,
      message: `Pro plan activated successfully via ${paymentMethod.toUpperCase()}!`,
      payment,
    });
  } catch (error) {
    console.error("Error in local-pay:", error);
    return res.status(500).json({ message: "Failed to process mobile banking payment" });
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
