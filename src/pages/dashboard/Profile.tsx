/* eslint-disable @typescript-eslint/no-explicit-any */
import { useApiQuery, useApiMutation } from "@/hooks/use-api";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, User, Shield, Upload, CheckCircle, XCircle, Clock } from "lucide-react";
import { toast } from "sonner";

export default function Profile() {
  const { user } = useAuth();
  const { data: kycDocs } = useApiQuery<any[]>(["kyc", "my"], "/api/kyc/my");
  const updateProfile = useApiMutation<any, any>("put", "/api/users/profile");
  const uploadKyc = useApiMutation<any, any>("post", "/api/kyc/upload");
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState(String(user?.name || ""));
  const [phone, setPhone] = useState(String(user?.phone || ""));
  const [address, setAddress] = useState(String(user?.address || ""));
  const [country, setCountry] = useState(String(user?.country || ""));

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await updateProfile.mutateAsync({ name, phone, address, country });
      toast.success("Profile updated");
    } catch (error: any) { toast.error(error.message); }
    setSaving(false);
  };

  const handleKycUpload = async (type: string) => {
    try {
      await uploadKyc.mutateAsync({ documentType: type, fileUrl: "https://example.com/placeholder-doc.pdf" });
      toast.success("Document uploaded for verification");
    } catch (error: any) { toast.error(error.message); }
  };

  const kycStatusBadge = (status?: string) => {
    switch (status) {
      case "approved": return <Badge variant="outline" className="rounded-full text-xs border-foreground"><CheckCircle className="h-3 w-3 mr-1" /> Verified</Badge>;
      case "pending": return <Badge variant="outline" className="rounded-full text-xs"><Clock className="h-3 w-3 mr-1" /> Pending</Badge>;
      case "rejected": return <Badge variant="outline" className="rounded-full text-xs border-destructive text-destructive"><XCircle className="h-3 w-3 mr-1" /> Rejected</Badge>;
      default: return <Badge variant="outline" className="rounded-full text-xs">Not Submitted</Badge>;
    }
  };

  if (!user) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-8">
      <div><h1 className="text-lg font-medium tracking-tight">Profile</h1><p className="text-xs text-muted-foreground mt-1">Manage your personal information and verification documents</p></div>
      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="border border-border bg-transparent p-0.5">
          <TabsTrigger value="profile" className="text-xs data-[state=active]:bg-secondary"><User className="h-3 w-3 mr-1" /> Profile</TabsTrigger>
          <TabsTrigger value="kyc" className="text-xs data-[state=active]:bg-secondary"><Shield className="h-3 w-3 mr-1" /> KYC</TabsTrigger>
        </TabsList>
        <TabsContent value="profile" className="space-y-4">
          <div className="card-subtle p-6">
            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <div><label className="text-xs text-muted-foreground block mb-1">Full Name</label><Input value={name} onChange={(e) => setName(e.target.value)} className="text-xs h-9" /></div>
              <div><label className="text-xs text-muted-foreground block mb-1">Phone</label><Input value={phone} onChange={(e) => setPhone(e.target.value)} className="text-xs h-9" /></div>
              <div><label className="text-xs text-muted-foreground block mb-1">Address</label><Input value={address} onChange={(e) => setAddress(e.target.value)} className="text-xs h-9" /></div>
              <div><label className="text-xs text-muted-foreground block mb-1">Country</label><Input value={country} onChange={(e) => setCountry(e.target.value)} className="text-xs h-9" /></div>
            </div>
            <Button size="sm" className="text-xs" onClick={handleSaveProfile} disabled={saving}>{saving ? "Saving..." : "Save Changes"}</Button>
          </div>
        </TabsContent>
        <TabsContent value="kyc" className="space-y-4">
          <div className="flex items-center justify-between mb-2"><div><h2 className="text-sm font-medium">Identity Verification</h2></div>{kycStatusBadge(String(user.kycStatus || ""))}</div>
          <div className="grid md:grid-cols-2 gap-3">
            {[{ type: "passport", label: "International Passport" }, { type: "national_id", label: "National ID" }, { type: "drivers_license", label: "Driver's License" }, { type: "proof_of_address", label: "Proof of Address" }].map((doc) => (
              <div key={doc.type} className="card-subtle p-4">
                <div className="flex items-center justify-between mb-3"><span className="text-xs font-medium">{doc.label}</span></div>
                <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => handleKycUpload(doc.type)} disabled={user.kycStatus === "approved"}>
                  <Upload className="h-3 w-3 mr-1" /> Upload
                </Button>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
