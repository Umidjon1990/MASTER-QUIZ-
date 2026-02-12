import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { Zap, Mail, Lock, User, ArrowLeft } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { Moon, Sun } from "lucide-react";

export default function AuthPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { theme, toggleTheme } = useTheme();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast({ title: "Email va parolni kiriting", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const body: any = { email, password };
      if (mode === "register") {
        body.firstName = firstName;
        body.lastName = lastName;
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });

      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.message || "Xatolik", variant: "destructive" });
        return;
      }

      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      const profileRes = await fetch("/api/profile", { credentials: "include" });
      const profileData = await profileRes.json();
      toast({ title: mode === "login" ? "Muvaffaqiyatli kirdingiz!" : "Ro'yxatdan o'tdingiz!" });
      if (profileData?.role === "admin") {
        navigate("/admin");
      } else if (profileData?.role === "teacher") {
        navigate("/teacher");
      } else {
        navigate("/student");
      }
    } catch {
      toast({ title: "Xatolik yuz berdi", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      <div className="absolute inset-0 gradient-hero opacity-30" />
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        <Button size="icon" variant="ghost" onClick={toggleTheme} data-testid="button-theme-toggle-auth">
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </Button>
        <Button variant="ghost" onClick={() => navigate("/")} data-testid="button-back-home">
          <ArrowLeft className="w-4 h-4 mr-1" /> Bosh sahifa
        </Button>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-md gradient-purple flex items-center justify-center mx-auto mb-4">
            <Zap className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold" data-testid="text-auth-title">QuizLive</h1>
          <p className="text-muted-foreground mt-1">Interaktiv ta'lim platformasi</p>
        </div>

        <Card className="p-6">
          <div className="flex rounded-md bg-muted p-1 mb-6">
            <button
              onClick={() => setMode("login")}
              className={`flex-1 py-2 text-sm font-medium rounded-sm transition-colors ${mode === "login" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
              data-testid="tab-login"
            >
              Kirish
            </button>
            <button
              onClick={() => setMode("register")}
              className={`flex-1 py-2 text-sm font-medium rounded-sm transition-colors ${mode === "register" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
              data-testid="tab-register"
            >
              Ro'yxatdan o'tish
            </button>
          </div>

          <AnimatePresence mode="wait">
            <motion.form
              key={mode}
              initial={{ opacity: 0, x: mode === "login" ? -10 : 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: mode === "login" ? 10 : -10 }}
              onSubmit={handleSubmit}
              className="space-y-4"
            >
              {mode === "register" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Ism</Label>
                    <div className="relative">
                      <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="Ism"
                        className="pl-9"
                        data-testid="input-first-name"
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Familiya</Label>
                    <Input
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Familiya"
                      data-testid="input-last-name"
                    />
                  </div>
                </div>
              )}

              <div>
                <Label>Email</Label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@example.com"
                    className="pl-9"
                    data-testid="input-email"
                  />
                </div>
              </div>

              <div>
                <Label>Parol</Label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Parolni kiriting"
                    className="pl-9"
                    data-testid="input-password"
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full gradient-purple border-0"
                disabled={loading}
                data-testid="button-submit-auth"
              >
                {loading ? "Yuklanmoqda..." : mode === "login" ? "Kirish" : "Ro'yxatdan o'tish"}
              </Button>
            </motion.form>
          </AnimatePresence>

          <div className="mt-6 p-4 rounded-md bg-muted/50">
            <p className="text-xs font-medium text-muted-foreground mb-2">Test foydalanuvchilar:</p>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between gap-2">
                <span className="font-medium">Admin:</span>
                <span className="font-mono text-muted-foreground">admin@quizlive.uz / admin123</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="font-medium">O'qituvchi:</span>
                <span className="font-mono text-muted-foreground">teacher@quizlive.uz / teacher123</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="font-medium">O'quvchi:</span>
                <span className="font-mono text-muted-foreground">student@quizlive.uz / student123</span>
              </div>
            </div>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
