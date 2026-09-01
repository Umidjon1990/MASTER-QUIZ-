import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { BookOpen, CalendarClock, Library, LockKeyhole, Search, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

type LibraryBook = { id: string; title: string; author: string | null; description: string | null; category: string | null; subject: string | null; level: string | null; coverUrl: string | null; pageCount: number; licensedUntil: string | null; assignment: { maxOpens: number | null; usedOpens: number; expiresAt: string | null; startsAt: string | null } };

async function responseError(response: Response) {
  try { return (await response.json()).message || "Kitob ochilmadi"; } catch { return "Kitob ochilmadi"; }
}

export default function TeacherLibrary() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const { data: books = [], isLoading } = useQuery<LibraryBook[]>({ queryKey: ["/api/library/books"] });
  const categories = [...new Set(books.map(book => book.category).filter(Boolean))] as string[];
  const shown = useMemo(() => books.filter(book => (category === "all" || book.category === category) && `${book.title} ${book.author || ""} ${book.subject || ""}`.toLowerCase().includes(search.toLowerCase())), [books, search, category]);

  const open = useMutation({
    mutationFn: async (bookId: string) => {
      const response = await fetch(`/api/library/books/${bookId}/open`, { method: "POST", credentials: "include" });
      if (!response.ok) throw new Error(await responseError(response));
      return response.json();
    },
    onSuccess: data => {
      sessionStorage.setItem(`library-token:${data.sessionId}`, data.token);
      sessionStorage.setItem(`library-page:${data.sessionId}`, String(data.lastPage || 1));
      navigate(`/teacher/library/view/${data.sessionId}`);
    },
    onError: (error: Error) => toast({ title: "Ruxsat berilmadi", description: error.message, variant: "destructive" }),
  });

  return <div className="p-4 md:p-6 space-y-6">
    <div className="rounded-2xl bg-gradient-to-r from-violet-700 via-purple-700 to-indigo-700 p-6 text-white shadow-lg">
      <div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2 text-purple-100 text-sm mb-2"><ShieldCheck className="w-4 h-4" /> Himoyalangan o'qituvchi kutubxonasi</div><h1 className="text-2xl md:text-3xl font-bold">Sizga biriktirilgan manbalar</h1><p className="mt-2 text-purple-100 max-w-2xl">Kitoblar faqat dars jarayonida foydalanish uchun. Har bir ochilish shaxsiy watermark va xavfsiz sessiya bilan himoyalanadi.</p></div><LockKeyhole className="w-12 h-12 text-white/40 hidden sm:block" /></div>
    </div>
    <div className="flex flex-col sm:flex-row gap-3"><div className="relative flex-1"><Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" /><Input value={search} onChange={e => setSearch(e.target.value)} className="pl-9" placeholder="Kitob yoki muallif bo'yicha qidirish..." /></div><select value={category} onChange={e => setCategory(e.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm"><option value="all">Barcha kategoriyalar</option>{categories.map(item => <option key={item}>{item}</option>)}</select></div>
    {isLoading ? <p className="text-center py-16 text-muted-foreground">Kutubxona yuklanmoqda...</p> : shown.length === 0 ? <Card className="text-center py-16"><Library className="w-14 h-14 mx-auto text-muted-foreground/30 mb-4" /><h2 className="font-semibold text-lg">Sizga kitob biriktirilmagan</h2><p className="text-muted-foreground text-sm mt-1">Kutubxona ruxsati uchun administratorga murojaat qiling.</p></Card> : <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">{shown.map(book => {
      const remaining = book.assignment.maxOpens === null ? null : Math.max(0, book.assignment.maxOpens - book.assignment.usedOpens);
      const expired = (!!book.assignment.expiresAt && new Date(book.assignment.expiresAt) <= new Date()) || (!!book.licensedUntil && new Date(book.licensedUntil) <= new Date());
      return <Card key={book.id} className="overflow-hidden group hover:shadow-lg transition-shadow"><div className="h-32 bg-gradient-to-br from-purple-100 to-indigo-100 dark:from-purple-950 dark:to-indigo-950 flex items-center justify-center relative">{book.coverUrl ? <img src={book.coverUrl} className="w-full h-full object-cover" alt="" /> : <BookOpen className="w-14 h-14 text-purple-500/60" />}<Badge className="absolute top-3 right-3 bg-black/65">{book.pageCount} sahifa</Badge></div><div className="p-5"><div className="flex gap-2 mb-2">{book.category && <Badge variant="secondary">{book.category}</Badge>}{book.level && <Badge variant="outline">{book.level}</Badge>}</div><h2 className="font-bold text-lg leading-tight line-clamp-2">{book.title}</h2><p className="text-sm text-muted-foreground mt-1">{book.author || "Muallif ko'rsatilmagan"}</p>{book.description && <p className="text-sm text-muted-foreground mt-3 line-clamp-2">{book.description}</p>}<div className="mt-4 pt-4 border-t flex items-center justify-between gap-3"><div className="text-xs"><p className={remaining === 0 ? "text-destructive font-medium" : "text-muted-foreground"}>{remaining === null ? "Cheksiz kirish" : `${remaining} ta kirish qoldi`}</p>{book.assignment.expiresAt && <p className="flex items-center gap-1 mt-1 text-muted-foreground"><CalendarClock className="w-3 h-3" /> {new Date(book.assignment.expiresAt).toLocaleDateString("uz-UZ")} gacha</p>}</div><Button size="sm" disabled={open.isPending || remaining === 0 || expired} onClick={() => open.mutate(book.id)}>{expired ? "Muddati tugagan" : "Dars uchun ochish"}</Button></div></div></Card>;
    })}</div>}
  </div>;
}
