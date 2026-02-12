import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, Star } from "lucide-react";
import type { QuizResult } from "@shared/schema";

export default function StudentResults() {
  const { data: results, isLoading } = useQuery<QuizResult[]>({ queryKey: ["/api/my-results"] });

  return (
    <div className="p-6 space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold" data-testid="text-my-results-title">Natijalarim</h1>
        <p className="text-muted-foreground">Barcha quiz natijalaringiz</p>
      </motion.div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : results && results.length > 0 ? (
        <motion.div initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }} className="space-y-3">
          {results.map((r, i) => (
            <motion.div key={r.id} variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}>
              <Card className="p-4 hover-elevate" data-testid={`card-my-result-${r.id}`}>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${r.rank === 1 ? "gradient-orange" : r.rank === 2 ? "gradient-purple" : r.rank === 3 ? "gradient-teal" : "bg-muted text-muted-foreground"}`}>
                      {r.rank && r.rank <= 3 ? <Star className="w-5 h-5" /> : `#${r.rank}`}
                    </div>
                    <div>
                      <p className="font-medium">{r.correctAnswers}/{r.totalQuestions} to'g'ri javob</p>
                      <p className="text-sm text-muted-foreground">
                        {r.completedAt ? new Date(r.completedAt).toLocaleDateString("uz-UZ") : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary">#{r.rank}</Badge>
                    <span className="text-xl font-bold">{r.totalScore} ball</span>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      ) : (
        <Card className="p-12 text-center">
          <Trophy className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Hozircha natijalar yo'q. Quizga qo'shiling!</p>
        </Card>
      )}
    </div>
  );
}
