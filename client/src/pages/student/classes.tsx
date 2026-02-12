import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, GraduationCap, Users } from "lucide-react";
import type { Class } from "@shared/schema";

export default function StudentClasses() {
  const { toast } = useToast();
  const [joinOpen, setJoinOpen] = useState(false);
  const [code, setCode] = useState("");

  const { data: classes, isLoading } = useQuery<Class[]>({
    queryKey: ["/api/classes"],
  });

  const joinClass = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/classes/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Xatolik");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/classes"] });
      toast({ title: "Sinfga qo'shildingiz!" });
      setJoinOpen(false);
      setCode("");
    },
    onError: (error: any) => {
      toast({ title: error.message || "Sinfga qo'shilishda xatolik", variant: "destructive" });
    },
  });

  return (
    <div className="p-6 space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-student-classes-title">Sinflarim</h1>
          <p className="text-muted-foreground">Qo'shilgan sinflaringiz</p>
        </div>
        <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
          <DialogTrigger asChild>
            <Button className="gradient-teal border-0" data-testid="button-join-class">
              <Plus className="w-4 h-4 mr-1" /> Sinfga Qo'shilish
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Sinfga Qo'shilish</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Sinf kodi</Label>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Kodni kiriting..."
                  data-testid="input-join-code"
                />
              </div>
              <Button
                className="gradient-teal border-0 w-full"
                onClick={() => joinClass.mutate()}
                disabled={!code.trim() || joinClass.isPending}
                data-testid="button-submit-join"
              >
                Qo'shilish
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
              <Card className="p-5 hover-elevate" data-testid={`card-student-class-${c.id}`}>
                <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
                  <h3 className="font-semibold" data-testid={`text-class-name-${c.id}`}>{c.name}</h3>
                  <Badge variant="secondary">
                    <GraduationCap className="w-3 h-3 mr-1" /> Sinf
                  </Badge>
                </div>
                {c.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2" data-testid={`text-class-desc-${c.id}`}>{c.description}</p>
                )}
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
          <p className="text-muted-foreground mb-4">Sinf kodini kiritib qo'shiling!</p>
          <Button className="gradient-teal border-0" onClick={() => setJoinOpen(true)} data-testid="button-first-join">
            <Plus className="w-4 h-4 mr-1" /> Sinfga Qo'shilish
          </Button>
        </Card>
      )}
    </div>
  );
}
