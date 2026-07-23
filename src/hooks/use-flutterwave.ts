import { useCallback, useState } from "react";
import { useAction, useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useFlutterwave, closePaymentModal } from "flutterwave-react-v3";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel";

export interface FlutterwaveCheckoutParams {
  amount: number;
  currency?: string;
  email: string;
  name: string;
  phoneNumber?: string;
  templateId: Id<"challengeTemplates">;
  accountSizeId: Id<"accountSizes">;
  couponCode?: string;
  description?: string;
}

export interface CheckoutState {
  status: "idle" | "initiating" | "checkout_open" | "verifying" | "success" | "error";
  message?: string;
  reference?: string;
}

export function useFlutterwavePayment() {
  const [state, setState] = useState<CheckoutState>({ status: "idle" });

  const initiatePayment = useMutation(api.payments.initiatePayment);
  const verifyTransaction = useAction(api.payments.verifyFlutterwaveTransaction);
  const getConfig = useAction(api.payments.getFlutterwaveConfig);

  const startCheckout = useCallback(
    async (params: FlutterwaveCheckoutParams) => {
      try {
        setState({ status: "initiating" });

        // Step 1: Get Flutterwave public key from backend
        const config = await getConfig();
        if (!config.publicKey) {
          setState({ status: "error", message: "Flutterwave is not configured. Please add your API key." });
          toast.error("Flutterwave public key not configured");
          return;
        }

        // Step 2: Initiate payment with backend (creates payment record)
        const result = await initiatePayment({
          amount: params.amount,
          currency: params.currency || "NGN",
          provider: "flutterwave",
          templateId: params.templateId,
          accountSizeId: params.accountSizeId,
          couponCode: params.couponCode,
          description: params.description || "Challenge Purchase",
        });

        setState({ status: "checkout_open", reference: result.reference });

        // Step 3: Build Flutterwave inline config
        const flutterwaveConfig = {
          public_key: config.publicKey,
          tx_ref: result.reference,
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
            paymentId: result.paymentId,
          },
        };

        // Step 4: Open Flutterwave checkout modal
        // We use the inline script approach since we need to dynamically create the config
        // The flutterwave-react-v3 useFlutterwave hook can't be called conditionally,
        // so we'll use the window.FlutterwaveCheckout API directly via script injection

        await openFlutterwaveInline({
          ...flutterwaveConfig,
          callback: async (response: any) => {
            setState({ status: "verifying" });
            try {
              const verification = await verifyTransaction({
                paymentId: result.paymentId as Id<"payments">,
                transactionId: String(response.transaction_id || ""),
                flwRef: response.flw_ref || "",
              });

              closePaymentModal();

              if (verification.status === "completed") {
                setState({ status: "success", message: "Payment successful! Challenge created.", reference: result.reference });
                toast.success("Challenge purchased successfully!");
              } else {
                setState({ status: "success", message: "Payment already processed.", reference: result.reference });
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
    [getConfig, initiatePayment, verifyTransaction, state.status],
  );

  const reset = useCallback(() => {
    setState({ status: "idle" });
  }, []);

  return { state, startCheckout, reset };
}

/**
 * Opens the Flutterwave Inline checkout modal by dynamically loading the SDK script
 * and initializing it with the provided configuration.
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
  // Dynamically load Flutterwave inline script if not already loaded
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

  // Open the checkout modal
  if (fwWindow.FlutterwaveCheckout) {
    fwWindow.FlutterwaveCheckout(config);
  }
}
