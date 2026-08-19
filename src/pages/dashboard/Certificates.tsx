/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery } from "@/hooks/use-api";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "react-router";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { PageLoader } from "@/components/dashboard/PageLoader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
  EmptyMedia,
} from "@/components/ui/empty";
import {
  Award,
  Download,
  ExternalLink,
  ChevronRight,
  Shield,
  CheckCircle,
  FileText,
} from "lucide-react";
import { formatShortDate } from "@/lib/utils";

export default function Certificates() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, isLoading } = useApiQuery<any>(["certificates", "my"], "/api/certificates/my");

  const certificates = data?.certificates || [];

  if (isLoading) {
    return <PageLoader />;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Achievements"
        title="Certificates"
        subtitle="Your funded trader certificates and achievements"
      />

      {certificates.length > 0 ? (
        <div className="grid gap-4">
          {certificates.map((cert: any) => (
            <div
              key={cert.id}
              className="card-subtle p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4"
            >
              <div className="h-12 w-12 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
                <Award className="h-6 w-6 text-brand" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-sm font-medium">{cert.title || "Funded Trader Certificate"}</h3>
                  <Badge variant={cert.verified ? "default" : "secondary"} className="text-[10px]">
                    {cert.verified ? "Verified" : "Pending"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {cert.accountSize ? `$${cert.accountSize.toLocaleString()} Account` : ""}
                  {cert.issuedAt ? ` · Issued ${formatShortDate(cert.issuedAt)}` : ""}
                </p>
                {cert.certificateNumber && (
                  <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    Certificate #{cert.certificateNumber}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {cert.verifyUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => window.open(cert.verifyUrl, "_blank")}
                  >
                    <Shield className="h-3 w-3 mr-1" /> Verify
                  </Button>
                )}
                {cert.downloadUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => window.open(cert.downloadUrl, "_blank")}
                  >
                    <Download className="h-3 w-3 mr-1" /> Download
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty className="card-subtle p-10">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Award className="h-6 w-6" />
            </EmptyMedia>
            <EmptyTitle>No certificates yet</EmptyTitle>
            <EmptyDescription>
              Complete a challenge and get funded to receive your trader certificate.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={() => navigate("/dashboard/challenges")}>
              Browse Challenges
            </Button>
          </EmptyContent>
        </Empty>
      )}
    </div>
  );
}
