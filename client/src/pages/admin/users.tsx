import { useQuery, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Shield, GraduationCap, User } from "lucide-react";
import type { UserProfile } from "@shared/schema";

export default function AdminUsers() {
  const { toast } = useToast();
  const { data: users, isLoading } = useQuery<UserProfile[]>({
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

  return (
    <div className="p-6 space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold" data-testid="text-users-title">Foydalanuvchilar</h1>
        <p className="text-muted-foreground">Barcha foydalanuvchilarni boshqarish</p>
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
            return (
              <motion.div key={u.id} variants={{ hidden: { opacity: 0, x: -10 }, show: { opacity: 1, x: 0 } }}>
                <Card className="p-4" data-testid={`card-user-${u.id}`}>
                  <div className="flex items-center gap-3 flex-wrap">
                    <Avatar className="w-10 h-10">
                      <AvatarFallback className={`${roleColor(u.role)} text-white text-sm`}>
                        <Icon className="w-4 h-4" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{u.displayName || "Noma'lum"}</p>
                      <p className="text-sm text-muted-foreground">ID: {u.userId.slice(0, 8)}...</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary">{u.plan}</Badge>
                      <Select
                        value={u.role}
                        onValueChange={(role) => updateRole.mutate({ userId: u.userId, role })}
                      >
                        <SelectTrigger className="w-[140px]" data-testid={`select-role-${u.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="teacher">O'qituvchi</SelectItem>
                          <SelectItem value="student">O'quvchi</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
