import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BookOpen, FileCheck2, FileUp, Library, Search, ShieldCheck, UserRoundCog } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

type Book = { id: string; title: string; author: string | null; category: string | null; subject: string | null; level: string | null; status: string; pageCount: number; fileSize: number; createdAt: string };
type User = { userId: string; role: string; displayName: string | null; email: string | null; firstName: string | null; lastName: string | null };
type Assignment = { id: string; bookId: string; maxOpens: number | null; usedOpens: number; startsAt: string | null; expiresAt: string | null; status: string };
type AuditLog = { id: string; action: string; result: string; reason: string | null; bookId: string | null; teacherId: string | null; createdAt: string };
type BookResponse = { books: Book[]; storage: { configured: boolean; provider: string; maxPdfMb: number } };

async function errorMessage(response: Response) {
  try { return (await response.json()).message || "Amal bajarilmadi"; } catch { return "Amal bajarilmadi"; }
}

export default function AdminLibrary() {
  const { toast } = useToast();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedTeacher, setSelectedTeacher] = useState("");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Record<string, { selected: boolean; maxOpens: string; expiresAt: string; usedOpens: number }>>({});

  const { data, isLoading } = useQuery<BookResponse>({ queryKey: ["/api/admin/library/books"] });
  const { data: auditLogs = [] } = useQuery<AuditLog[]>({ queryKey: ["/api/admin/library/audit"] });
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["/api/admin/users"] });
  const teachers = users.filter(user => user.role === "teacher");
  const books = data?.books || [];
  const shownBooks = useMemo(() => books.filter(book => `${book.title} ${book.author || ""} ${book.category || ""}`.toLowerCase().includes(search.toLowerCase())), [books, search]);

  const { data: assignments = [] } = useQuery<Assignment[]>({
    queryKey: ["/api/admin/library/assignments", selectedTeacher],
    queryFn: async () => {
      const response = await fetch(`/api/admin/library/assignments/${selectedTeacher}`, { credentials: "include" });
      if (!response.ok) throw new Error(await errorMessage(response));
      const rows = await response.json();
      const map: typeof draft = {};
      for (const book of books) {
        const current = rows.find((item: Assignment) => item.bookId === book.id && item.status === "active");
        map[book.id] = { selected: !!current, maxOpens: current?.maxOpens?.toString() || "", expiresAt: current?.expiresAt?.slice(0, 10) || "", usedOpens: current?.usedOpens || 0 };
      }
      setDraft(map);
      return rows;
    },
    enabled: !!selectedTeacher && assignOpen && books.length > 0,
  });

  const upload = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      const response = await fetch("/api/admin/library/books", { method: "POST", body: new FormData(form), credentials: "include" });
      if (!response.ok) throw new Error(await errorMessage(response));
      return response.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/library/books"] }); queryClient.invalidateQueries({ queryKey: ["/api/admin/library/audit"] }); setUploadOpen(false); toast({ title: "Kitob xavfsiz kutubxonaga yuklandi" }); },
    onError: (error: Error) => toast({ title: "Yuklashda xatolik", description: error.message, variant: "destructive" }),
  });

  const saveAssignments = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/admin/library/assignments/${selectedTeacher}`, {
        method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignments: Object.entries(draft).filter(([, value]) => value.selected).map(([bookId, value]) => ({ bookId, maxOpens: value.maxOpens || null, expiresAt: value.expiresAt || null })) }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      return response.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/library/assignments", selectedTeacher] }); queryClient.invalidateQueries({ queryKey: ["/api/admin/library/audit"] }); setAssignOpen(false); toast({ title: "O'qituvchi kutubxonasi yangilandi" }); },
    onError: (error: Error) => toast({ title: "Saqlanmadi", description: error.message, variant: "destructive" }),
  });

  const toggleArchive = useMutation({
    mutationFn: async (book: Book) => {
      const response = await fetch(`/api/admin/library/books/${book.id}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: book.status === "active" ? "archived" : "active" }) });
      if (!response.ok) throw new Error(await errorMessage(response));
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/library/books"] }); queryClient.invalidateQueries({ queryKey: ["/api/admin/library/audit"] }); },
  });

  return <div className="p-4 md:p-6 space-y-6">
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
      <div><h1 className="text-2xl font-bold flex items-center gap-2"><Library className="w-7 h-7 text-purple-600" /> Xavfsiz kutubxona</h1><p className="text-muted-foreground mt-1">PDF manbalar, o'qituvchi ruxsatlari va kirish limitlarini boshqarish</p></div>
      <div className="flex gap-2 flex-wrap"><Button variant="outline" onClick={() => setAssignOpen(true)}><UserRoundCog className="w-4 h-4 mr-2" /> O'qituvchiga biriktirish</Button><Button onClick={() => setUploadOpen(true)}><FileUp className="w-4 h-4 mr-2" /> PDF yuklash</Button></div>
    </div>

    <div className="grid md:grid-cols-3 gap-4">
      <Card className="p-4"><div className="flex items-center gap-3"><div className="p-2.5 rounded-xl bg-purple-100 dark:bg-purple-950"><BookOpen className="text-purple-600" /></div><div><p className="text-2xl font-bold">{books.length}</p><p className="text-sm text-muted-foreground">Jami kitoblar</p></div></div></Card>
      <Card className="p-4"><div className="flex items-center gap-3"><div className="p-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-950"><FileCheck2 className="text-emerald-600" /></div><div><p className="text-2xl font-bold">{books.filter(b => b.status === "active").length}</p><p className="text-sm text-muted-foreground">Faol manbalar</p></div></div></Card>
      <Card className="p-4"><div className="flex items-center gap-3"><div className="p-2.5 rounded-xl bg-blue-100 dark:bg-blue-950"><ShieldCheck className="text-blue-600" /></div><div><p className="font-bold">{data?.storage.configured ? "Himoyalangan" : "Sozlash kerak"}</p><p className="text-sm text-muted-foreground">{data?.storage.provider || "Private storage"}</p></div></div></Card>
    </div>

    <Card className="p-4">
      <div className="relative max-w-md mb-4"><Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" /><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Kitob, muallif yoki kategoriya..." className="pl-9" /></div>
      {isLoading ? <p className="text-muted-foreground py-10 text-center">Yuklanmoqda...</p> : shownBooks.length === 0 ? <div className="text-center py-14"><Library className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" /><p className="font-medium">Hozircha kitob yo'q</p><p className="text-sm text-muted-foreground">Birinchi himoyalangan PDF manbani yuklang</p></div> : <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{shownBooks.map(book => <Card key={book.id} className="p-4 border-l-4 border-l-purple-500">
        <div className="flex justify-between gap-3"><div className="min-w-0"><h3 className="font-semibold truncate">{book.title}</h3><p className="text-sm text-muted-foreground truncate">{book.author || "Muallif kiritilmagan"}</p></div><Badge variant={book.status === "active" ? "default" : "secondary"}>{book.status === "active" ? "Faol" : "Arxiv"}</Badge></div>
        <div className="flex flex-wrap gap-2 mt-4 text-xs"><Badge variant="outline">{book.pageCount} sahifa</Badge>{book.category && <Badge variant="outline">{book.category}</Badge>}{book.level && <Badge variant="outline">{book.level}</Badge>}</div>
        <div className="flex items-center justify-between mt-4"><span className="text-xs text-muted-foreground">{(book.fileSize / 1024 / 1024).toFixed(1)} MB</span><Button size="sm" variant="ghost" onClick={() => toggleArchive.mutate(book)}>{book.status === "active" ? "Arxivlash" : "Faollashtirish"}</Button></div>
      </Card>)}</div>}
    </Card>

    <Card className="p-4"><div className="flex items-center justify-between mb-4"><div><h2 className="font-semibold">So'nggi xavfsizlik jurnali</h2><p className="text-xs text-muted-foreground">Yuklash, biriktirish, ochish va rad etilgan urinishlar</p></div><Badge variant="outline">{auditLogs.length} yozuv</Badge></div>{auditLogs.length === 0 ? <p className="text-sm text-muted-foreground py-4">Hozircha jurnal yozuvi yo'q.</p> : <div className="divide-y max-h-72 overflow-y-auto">{auditLogs.slice(0, 30).map(log => <div key={log.id} className="py-2.5 flex items-center justify-between gap-3 text-sm"><div className="min-w-0"><p className="font-medium truncate">{({ "book.upload": "PDF yuklandi", "book.update": "Kitob yangilandi", "assignment.initial": "Yangi o'qituvchiga kutubxona berildi", "assignment.replace": "Ruxsatlar yangilandi", "view.session_created": "Ko'rish sessiyasi yaratildi", "view.open": "Kitob ochildi", "view.denied": "Kirish rad etildi", "view.error": "Ko'rish xatosi" } as Record<string, string>)[log.action] || log.action}</p><p className="text-xs text-muted-foreground truncate">{log.reason || `${new Date(log.createdAt).toLocaleString("uz-UZ")}`}</p></div><Badge variant={log.result === "success" ? "secondary" : "destructive"}>{log.result === "success" ? "Muvaffaqiyatli" : "Rad etildi"}</Badge></div>)}</div>}</Card>

    <Dialog open={uploadOpen} onOpenChange={setUploadOpen}><DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Yangi PDF manba yuklash</DialogTitle></DialogHeader>
      <form className="grid md:grid-cols-2 gap-4" onSubmit={event => { event.preventDefault(); upload.mutate(event.currentTarget); }}>
        <div className="md:col-span-2 rounded-lg border border-dashed p-5 bg-muted/30"><Label htmlFor="pdf">PDF fayl *</Label><Input id="pdf" name="pdf" type="file" accept="application/pdf,.pdf" required className="mt-2" /><p className="text-xs text-muted-foreground mt-2">Maksimal {data?.storage.maxPdfMb || 100} MB. Fayl turi, ichki PDF imzosi va dublikat nazorati tekshiriladi.</p></div>
        <div><Label>Kitob nomi *</Label><Input name="title" required className="mt-1" /></div><div><Label>Muallif</Label><Input name="author" className="mt-1" /></div>
        <div><Label>Kategoriya</Label><Input name="category" placeholder="Arab tili" className="mt-1" /></div><div><Label>Fan</Label><Input name="subject" className="mt-1" /></div>
        <div><Label>Daraja</Label><Input name="level" placeholder="A1, B2..." className="mt-1" /></div><div><Label>Til</Label><Input name="language" defaultValue="uz" className="mt-1" /></div>
        <div><Label>Huquq egasi</Label><Input name="copyrightOwner" className="mt-1" /></div><div><Label>Litsenziya tugashi</Label><Input name="licensedUntil" type="date" className="mt-1" /></div>
        <div className="md:col-span-2"><Label>Tavsif</Label><textarea name="description" className="mt-1 w-full min-h-20 rounded-md border bg-background p-3 text-sm" /></div>
        <div className="md:col-span-2 flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setUploadOpen(false)}>Bekor qilish</Button><Button disabled={upload.isPending} type="submit">{upload.isPending ? "Tekshirilmoqda..." : "Xavfsiz yuklash"}</Button></div>
      </form>
    </DialogContent></Dialog>

    <Dialog open={assignOpen} onOpenChange={setAssignOpen}><DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>O'qituvchiga kutubxona biriktirish</DialogTitle></DialogHeader>
      <div><Label>O'qituvchi</Label><Select value={selectedTeacher} onValueChange={setSelectedTeacher}><SelectTrigger className="mt-1"><SelectValue placeholder="O'qituvchini tanlang" /></SelectTrigger><SelectContent>{teachers.map(t => <SelectItem key={t.userId} value={t.userId}>{t.displayName || `${t.firstName || ""} ${t.lastName || ""}`.trim() || t.email || "O'qituvchi"}</SelectItem>)}</SelectContent></Select></div>
      {selectedTeacher && <div className="space-y-3 mt-4">{books.filter(b => b.status === "active").map(book => { const value = draft[book.id] || { selected: false, maxOpens: "", expiresAt: "", usedOpens: 0 }; return <Card key={book.id} className={`p-4 ${value.selected ? "border-purple-500 bg-purple-50/40 dark:bg-purple-950/20" : ""}`}>
        <div className="flex gap-3"><input type="checkbox" checked={value.selected} onChange={e => setDraft(old => ({ ...old, [book.id]: { ...value, selected: e.target.checked } }))} className="mt-1 w-4 h-4" /><div className="flex-1"><p className="font-medium">{book.title}</p><p className="text-xs text-muted-foreground">{book.author || "—"} · {book.pageCount} sahifa · Ishlatilgan: {value.usedOpens}</p>{value.selected && <div className="grid sm:grid-cols-2 gap-3 mt-3"><div><Label className="text-xs">Kirish limiti</Label><Input type="number" min="1" value={value.maxOpens} placeholder="Bo'sh = cheksiz" onChange={e => setDraft(old => ({ ...old, [book.id]: { ...value, maxOpens: e.target.value } }))} /></div><div><Label className="text-xs">Ruxsat tugash sanasi</Label><Input type="date" value={value.expiresAt} onChange={e => setDraft(old => ({ ...old, [book.id]: { ...value, expiresAt: e.target.value } }))} /></div></div>}</div></div>
      </Card>})}<div className="flex justify-end gap-2 pt-2"><Button variant="outline" onClick={() => setAssignOpen(false)}>Bekor qilish</Button><Button disabled={saveAssignments.isPending} onClick={() => saveAssignments.mutate()}>{saveAssignments.isPending ? "Saqlanmoqda..." : "Biriktirishni saqlash"}</Button></div></div>}
    </DialogContent></Dialog>
  </div>;
}
