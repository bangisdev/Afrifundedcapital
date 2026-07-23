import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, User, Shield, Upload, CheckCircle, XCircle, Clock } from "lucide-react";
import { toast } from "sonner";

export default function Profile() {
  const { user } = useAuth();
  const kycDocs = useQuery(api.kyc.getMyKycDocuments);
  const updateProfile = useMutation(api.users.updateProfile);
  const uploadKyc = useMutation(api.kyc.uploadKycDocument);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [address, setAddress] = useState(user?.address || "");
  const [country, setCountry] = useState(user?.country || "");

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await updateProfile({ name, phone, address, country });
      toast.success("Profile updated");
    } catch (error: any) {
      toast.error(error.message);
    }
    setSaving(false);
  };

  const handleKycUpload = async (type: string) => {
    // In a real app, this would trigger file upload to storage
    // For now, simulate with a placeholder URL
    try {
      await uploadKyc({
        documentType: type as any,
        fileUrl: "https://example.com/placeholder-doc.pdf",
      });
      toast.success("Document uploaded for verification");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const kycStatusBadge = (status?: string) => {
    switch (status) {
      case "approved":
        return <Badge variant="outline" className="rounded-full text-xs border-foreground"><CheckCircle className="h-3 w-3 mr-1" /> Verified</Badge>;
      case "pending":
        return <Badge variant="outline" className="rounded-full text-xs"><Clock className="h-3 w-3 mr-1" /> Pending</Badge>;
      case "rejected":
        return <Badge variant="outline" className="rounded-full text-xs border-destructive text-destructive"><XCircle className="h-3 w-3 mr-1" /> Rejected</Badge>;
      default:
        return <Badge variant="outline" className="rounded-full text-xs">Not Submitted</Badge>;
    }
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-medium tracking-tight">Profile</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Manage your personal information and verification documents
        </p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="border border-border bg-transparent p-0.5">
          <TabsTrigger value="profile" className="text-xs data-[state=active]:bg-secondary">
            <User className="h-3 w-3 mr-1" /> Profile
          </TabsTrigger>
          <TabsTrigger value="kyc" className="text-xs data-[state=active]:bg-secondary">
            <Shield className="h-3 w-3 mr-1" /> KYC Verification
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-4">
          <div className="card-subtle p-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="h-12 w-12 rounded-full bg-secondary flex items-center justify-center">
                <span className="text-lg font-medium">{user.name?.[0] || user.email?.[0] || "T"}</span>
              </div>
              <div>
                <div className="text-sm font-medium">{user.name || "Unnamed Trader"}</div>
                <div className="text-xs text-muted-foreground">{user.email}</div>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Full Name</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="text-xs h-9"
                  placeholder="Your full name"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Phone</label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="text-xs h-9"
                  placeholder="+234..."
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Address</label>
                <Input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="text-xs h-9"
                  placeholder="Your address"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Country</label>
                <Input
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="text-xs h-9"
                  placeholder="Nigeria"
                />
              </div>
            </div>

            <Button size="sm" className="text-xs" onClick={handleSaveProfile} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="kyc" className="space-y-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-sm font-medium">Identity Verification</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Upload documents to verify your identity
              </p>
            </div>
            {kycStatusBadge(user.kycStatus)}
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            {[
              { type: "passport", label: "International Passport" },
              { type: "national_id", label: "National ID" },
              { type: "drivers_license", label: "Driver's License" },
              { type: "proof_of_address", label: "Proof of Address" },
              { type: "selfie", label: "Selfie Verification" },
            ].map((doc) => {
              const existing = kycDocs?.find((d) => d.documentType === doc.type);
              return (
                <div key={doc.type} className="card-subtle p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium">{doc.label}</span>
                    {existing ? (
                      <Badge variant="outline" className="text-[10px] rounded-full">
                        {existing.status}
                      </Badge>
                    ) : null}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs"
                    onClick={() => handleKycUpload(doc.type)}
                    disabled={user.kycStatus === "approved"}
                  >
                    <Upload className="h-3 w-3 mr-1" />
                    {existing ? "Re-upload" : "Upload"}
                  </Button>
                </div>
              );
            })}
          </div>

          <div className="card-subtle p-4 text-xs text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Requirements</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>Documents must be clear and legible</li>
              <li>File format: JPG, PNG, or PDF</li>
              <li>Max file size: 10MB</li>
              <li>All details must match your profile</li>
            </ul>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
