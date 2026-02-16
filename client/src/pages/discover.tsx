import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Search, Heart, Play, BookOpen, Filter, Share2, Copy, Check } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Quiz } from "@shared/schema";

export default function DiscoverPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleShareQuiz = (quizId: string) => {
    const url = `${window.location.origin}/quiz/play/${quizId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(quizId);
      setTimeout(() => setCopiedId(null), 2000);
      toast({ title: "Quiz linki nusxalandi!" });
    });
  };

  const params = new URLSearchParams();
  if (searchQuery) params.set("q", searchQuery);
  if (categoryFilter && categoryFilter !== "all") params.set("category", categoryFilter);
  if (sortBy) params.set("sort", sortBy);

  const { data: quizzes, isLoading } = useQuery<(Quiz & { creatorName?: string })[]>({
    queryKey: ["/api/discover", searchQuery, categoryFilter, sortBy],
    queryFn: async () => {
      const res = await fetch(`/api/discover?${params.toString()}`, { credentials: "include" });
      return res.json();
    },
  });

  const categories = Array.from(new Set(quizzes?.map(q => q.category).filter(Boolean) || []));

  const toggleLike = useMutation({
    mutationFn: async (quizId: string) => {
      const res = await fetch(`/api/quizzes/${quizId}/like`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/discover"] });
    },
    onError: () => {
      toast({ title: "Like qo'yishda xatolik", variant: "destructive" });
    },
  });

  return (
    <div className="p-6 space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold" data-testid="text-discover-title">Discover</h1>
        <p className="text-muted-foreground">Ommaviy quizlarni qidiring va o'ynang</p>
      </motion.div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Quiz qidirish..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-discover-search"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-discover-category">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Kategoriya" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Barchasi</SelectItem>
            {categories.map(cat => (
              <SelectItem key={cat} value={cat!}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-[180px]" data-testid="select-discover-sort">
            <SelectValue placeholder="Tartiblash" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Eng yangi</SelectItem>
            <SelectItem value="popular">Eng mashhur</SelectItem>
            <SelectItem value="likes">Eng ko'p like</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="p-5">
              <Skeleton className="h-5 w-3/4 mb-3" />
              <Skeleton className="h-4 w-1/2 mb-4" />
              <Skeleton className="h-8 w-full" />
            </Card>
          ))}
        </div>
      ) : !quizzes?.length ? (
        <Card className="p-12 text-center">
          <BookOpen className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-lg font-medium">Quizlar topilmadi</p>
          <p className="text-sm text-muted-foreground mt-1">Boshqa kalit so'z bilan qidirib ko'ring</p>
        </Card>
      ) : (
        <motion.div
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
          className="grid md:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {quizzes.map((quiz) => (
            <motion.div key={quiz.id} variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}>
              <Card className="p-5 space-y-3 hover-elevate" data-testid={`card-discover-quiz-${quiz.id}`}>
                <div>
                  <h3 className="font-semibold text-base" data-testid={`text-quiz-title-${quiz.id}`}>{quiz.title}</h3>
                  {quiz.description && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{quiz.description}</p>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap">
                  {quiz.category && <Badge variant="secondary" className="text-xs">{quiz.category}</Badge>}
                  <Badge variant="outline" className="text-xs">{quiz.totalQuestions} savol</Badge>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Play className="w-3 h-3" /> {quiz.totalPlays}</span>
                  <span className="flex items-center gap-1"><Heart className="w-3 h-3" /> {quiz.totalLikes ?? 0}</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    className="flex-1"
                    onClick={() => navigate(`/quiz/play/${quiz.id}`)}
                    data-testid={`button-play-${quiz.id}`}
                  >
                    <Play className="w-4 h-4 mr-2" />
                    O'ynash
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleShareQuiz(quiz.id)}
                    data-testid={`button-share-${quiz.id}`}
                  >
                    {copiedId === quiz.id ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => toggleLike.mutate(quiz.id)}
                    data-testid={`button-like-${quiz.id}`}
                  >
                    <Heart className="w-4 h-4" />
                  </Button>
                </div>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
