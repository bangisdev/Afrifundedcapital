import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

// ═══════════════════════════════════════════════
//  FLUTTERWAVE WEBHOOK
//  Docs: https://developer.flutterwave.com/docs/webhooks
// ═══════════════════════════════════════════════

http.route({
  path: "/webhook/flutterwave",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const signature = request.headers.get("verif-hash") || "";

      // Verify webhook signature using FLW_SECRET_HASH
      const secretHash = process.env.FLW_SECRET_HASH;
      if (!secretHash || signature !== secretHash) {
        console.error("Flutterwave: Invalid webhook signature");
        return new Response("Invalid signature", { status: 401 });
      }

      const event = body.event;
      const data = body.data;

      // Log the incoming webhook
      console.log(`Flutterwave webhook: ${event} | Ref: ${data?.tx_ref}`);

      // Forward to the payment action for processing
      if (event === "charge.completed" || event === "charge.failed") {
        await ctx.runAction((internal as any).payments.handleFlutterwaveWebhook, {
          payload: body,
          signature,
        });
      }

      // Always return 200 to acknowledge receipt
      return new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error: any) {
      console.error("Flutterwave webhook error:", error);
      // Return 200 to prevent Flutterwave from retrying malformed requests
      return new Response(JSON.stringify({ status: "error", message: error.message }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

// ═══════════════════════════════════════════════
//  PAYSTACK WEBHOOK
//  Docs: https://paystack.com/docs/payments/webhooks
// ═══════════════════════════════════════════════

http.route({
  path: "/webhook/paystack",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const bodyText = await request.text();
      const body = JSON.parse(bodyText);
      const signature = request.headers.get("x-paystack-signature") || "";

      // Verify webhook signature using HMAC-SHA256
      const secret = process.env.PAYSTACK_SECRET_KEY || "";
      const crypto = require("crypto");
      const expectedSignature = crypto
        .createHmac("sha256", secret)
        .update(bodyText)
        .digest("hex");

      if (signature !== expectedSignature) {
        console.error("Paystack: Invalid webhook signature");
        return new Response("Invalid signature", { status: 401 });
      }

      const event = body.event;
      const data = body.data;

      // Log the incoming webhook
      console.log(`Paystack webhook: ${event} | Ref: ${data?.reference}`);

      // Forward to the payment action for processing
      if (event === "charge.success" || event === "charge.failed") {
        await ctx.runAction((internal as any).payments.handlePaystackWebhook, {
          payload: body,
          signature,
        });
      }

      // Always return 200 to acknowledge receipt
      return new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error: any) {
      console.error("Paystack webhook error:", error);
      return new Response(JSON.stringify({ status: "error", message: error.message }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

// ═══════════════════════════════════════════════
//  PUBLIC CERTIFICATE VERIFICATION
//  Anyone can verify a certificate by code
// ═══════════════════════════════════════════════

http.route({
  path: "/api/verify-certificate",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const code = url.searchParams.get("code") || "";

      if (!code) {
        return new Response(
          JSON.stringify({ valid: false, message: "Verification code is required." }),
          {
            status: 400,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          },
        );
      }

      const result = await ctx.runAction(
        (internal as any).certificates.publicVerifyCertificate,
        { code },
      );

      return new Response(JSON.stringify(result), {
        status: result.valid ? 200 : 404,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    } catch (error: any) {
      console.error("Certificate verification error:", error);
      return new Response(
        JSON.stringify({ valid: false, message: "Verification service unavailable." }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        },
      );
    }
  }),
});

export default http;
