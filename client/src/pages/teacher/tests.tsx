import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { BookOpen, ChevronDown, Clock, FolderOpen, Loader2, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { errorMessage } from "@/lib/teacher-access";

export type PanelQuiz = {
  id: string;
  title: string;
  description: string | null;
  totalQuestions: number;
  timerEnabled: boolean;
  timePerQuestion: number;
};
type Folder = { id: string; name: string; quizzes: PanelQuiz[] };

export function quizMeta(q: Pick<PanelQuiz, "totalQuestions" | "timerEnabled" | "timePerQuestion">) {
  return `${q.totalQuestions} ta savol · ${q.timerEnabled ? `har biriga ${q.timePerQuestion} soniya` : "vaqt cheklanmagan"}`;
}

/** O'qituvchining "Quizlar" bo'limi: tayyor quizlar papkalarda, alohida tab — o'z testlari (bo'lsa). */
export default function TeacherTests() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [tab, setTab] = useState<"library" | "mine">("library");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const library = useQuery<{ folders: Folder[] }>({ queryKey: ["/api/teacher-panel/library"], staleTime: 60_000 });
  const mine = useQuery<{ folders: Folder[] }>({ queryKey: ["/api/teacher-panel/mine"], staleTime: 60_000 });
  const hasMine = !!mine.data?.folders.length;
  const source = tab === "mine" && hasMine ? mine : library;

  const openLibrary = useMutation({
    mutationFn: async (quizId: string) =>
      (await apiRequest("POST", `/api/teacher-panel/library/${quizId}/open`)).json() as Promise<{ quizId: string }>,
    onSuccess: (data) => navigate(`/teacher/test/${data.quizId}`),
    onError: (e) => toast({ title: "Test ochilmadi", description: errorMessage(e), variant: "destructive" }),
  });

  const term = search.trim().toLocaleLowerCase("uz");
  const folders = useMemo(() => {
    const list = source.data?.folders || [];
    if (!term) return list;
    return list
      .map((f) => ({
        ...f,
        quizzes: f.name.toLocaleLowerCase("uz").includes(term)
          ? f.quizzes
          : f.quizzes.filter((q) => q.title.toLocaleLowerCase("uz").includes(term)),
      }))
      .filter((f) => f.quizzes.length);
  }, [source.data, term]);
  const total = (source.data?.folders || []).reduce((n, f) => n + f.quizzes.length, 0);

  function choose(q: PanelQuiz) {
    if (tab === "mine" && hasMine) navigate(`/teacher/test/${q.id}`);
    else openLibrary.mutate(q.id);
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-tests-title">Quizlar</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Testni tanlang — keyin uni sinfda jonli o‘tkazishingiz, havola bilan yuborishingiz yoki vaqtini belgilashingiz mumkin.
        </p>
      </div>

      {hasMine && (
        <div className="inline-flex rounded-lg border p-1 bg-muted/40" role="tablist">
          {(
            [
              ["library", "Tayyor quizlar"],
              ["mine", "Mening quizlarim"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === id ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {total > 6 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Test yoki papka nomi bo‘yicha qidirish" className="pl-9" data-testid="input-search-tests" />
        </div>
      )}

      {source.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : source.isError ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Ro‘yxatni yuklab bo‘lmadi.{" "}
          <Button variant="ghost" size="sm" className="px-1 underline" onClick={() => source.refetch()}>
            Qayta urinish
          </Button>
        </Card>
      ) : !folders.length ? (
        <Card className="p-10 text-center">
          <BookOpen className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
          <h2 className="font-semibold">{term ? "Hech narsa topilmadi" : "Hozircha tayyor quizlar yo‘q"}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {term ? "Boshqa so‘z bilan qidirib ko‘ring." : "Administrator testlarni joylashi bilan ular shu yerda papkalarda chiqadi."}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {folders.map((f, i) => {
            const expanded = term ? true : (open[f.id] ?? i === 0);
            return (
              <Card key={f.id} className="overflow-hidden">
                <button
                  className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/40 transition-colors"
                  onClick={() => setOpen((o) => ({ ...o, [f.id]: !expanded }))}
                  aria-expanded={expanded}
                  data-testid={`folder-${f.id}`}
                >
                  <FolderOpen className="w-5 h-5 text-purple-600 shrink-0" />
                  <span className="font-semibold flex-1">{f.name}</span>
                  <span className="text-xs text-muted-foreground">{f.quizzes.length} ta test</span>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
                </button>
                {expanded && (
                  <ul className="border-t divide-y">
                    {f.quizzes.map((q) => {
                      const busy = openLibrary.isPending && openLibrary.variables === q.id;
                      return (
                        <li key={q.id}>
                          <button
                            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors disabled:opacity-60"
                            onClick={() => choose(q)}
                            disabled={openLibrary.isPending}
                            data-testid={`quiz-${q.id}`}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{q.title}</p>
                              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                <Clock className="w-3 h-3" /> {quizMeta(q)}
                              </p>
                            </div>
                            {busy ? (
                              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                            ) : (
                              <span className="text-sm font-medium text-purple-700 dark:text-purple-300">Ochish →</span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
