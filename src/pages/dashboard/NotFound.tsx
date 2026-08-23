import { useNavigate } from "react-router";
import { FileQuestion, ArrowLeft, Home } from "lucide-react";

export default function NotFound({ isAdmin = false }: { isAdmin?: boolean }) {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center min-h-[500px] px-6">
      <div className="w-20 h-20 rounded-2xl bg-secondary flex items-center justify-center mb-6">
        <FileQuestion className="h-10 w-10 text-muted-foreground" />
      </div>
      <h1 className="text-6xl font-bold text-foreground/10 mb-2">404</h1>
      <h2 className="text-xl font-semibold text-foreground mb-2">Page not found</h2>
      <p className="text-sm text-muted-foreground text-center max-w-md mb-8">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
        {isAdmin
          ? " Check the admin sidebar for available sections."
          : " Check the sidebar for available sections."}
      </p>
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Go Back
        </button>
        <button
          onClick={() => navigate(isAdmin ? "/admin" : "/dashboard")}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Home className="h-4 w-4" />
          {isAdmin ? "Admin Overview" : "Dashboard"}
        </button>
      </div>
    </div>
  );
}
