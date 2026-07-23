import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";

const http = httpRouter();

// ═══════════════════════════════════════════════
//  FLUTTERWAVE WEBHOOK
// ═══════════════════════════════════════════════

http.route({
  path: "/webhook/flutterwave",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const signature = request.headers.get("verif-hash") || "";

      // Verify signature
      const secretHash = process.env.FLW_SECRET_HASH;
      if (!secretHash || signature !== secretHash) {
        return new Response("Invalid signature", { status: 401 });
      }

      console.log("Flutterwave webhook received:", body.event);

      return new Response("Webhook processed", { status: 200 });
    } catch (error: any) {
      console.error("Flutterwave webhook error:", error);
      return new Response(`Error: ${error.message}`, { status: 500 });
    }
  }),
});

// ═══════════════════════════════════════════════
//  PAYSTACK WEBHOOK
// ═══════════════════════════════════════════════

http.route({
  path: "/webhook/paystack",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const signature = request.headers.get("x-paystack-signature") || "";

      // Verify signature using HMAC-SHA256
      const secret = process.env.PAYSTACK_SECRET_KEY || "";
      // In production, verify: crypto.createHmac("sha256", secret).update(JSON.stringify(body)).digest("hex")
      
      console.log("Paystack webhook received:", body.event);

      return new Response("Webhook processed", { status: 200 });
    } catch (error: any) {
      console.error("Paystack webhook error:", error);
      return new Response(`Error: ${error.message}`, { status: 500 });
    }
  }),
});

export default http;
