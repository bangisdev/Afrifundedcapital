import { useCallback, useState } from "react";
import { toast } from "sonner";

export interface FlutterwaveCheckoutParams {
  amount: number;
  originalAmount?: number;
  currency?: string;
  email: string;
  name: string;
  phoneNumber?: string;
  templateId: string;
  accountSizeId: string;
  couponCode?: string;
  couponId?: number;
  description?: string;
}

export interface CheckoutState {
  status: "idle" | "initiating" | "checkout_open" | "verifying" | "success" | "error";
  message?: string;
  reference?: string;
}

export function useFlutterwavePayment() {
  const [state, setState] = useState<CheckoutState>({ status: "idle" });

  const startCheckout = useCallback(
    async (params: FlutterwaveCheckoutParams) => {
      try {
        setState({ status: "initiating" });

        // Step 1: Get Flutterwave public key from settings
        let flwPublicKey = "";
        try {
          const settingsRes = await fetch("/api/seed/settings", { credentials: "include" });
          if (settingsRes.ok) {
            const settings = await settingsRes.json();
            const flwSetting = settings.find((s: { key: string }) => s.key === "flutterwave_config");
            if (flwSetting?.value?.publicKey) {
              flwPublicKey = flwSetting.value.publicKey;
            }
          }
        } catch {}
        // Fallback: try the direct config endpoint
        if (!flwPublicKey) {
          try {
            const configRes = await fetch("/api/payments/flutterwave-config", { credentials: "include" });
            const config = await configRes.json();
            if (config.publicKey) flwPublicKey = config.publicKey;
          } catch {}
        }
        if (!flwPublicKey) {
          setState({ status: "error", message: "Flutterwave is not configured. Please add your API key." });
          toast.error("Flutterwave public key not configured");
          return;
        }

        // Step 2: Initiate payment with backend (creates payment record)
        const initRes = await fetch("/api/payments/initiate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            amount: params.amount,
            originalAmount: params.originalAmount || params.amount,
            currency: params.currency || "NGN",
            templateId: params.templateId,
            accountSizeId: params.accountSizeId,
            couponCode: params.couponCode,
            couponId: params.couponId,
            description: params.description || "Challenge Purchase",
          }),
        });

        if (!initRes.ok) {
          const err = await initRes.json();
          throw new Error(err.error || "Failed to initiate payment");
        }

        const { paymentId, reference } = await initRes.json();
        setState({ status: "checkout_open", reference });

        // Step 3: Build Flutterwave inline config
        const flutterwaveConfig = {
          public_key: flwPublicKey,
          tx_ref: reference,
          amount: params.amount,
          currency: params.currency || "NGN",
          payment_options: "card,ussd,banktransfer,mobilemoney",
          customer: {
            email: params.email,
            phone_number: params.phoneNumber || "",
            name: params.name,
          },
          customizations: {
            title: "AfriFundedCapital",
            description: params.description || "Challenge Purchase",
            logo: "https://afrifundedcapital.com/logo.png",
          },
          meta: {
            paymentId: String(paymentId),
          },
        };

        // Step 4: Open Flutterwave checkout modal
        await openFlutterwaveInline({
          ...flutterwaveConfig,
          callback: async (response: any) => {
            setState({ status: "verifying" });
            try {
              const verifyRes = await fetch("/api/payments/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                  paymentId,
                  transactionId: String(response.transaction_id || ""),
                  flwRef: response.flw_ref || "",
                }),
              });

              const verification = await verifyRes.json();

              closePaymentModal();

              if (verification.status === "completed") {
                setState({ status: "success", message: "Payment successful! Challenge created.", reference });
                toast.success("Challenge purchased successfully!");
              } else {
                setState({ status: "success", message: "Payment already processed.", reference });
                toast.success("Challenge purchased successfully!");
              }
            } catch (error: unknown) {
              closePaymentModal();
              const emsg = error instanceof Error ? error.message : "Payment verification failed";
              setState({ status: "error", message: emsg });
              toast.error(emsg);
            }
          },
          onclose: () => {
            if (state.status === "checkout_open") {
              setState({ status: "idle" });
            }
          },
        });
      } catch (error: unknown) {
        const emsg = error instanceof Error ? error.message : "Payment initiation failed";
        setState({ status: "error", message: emsg });
        toast.error(emsg);
      }
    },
    [state.status],
  );

  const reset = useCallback(() => {
    setState({ status: "idle" });
  }, []);

  return { state, startCheckout, reset };
}

/**
 * Opens the Flutterwave Inline checkout modal by dynamically loading the SDK script.
 */
interface FlutterwaveCheckoutInstance {
  (config: {
    public_key: string;
    tx_ref: string;
    amount: number;
    currency: string;
    payment_options: string;
    customer: { email: string; phone_number: string; name: string };
    customizations: { title: string; description: string; logo: string };
    meta?: Record<string, unknown>;
    callback: (response: { transaction_id?: string; flw_ref?: string }) => void;
    onclose: () => void;
  }): void;
}

type FlutterwaveWindow = Window & typeof globalThis & {
  FlutterwaveCheckout?: FlutterwaveCheckoutInstance;
};

async function openFlutterwaveInline(config: Parameters<NonNullable<FlutterwaveWindow["FlutterwaveCheckout"]>>[0]): Promise<void> {
  const fwWindow = window as FlutterwaveWindow;
  if (!fwWindow.FlutterwaveCheckout) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://checkout.flutterwave.com/v3.js";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load Flutterwave checkout script"));
      document.body.appendChild(script);
    });
  }

  if (fwWindow.FlutterwaveCheckout) {
    fwWindow.FlutterwaveCheckout(config);
  }
}

function closePaymentModal() {
  // Flutterwave inline doesn't have a close method — the modal closes on callback
  // This is a no-op placeholder
}
