import { Hono } from "hono";
import { cors } from "hono/cors";
import { authRouter } from "./auth";
import { initDatabase } from "./db";
import type { Plugin, ViteDevServer } from "vite";

// Import route modules
import usersRouter from "./routes/users";
import challengesRouter from "./routes/challenges";
import notificationsRouter from "./routes/notifications";
import walletsRouter from "./routes/wallets";
import paymentsRouter from "./routes/payments";
import tradingRouter from "./routes/trading";
import kycRouter from "./routes/kyc";
import supportRouter from "./routes/support";
import affiliatesRouter from "./routes/affiliates";
import couponsRouter from "./routes/coupons";
import certificatesRouter from "./routes/certificates";
import payoutsRouter from "./routes/payouts";
import seedRouter from "./routes/seed";

// Initialize database
initDatabase();

const app = new Hono();

// CORS
app.use("*", cors({
  origin: ["http://localhost:5173", "http://127.0.0.1:5173", "https://*.freebuff.dev", "https://*.vly.sh"],
  credentials: true,
}));

// Health check
app.get("/api/health", (c) => c.json({ status: "ok", timestamp: Date.now() }));

// Custom auth routes
app.route("/api/auth", authRouter);

// Mount route modules
app.route("/api/users", usersRouter);
app.route("/api/challenges", challengesRouter);
app.route("/api/notifications", notificationsRouter);
app.route("/api/wallets", walletsRouter);
app.route("/api/payments", paymentsRouter);
app.route("/api/trading", tradingRouter);
app.route("/api/kyc", kycRouter);
app.route("/api/support", supportRouter);
app.route("/api/affiliates", affiliatesRouter);
app.route("/api/coupons", couponsRouter);
app.route("/api/certificates", certificatesRouter);
app.route("/api/payouts", payoutsRouter);
app.route("/api/seed", seedRouter);

// ═══════════════════════════════════════════════
//  VITE PLUGIN — mounts Hono into dev server
// ═══════════════════════════════════════════════
export function honoPlugin(): Plugin {
  let server: ViteDevServer | null = null;

  return {
    name: "hono-server",
    configureServer(devServer) {
      server = devServer;
      // Middleware mode — intercept API routes before Vite's SPA handler
      devServer.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/")) {
          return next();
        }
        try {
          // Hono expects web-standard Request/Response
          const protocol = req.headers["x-forwarded-proto"] || "http";
          const host = req.headers.host || "localhost:5173";
          const url = new URL(req.url!, `${protocol}://${host}`);

          // Convert Node req → Web Request
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) {
            if (v) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
          }

          let body: BodyInit | undefined;
          if (req.method !== "GET" && req.method !== "HEAD") {
            const raw = await new Promise<Buffer>((resolve, reject) => {
              const chunks: Buffer[] = [];
              req.on("data", (chunk: Buffer) => chunks.push(chunk));
              req.on("end", () => resolve(Buffer.concat(chunks)));
              req.on("error", reject);
            });
            body = new Uint8Array(raw) as unknown as BodyInit;
          }

          const webReq = new Request(url.toString(), {
            method: req.method,
            headers,
            body,
          });

          const webRes = await app.fetch(webReq);

          // Convert Web Response → Node response
          res.statusCode = webRes.status;
          webRes.headers.forEach((v, k) => res.setHeader(k, v));
          const resBody = await webRes.arrayBuffer();
          res.end(Buffer.from(resBody));
        } catch (err) {
          console.error("[Hono] Error:", err);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: "Internal server error" }));
        }
      });
    },
  };
}

export default app;
