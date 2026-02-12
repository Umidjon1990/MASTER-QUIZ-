import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Shield, GraduationCap, User, Plus, Calendar, Key, Power, Clock, Mail, Lock, UserPlus } from "lucide-react";

interface AdminUser {
  id: string;
  userId: string;
  role: string;
  displayName: string | null;
  plan: string;
  quizLimit: number;
  bio: string | null;
  subscriptionExpiresAt: string | null;
  isActive: boolean;
  createdAt: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
}

export default function AdminUsers() {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [subDialogUser, setSubDialogUser] = useState<AdminUser | null>(null);
  const [pwdDialogUser, setPwdDialogUser] = useState<AdminUser | null>(null);

  const { data: users, isLoading } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
  });

  const updateRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update role");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Rol yangilandi" });
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      const res = await fetch(`/api/admin/users/${userId}/subscription`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Holat yangilandi" });
    },
  });

  const roleIcon = (role: string) => {
    if (role === "admin") return Shield;
    if (role === "teacher") return GraduationCap;
    return User;
  };

  const roleColor = (role: string) => {
    if (role === "admin") return "gradient-pink";
    if (role === "teacher") return "gradient-purple";
    return "gradient-teal";
  };

  const getSubscriptionStatus = (u: AdminUser) => {
    if (!u.subscriptionExpiresAt) return { label: "Cheksiz", variant: "secondary" as const };
    const exp = new Date(u.subscriptionExpiresAt);
    const now = new Date();
    const daysLeft = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) return { label: "Muddati o'tgan", variant: "destructive" as const };
    if (daysLeft <= 7) return { label: `${daysLeft} kun qoldi`, variant: "destructive" as const };
    if (daysLeft <= 30) return { label: `${daysLeft} kun qoldi`, variant: "secondary" as const };
    return { label: `${daysLeft} kun qoldi`, variant: "secondary" as const };
  };

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("uz-UZ", { year: "numeric", month: "short", day: "numeric" });
  };

  return (
    <div className="p-6 space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-users-title">Foydalanuvchilar</h1>
          <p className="text-muted-foreground">Barcha foydalanuvchilarni boshqarish</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-user">
              <Plus className="w-4 h-4 mr-1" /> Yangi foydalanuvchi
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Yangi foydalanuvchi yaratish</DialogTitle>
            </DialogHeader>
            <CreateUserForm onSuccess={() => { setCreateOpen(false); queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] }); }} />
          </DialogContent>
        </Dialog>
      </motion.div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-4">
              <div className="flex items-center gap-3">
                <Skeleton className="w-10 h-10 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-32 mb-2" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <motion.div
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
          className="space-y-3"
        >
          {users?.map((u) => {
            const Icon = roleIcon(u.role);
            const sub = getSubscriptionStatus(u);
            return (
              <motion.div key={u.id} variants={{ hidden: { opacity: 0, x: -10 }, show: { opacity: 1, x: 0 } }}>
                <Card className="p-4" data-testid={`card-user-${u.id}`}>
                  <div className="flex items-start gap-3 flex-wrap">
                    <Avatar className="w-10 h-10 shrink-0">
                      <AvatarFallback className={`${roleColor(u.role)} text-white text-sm`}>
                        <Icon className="w-4 h-4" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium">{u.displayName || "Noma'lum"}</p>
                        {!u.isActive && <Badge variant="destructive">Nofaol</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground">{u.email || "—"}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className="text-xs">
                          <Clock className="w-3 h-3 mr-1" />
                          {sub.label}
                        </Badge>
                        {u.subscriptionExpiresAt && (
                          <span className="text-xs text-muted-foreground">
                            {formatDate(u.subscriptionExpiresAt)} gacha
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Select
                        value={u.role}
                        onValueChange={(role) => updateRole.mutate({ userId: u.userId, role })}
                      >
                        <SelectTrigger className="w-[130px]" data-testid={`select-role-${u.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="teacher">O'qituvchi</SelectItem>
                          <SelectItem value="student">O'quvchi</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setSubDialogUser(u)}
                        data-testid={`button-subscription-${u.id}`}
                        title="Obuna muddati"
                      >
                        <Calendar className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setPwdDialogUser(u)}
                        data-testid={`button-password-${u.id}`}
                        title="Parolni o'zgartirish"
                      >
                        <Key className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant={u.isActive ? "ghost" : "destructive"}
                        onClick={() => toggleActive.mutate({ userId: u.userId, isActive: !u.isActive })}
                        data-testid={`button-toggle-${u.id}`}
                        title={u.isActive ? "Faolsizlantirish" : "Faollashtirish"}
                      >
                        <Power className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      <Dialog open={!!subDialogUser} onOpenChange={() => setSubDialogUser(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Obuna muddatini belgilash</DialogTitle>
          </DialogHeader>
          {subDialogUser && (
            <SubscriptionForm
              user={subDialogUser}
              onSuccess={() => {
                setSubDialogUser(null);
                queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!pwdDialogUser} onOpenChange={() => setPwdDialogUser(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Parolni o'zgartirish</DialogTitle>
          </DialogHeader>
          {pwdDialogUser && (
            <PasswordForm
              user={pwdDialogUser}
              onSuccess={() => {
                setPwdDialogUser(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreateUserForm({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState("student");
  const [plan, setPlan] = useState("free");
  const [subscriptionDays, setSubscriptionDays] = useState("30");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast({ title: "Email va parolni kiriting", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          firstName,
          lastName,
          role,
          displayName: `${firstName} ${lastName}`.trim() || email,
          plan,
          quizLimit: role === "admin" ? 999 : role === "teacher" ? 50 : 5,
          subscriptionDays: Number(subscriptionDays),
        }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.message || "Xatolik", variant: "destructive" });
        return;
      }
      toast({ title: "Foydalanuvchi yaratildi" });
      onSuccess();
    } catch {
      toast({ title: "Xatolik yuz berdi", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Ism</Label>
          <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Ism" data-testid="input-create-firstname" />
        </div>
        <div>
          <Label>Familiya</Label>
          <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Familiya" data-testid="input-create-lastname" />
        </div>
      </div>
      <div>
        <Label>Email</Label>
        <div className="relative">
          <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" className="pl-9" data-testid="input-create-email" />
        </div>
      </div>
      <div>
        <Label>Parol</Label>
        <div className="relative">
          <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Parol" className="pl-9" data-testid="input-create-password" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Rol</Label>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger data-testid="select-create-role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="teacher">O'qituvchi</SelectItem>
              <SelectItem value="student">O'quvchi</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Tarif</Label>
          <Select value={plan} onValueChange={setPlan}>
            <SelectTrigger data-testid="select-create-plan">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="free">Bepul</SelectItem>
              <SelectItem value="basic">Asosiy</SelectItem>
              <SelectItem value="premium">Premium</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label>Obuna muddati (kunlar)</Label>
        <div className="relative">
          <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input type="number" value={subscriptionDays} onChange={(e) => setSubscriptionDays(e.target.value)} placeholder="30" className="pl-9" min="1" data-testid="input-create-days" />
        </div>
      </div>
      <Button type="submit" className="w-full" disabled={loading} data-testid="button-submit-create-user">
        <UserPlus className="w-4 h-4 mr-1" />
        {loading ? "Yaratilmoqda..." : "Foydalanuvchi yaratish"}
      </Button>
    </form>
  );
}

function SubscriptionForm({ user, onSuccess }: { user: AdminUser; onSuccess: () => void }) {
  const { toast } = useToast();
  const [days, setDays] = useState("30");
  const [plan, setPlan] = useState(user.plan);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${user.userId}/subscription`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionDays: Number(days), plan }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Obuna yangilandi" });
      onSuccess();
    } catch {
      toast({ title: "Xatolik", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-muted-foreground">{user.displayName} ({user.email})</p>
      <div>
        <Label>Obuna muddati (kunlar)</Label>
        <Input type="number" value={days} onChange={(e) => setDays(e.target.value)} min="1" data-testid="input-sub-days" />
      </div>
      <div>
        <Label>Tarif</Label>
        <Select value={plan} onValueChange={setPlan}>
          <SelectTrigger data-testid="select-sub-plan">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="free">Bepul</SelectItem>
            <SelectItem value="basic">Asosiy</SelectItem>
            <SelectItem value="premium">Premium</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" className="w-full" disabled={loading} data-testid="button-submit-subscription">
        {loading ? "Saqlanmoqda..." : "Saqlash"}
      </Button>
    </form>
  );
}

function PasswordForm({ user, onSuccess }: { user: AdminUser; onSuccess: () => void }) {
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || password.length < 4) {
      toast({ title: "Parol kamida 4 ta belgidan iborat bo'lishi kerak", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${user.userId}/password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Parol yangilandi" });
      onSuccess();
    } catch {
      toast({ title: "Xatolik", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-muted-foreground">{user.displayName} ({user.email})</p>
      <div>
        <Label>Yangi parol</Label>
        <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Yangi parol" data-testid="input-new-password" />
      </div>
      <Button type="submit" className="w-full" disabled={loading} data-testid="button-submit-password">
        {loading ? "Saqlanmoqda..." : "Parolni o'zgartirish"}
      </Button>
    </form>
  );
}
