import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Copy, GraduationCap, Users, UserMinus } from "lucide-react";
import type { Class } from "@shared/schema";

interface ClassMemberInfo {
  id: string;
  userId: string;
  userName?: string;
  joinedAt?: string;
}

export default function TeacherClasses() {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const { data: classes, isLoading } = useQuery<Class[]>({
    queryKey: ["/api/classes"],
  });

  const { data: members, isLoading: membersLoading } = useQuery<ClassMemberInfo[]>({
    queryKey: ["/api/classes", selectedClassId, "members"],
    queryFn: async () => {
      const res = await fetch(`/api/classes/${selectedClassId}/members`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!selectedClassId && membersOpen,
  });

  const createClass = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/classes"] });
      toast({ title: "Sinf yaratildi!" });
      setCreateOpen(false);
      setName("");
      setDescription("");
    },
    onError: () => {
      toast({ title: "Sinf yaratishda xatolik", variant: "destructive" });
    },
  });

  const deleteClass = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/classes/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/classes"] });
      toast({ title: "Sinf o'chirildi" });
    },
  });

  const removeMember = useMutation({
    mutationFn: async ({ classId, userId }: { classId: string; userId: string }) => {
      const res = await fetch(`/api/classes/${classId}/members/${userId}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/classes", selectedClassId, "members"] });
      toast({ title: "A'zo chiqarildi" });
    },
  });

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({ title: "Kod nusxalandi!" });
  };

  const handleViewMembers = (id: string) => {
    setSelectedClassId(id);
    setMembersOpen(true);
  };

  return (
    <div className="p-6 space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-classes-title">Sinflarim</h1>
          <p className="text-muted-foreground">Sinflar va guruhlarni boshqarish</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gradient-purple border-0" data-testid="button-new-class">
              <Plus className="w-4 h-4 mr-1" /> Yangi Sinf
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Yangi Sinf Yaratish</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Sinf nomi</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Masalan: 5-A sinf" data-testid="input-class-name" />
              </div>
              <div>
                <Label>Tavsif (ixtiyoriy)</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Sinf haqida qisqacha..." data-testid="input-class-description" />
              </div>
              <Button
                className="gradient-purple border-0 w-full"
                onClick={() => createClass.mutate()}
                disabled={!name.trim() || createClass.isPending}
                data-testid="button-create-class"
              >
                Yaratish
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </motion.div>

      {isLoading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-5">
              <Skeleton className="h-5 w-3/4 mb-3" />
              <Skeleton className="h-4 w-1/2 mb-4" />
              <Skeleton className="h-9 w-full" />
            </Card>
          ))}
        </div>
      ) : classes && classes.length > 0 ? (
        <motion.div
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
          className="grid md:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {classes.map((c) => (
            <motion.div key={c.id} variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}>
              <Card className="p-5 hover-elevate" data-testid={`card-class-${c.id}`}>
                <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
                  <h3 className="font-semibold" data-testid={`text-class-name-${c.id}`}>{c.name}</h3>
                  <Badge variant="secondary">
                    <GraduationCap className="w-3 h-3 mr-1" /> Sinf
                  </Badge>
                </div>
                {c.description && (
                  <p className="text-sm text-muted-foreground mb-3 line-clamp-2" data-testid={`text-class-desc-${c.id}`}>{c.description}</p>
                )}
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <span className="text-sm text-muted-foreground">Kod:</span>
                  <Badge variant="outline" data-testid={`badge-join-code-${c.id}`}>{c.joinCode}</Badge>
                  <Button variant="ghost" size="icon" onClick={() => handleCopyCode(c.joinCode)} data-testid={`button-copy-code-${c.id}`}>
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" size="sm" onClick={() => handleViewMembers(c.id)} data-testid={`button-view-members-${c.id}`}>
                    <Users className="w-3 h-3 mr-1" /> A'zolar
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => deleteClass.mutate(c.id)} data-testid={`button-delete-class-${c.id}`}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      ) : (
        <Card className="p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <GraduationCap className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-lg mb-2">Sinflar yo'q</h3>
          <p className="text-muted-foreground mb-4">Birinchi sinfingizni yarating!</p>
          <Button className="gradient-purple border-0" onClick={() => setCreateOpen(true)} data-testid="button-first-class">
            <Plus className="w-4 h-4 mr-1" /> Yangi Sinf
          </Button>
        </Card>
      )}

      <Dialog open={membersOpen} onOpenChange={(open) => { setMembersOpen(open); if (!open) setSelectedClassId(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Sinf a'zolari</DialogTitle>
          </DialogHeader>
          {membersLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : members && members.length > 0 ? (
            <div className="space-y-2 max-h-80 overflow-auto">
              {members.map((m) => (
                <Card key={m.id} className="p-3" data-testid={`card-member-${m.id}`}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <p className="font-medium text-sm" data-testid={`text-member-name-${m.id}`}>{m.userName || "Foydalanuvchi"}</p>
                      {m.joinedAt && (
                        <p className="text-xs text-muted-foreground">
                          {new Date(m.joinedAt).toLocaleDateString("uz-UZ")}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => selectedClassId && removeMember.mutate({ classId: selectedClassId, userId: m.userId })}
                      data-testid={`button-remove-member-${m.id}`}
                    >
                      <UserMinus className="w-4 h-4" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-6">Hali a'zolar yo'q</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
