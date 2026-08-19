import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Home, ArrowLeft, MessageCircle } from "lucide-react";
import { useNavigate } from "react-router";

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="flex-1 flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-md w-full text-center"
        >
          {/* Decorative 404 */}
          <div className="relative mb-8">
            <div className="text-[120px] sm:text-[160px] font-bold tracking-tighter text-muted/30 leading-none select-none">
              404
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-px w-32 bg-gradient-to-r from-transparent via-foreground/20 to-transparent" />
            </div>
          </div>

          <h1 className="text-xl font-semibold text-foreground mb-2">
            Page not found
          </h1>
          <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
            The page you're looking for doesn't exist or has been moved.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-9 gap-2"
              onClick={() => navigate(-1)}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Go Back
            </Button>
            <Button
              size="sm"
              className="text-xs h-9 gap-2"
              onClick={() => navigate("/")}
            >
              <Home className="h-3.5 w-3.5" />
              Home
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-9 gap-2"
              onClick={() => navigate("/dashboard/support")}
            >
              <MessageCircle className="h-3.5 w-3.5" />
              Support
            </Button>
          </div>

          <p className="text-[10px] text-muted-foreground mt-10">
            AfriFundedCapital ·{" "}
            <button
              onClick={() => navigate("/")}
              className="underline underline-offset-2 decoration-dotted hover:text-foreground transition-colors"
            >
              afrifundedcapital.com
            </button>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
