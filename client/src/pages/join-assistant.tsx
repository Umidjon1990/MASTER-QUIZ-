import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { Users, Lock, CheckCircle2, AlertTriangle, GraduationCap, LogIn } from "lucide-react";

interface InviteInfo {
  hasPassword: boolean;
  className: string;
  teacherName: string;
  status: string;
  alreadyClaimed: boolean;
}

export default function JoinAssistant() {
  const [, params] = useRoute("/classes/join-assistant/:code");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user, isLoading: authLoading } = useAuth();
  const code = params?.code || "";
  const [password, setPassword] = useState("");
  const [joinResult, setJoinResult] = useState<{ success?: boolean; message?: string } | null>(null);

  const { data: inviteInfo, isLoading: infoLoading, error: infoError } = useQuery<InviteInfo>({
    queryKey: ["/api/invite-info", code],
    queryFn: async () => {
      const res = await fetch(`/api/invite-info/${code}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Xatolik");
      }
      return res.json();
    },
    enabled: !!code,
  });

  const joinMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/classes/join-assistant", {
        inviteCode: code,
        password: password || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      setJoinResult({ success: true, message: "Muvaffaqiyatli qo'shildingiz!" });
      toast({ title: "Sinfga yordamchi sifatida qo'shildingiz!" });
      setTimeout(() => navigate("/teacher/classes"), 2000);
    },
    onError: (err: any) => {
      const msg = err?.message || "Xatolik yuz berdi";
      if (msg.toLowerCase().includes("parol")) {
        toast({ title: "Noto'g'ri parol", variant: "destructive" });
      } else {
        setJoinResult({ success: false, message: msg });
      }
    },
  });

  const handleLoginRedirect = () => {
    sessionStorage.setItem("returnTo", `/classes/join-assistant/${code}`);
    navigate("/auth");
  };

  if (infoLoading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full p-8 space-y-4">
          <Skeleton className="h-16 w-16 rounded-full mx-auto" />
          <Skeleton className="h-6 w-48 mx-auto" />
          <Skeleton className="h-4 w-64 mx-auto" />
        </Card>
      </div>
    );
  }

  const errorMsg = (infoError as any)?.message || (inviteInfo?.status === "revoked" ? "Bu taklif bekor qilingan" : null);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full p-8" data-testid="card-join-assistant">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold" data-testid="text-join-title">Yordamchi o'qituvchi</h1>
          <p className="text-muted-foreground mt-1">Sinfga yordamchi sifatida qo'shilish</p>
        </div>

        {errorMsg ? (
          <div className="text-center space-y-3" data-testid="text-join-error">
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto" />
            <p className="font-medium text-red-600">{errorMsg}</p>
          </div>
        ) : joinResult?.success ? (
          <div className="text-center space-y-3" data-testid="text-join-success">
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
            <p className="font-medium text-green-600">{joinResult.message}</p>
            <p className="text-sm text-muted-foreground">Sinflar sahifasiga yo'naltirilmoqda...</p>
          </div>
        ) : joinResult?.success === false ? (
          <div className="text-center space-y-3" data-testid="text-join-error">
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto" />
            <p className="font-medium text-red-600">{joinResult.message}</p>
            <Button variant="outline" onClick={() => setJoinResult(null)} data-testid="button-retry">
              Qayta urinish
            </Button>
          </div>
        ) : inviteInfo ? (
          <div className="space-y-4">
            <div className="bg-muted rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2 justify-center">
                <GraduationCap className="w-5 h-5 text-primary" />
                <span className="font-semibold text-lg">{inviteInfo.className}</span>
              </div>
              <p className="text-sm text-muted-foreground text-center">
                O'qituvchi: {inviteInfo.teacherName}
              </p>
            </div>

            {inviteInfo.hasPassword && (
              <div>
                <Label className="flex items-center gap-1.5 mb-1">
                  <Lock className="w-4 h-4" />
                  Parol
                </Label>
                <Input
                  type="password"
                  placeholder="Parolni kiriting"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  data-testid="input-join-password"
                />
              </div>
            )}

            {!user ? (
              <div className="space-y-3">
                <p className="text-sm text-center text-muted-foreground">
                  Qo'shilish uchun avval tizimga kiring
                </p>
                <Button
                  className="w-full"
                  size="lg"
                  onClick={handleLoginRedirect}
                  data-testid="button-login-first"
                >
                  <LogIn className="w-4 h-4 mr-2" />
                  Tizimga kirish
                </Button>
              </div>
            ) : (
              <Button
                className="w-full"
                size="lg"
                disabled={joinMutation.isPending || (inviteInfo.hasPassword && !password)}
                onClick={() => joinMutation.mutate()}
                data-testid="button-join-assistant"
              >
                {joinMutation.isPending ? "Qo'shilmoqda..." : "Qo'shilish"}
              </Button>
            )}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
