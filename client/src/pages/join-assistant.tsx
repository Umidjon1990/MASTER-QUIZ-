import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Users, Lock, CheckCircle2, AlertTriangle } from "lucide-react";

export default function JoinAssistant() {
  const [, params] = useRoute("/classes/join-assistant/:code");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const code = params?.code || "";
  const [password, setPassword] = useState("");
  const [result, setResult] = useState<{ success?: boolean; message?: string; needsPassword?: boolean } | null>(null);

  const joinMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/classes/join-assistant", {
        inviteCode: code,
        password: password || undefined,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.needsPassword) {
        setResult({ needsPassword: true, message: "Parol kiritish kerak" });
        return;
      }
      setResult({ success: true, message: data.message || "Muvaffaqiyatli qo'shildingiz!" });
      toast({ title: "Sinfga yordamchi sifatida qo'shildingiz!" });
      setTimeout(() => navigate("/teacher/classes"), 2000);
    },
    onError: (err: any) => {
      const msg = err?.message || "Xatolik yuz berdi";
      if (msg.toLowerCase().includes("parol") || msg.includes("requirePassword")) {
        setResult({ needsPassword: true, message: "Parol kiritish kerak" });
      } else {
        setResult({ success: false, message: msg });
      }
    },
  });

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

        {result?.success ? (
          <div className="text-center space-y-3" data-testid="text-join-success">
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
            <p className="font-medium text-green-600">{result.message}</p>
            <p className="text-sm text-muted-foreground">Sinflar sahifasiga yo'naltirilmoqda...</p>
          </div>
        ) : result?.success === false && !result.needsPassword ? (
          <div className="text-center space-y-3" data-testid="text-join-error">
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto" />
            <p className="font-medium text-red-600">{result.message}</p>
            <Button variant="outline" onClick={() => navigate("/teacher/classes")} data-testid="button-go-classes">
              Sinflarimga qaytish
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-muted rounded-lg p-3 text-center">
              <p className="text-sm text-muted-foreground">Taklif kodi</p>
              <code className="text-lg font-mono font-bold">{code}</code>
            </div>

            {result?.needsPassword && (
              <div>
                <Label className="flex items-center gap-1.5">
                  <Lock className="w-4 h-4" />
                  Parol
                </Label>
                <Input
                  type="password"
                  placeholder="Parolni kiriting"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1"
                  data-testid="input-join-password"
                />
                {result.message && (
                  <p className="text-xs text-red-500 mt-1">{result.message}</p>
                )}
              </div>
            )}

            <Button
              className="w-full"
              size="lg"
              disabled={joinMutation.isPending}
              onClick={() => joinMutation.mutate()}
              data-testid="button-join-assistant"
            >
              {joinMutation.isPending ? "Qo'shilmoqda..." : result?.needsPassword ? "Parol bilan qo'shilish" : "Qo'shilish"}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
