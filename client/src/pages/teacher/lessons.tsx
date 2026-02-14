import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Plus, Presentation, Trash2, Play, Link2, Copy, FileText, Users, Lock, Unlock, Mic } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { LiveLesson } from "@shared/schema";

export default function TeacherLessons() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [lessonType, setLessonType] = useState<"pdf" | "voice">("pdf");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [requireCode, setRequireCode] = useState(true);
  const [uploading, setUploading] = useState(false);

  const { data: lessons = [], isLoading } = useQuery<LiveLesson[]>({
    queryKey: ["/api/live-lessons"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { title: string; lessonType: string; pdfUrl?: string; pdfFileName?: string; requireCode: boolean }) => {
      const res = await apiRequest("POST", "/api/live-lessons", data);
      return res.json();
    },
    onSuccess: (lesson: LiveLesson) => {
      queryClient.invalidateQueries({ queryKey: ["/api/live-lessons"] });
      setCreateOpen(false);
      setTitle("");
      setPdfFile(null);
      setLessonType("pdf");
      toast({ title: "Dars yaratildi!" });
      navigate(`/teacher/lesson/${lesson.id}`);
    },
    onError: () => {
      toast({ title: "Xatolik", description: "Dars yaratib bo'lmadi", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/live-lessons/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/live-lessons"] });
      toast({ title: "Dars o'chirildi" });
    },
  });

  const handleCreate = async () => {
    if (!title.trim()) return;
    if (lessonType === "pdf" && !pdfFile) return;

    if (lessonType === "voice") {
      createMutation.mutate({
        title: title.trim(),
        lessonType: "voice",
        requireCode,
      });
      return;
    }

    setUploading(true);
    try {
      const urlRes = await apiRequest("POST", "/api/uploads/request-url", {
        name: pdfFile!.name,
        size: pdfFile!.size,
        contentType: pdfFile!.type || "application/pdf",
      });
      const { uploadURL, objectPath } = await urlRes.json();

      await fetch(uploadURL, {
        method: "PUT",
        body: pdfFile,
        headers: { "Content-Type": pdfFile!.type || "application/pdf" },
      });

      createMutation.mutate({
        title: title.trim(),
        lessonType: "pdf",
        pdfUrl: objectPath,
        pdfFileName: pdfFile!.name,
        requireCode,
      });
    } catch {
      toast({ title: "PDF yuklashda xatolik", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const copyLink = (lesson: LiveLesson) => {
    const baseUrl = window.location.origin;
    const link = lesson.requireCode
      ? `${baseUrl}/lesson/join`
      : `${baseUrl}/lesson/join/${lesson.joinCode}`;
    navigator.clipboard.writeText(link);
    toast({ title: "Havola nusxalandi!" });
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({ title: "Kod nusxalandi!" });
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-lessons-title">Jonli Darslar</h1>
            <p className="text-sm text-muted-foreground">PDF prezentatsiya yoki ovozli suhbat bilan jonli dars o'tkazing</p>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-lesson">
                <Plus className="w-4 h-4 mr-2" /> Yangi dars
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Yangi jonli dars yaratish</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>Dars nomi</Label>
                  <Input
                    placeholder="Masalan: Matematika 5-dars"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    data-testid="input-lesson-title"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Dars turi</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={lessonType === "pdf" ? "default" : "outline"}
                      className="flex-1 toggle-elevate"
                      onClick={() => setLessonType("pdf")}
                      data-testid="button-type-pdf"
                    >
                      <Presentation className="w-4 h-4 mr-2" /> PDF dars
                    </Button>
                    <Button
                      type="button"
                      variant={lessonType === "voice" ? "default" : "outline"}
                      className="flex-1 toggle-elevate"
                      onClick={() => setLessonType("voice")}
                      data-testid="button-type-voice"
                    >
                      <Mic className="w-4 h-4 mr-2" /> Ovozli dars
                    </Button>
                  </div>
                </div>
                {lessonType === "pdf" && (
                  <div className="space-y-2">
                    <Label>PDF fayl</Label>
                    <Input
                      type="file"
                      accept=".pdf"
                      onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                      data-testid="input-lesson-pdf"
                    />
                    {pdfFile && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <FileText className="w-3 h-3" /> {pdfFile.name}
                      </p>
                    )}
                  </div>
                )}
                {lessonType === "voice" && (
                  <div className="rounded-md bg-muted p-3">
                    <p className="text-sm text-muted-foreground">
                      Ovozli dars rejimida PDF talab qilinmaydi. Siz mikrofonni yoqib, jonli suhbat o'tkazasiz.
                    </p>
                  </div>
                )}
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <Label>Kirish kodi talab qilinsinmi?</Label>
                    <p className="text-xs text-muted-foreground">
                      {requireCode ? "O'quvchilar 6 raqamli kodni kiritishi kerak" : "Havola orqali to'g'ridan-to'g'ri kirish"}
                    </p>
                  </div>
                  <Switch
                    checked={requireCode}
                    onCheckedChange={setRequireCode}
                    data-testid="switch-require-code"
                  />
                </div>
                <Button
                  onClick={handleCreate}
                  disabled={!title.trim() || (lessonType === "pdf" && !pdfFile) || uploading || createMutation.isPending}
                  className="w-full"
                  data-testid="button-submit-lesson"
                >
                  {uploading ? "PDF yuklanmoqda..." : createMutation.isPending ? "Yaratilmoqda..." : "Yaratish"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </motion.div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2].map((i) => (
            <Card key={i} className="p-5 animate-pulse">
              <div className="h-5 bg-muted rounded w-2/3 mb-3" />
              <div className="h-4 bg-muted rounded w-1/3" />
            </Card>
          ))}
        </div>
      ) : lessons.length === 0 ? (
        <Card className="p-10 text-center">
          <Presentation className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">Hali jonli dars yo'q</p>
          <p className="text-sm text-muted-foreground mt-1">Yangi dars yarating va o'quvchilaringiz bilan ulashing</p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {lessons.map((lesson, i) => (
            <motion.div
              key={lesson.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="p-5 space-y-3 hover-elevate">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold truncate" data-testid={`text-lesson-title-${lesson.id}`}>
                      {lesson.title}
                    </h3>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      {lesson.lessonType === "voice" ? (
                        <><Mic className="w-3 h-3" /> Ovozli dars</>
                      ) : lesson.pdfFileName ? (
                        <><FileText className="w-3 h-3" /> {lesson.pdfFileName}</>
                      ) : (
                        <><Presentation className="w-3 h-3" /> PDF dars</>
                      )}
                    </p>
                  </div>
                  <Badge
                    variant={lesson.status === "active" ? "default" : lesson.status === "ended" ? "secondary" : "outline"}
                    data-testid={`badge-lesson-status-${lesson.id}`}
                  >
                    {lesson.status === "active" ? "Jonli" : lesson.status === "ended" ? "Tugagan" : "Kutilmoqda"}
                  </Badge>
                </div>

                <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1">
                    {lesson.requireCode ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                    {lesson.requireCode ? "Kodli" : "Kodsiz"}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" /> {lesson.participantCount} qatnashchi
                  </span>
                  {lesson.requireCode && (
                    <button
                      onClick={() => copyCode(lesson.joinCode)}
                      className="flex items-center gap-1 font-mono text-foreground"
                      data-testid={`button-copy-code-${lesson.id}`}
                    >
                      {lesson.joinCode} <Copy className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {lesson.status !== "ended" && (
                    <Button
                      size="sm"
                      onClick={() => navigate(`/teacher/lesson/${lesson.id}`)}
                      data-testid={`button-open-lesson-${lesson.id}`}
                    >
                      <Play className="w-3 h-3 mr-1" />
                      {lesson.status === "active" ? "Davom ettirish" : "Boshlash"}
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => copyLink(lesson)} data-testid={`button-copy-link-${lesson.id}`}>
                    <Link2 className="w-3 h-3 mr-1" /> Havola
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteMutation.mutate(lesson.id)}
                    data-testid={`button-delete-lesson-${lesson.id}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
