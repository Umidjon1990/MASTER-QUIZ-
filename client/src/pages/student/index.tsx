import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AnimatedCounter } from "@/components/animated-counter";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "wouter";
import { Trophy, BookOpen, Target, TrendingUp, ArrowRight, GraduationCap } from "lucide-react";
import type { QuizResult } from "@shared/schema";

export default function StudentDashboard() {
  const [, navigate] = useLocation();

  const { data: results, isLoading } = useQuery<QuizResult[]>({ queryKey: ["/api/my-results"] });

  const totalPlayed = results?.length || 0;
  const totalCorrect = results?.reduce((a, r) => a + r.correctAnswers, 0) || 0;
  const bestScore = results?.reduce((a, r) => Math.max(a, r.totalScore), 0) || 0;
  const avgScore = totalPlayed > 0
    ? Math.round((results?.reduce((a, r) => a + r.totalScore, 0) || 0) / totalPlayed)
    : 0;

  const statCards = [
    { icon: BookOpen, label: "O'ynalgan quizlar", value: totalPlayed, color: "gradient-purple" },
    { icon: Trophy, label: "To'g'ri javoblar", value: totalCorrect, color: "gradient-teal" },
    { icon: Target, label: "Eng yuqori ball", value: bestScore, color: "gradient-orange" },
    { icon: TrendingUp, label: "O'rtacha ball", value: avgScore, color: "gradient-purple" },
  ];

  return (
    <div className="p-6 space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-student-title">O'quvchi Dashboard</h1>
          <p className="text-muted-foreground">Quizlarga qo'shiling va bilimingizni sinang</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => navigate("/student/classes")} data-testid="button-my-classes">
            <GraduationCap className="w-4 h-4 mr-1" /> Sinflarim
          </Button>
          <Button className="gradient-purple border-0" onClick={() => navigate("/discover")} data-testid="button-discover">
            Quizlarni ko'rish <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </motion.div>

      <motion.div
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {statCards.map((stat, i) => (
          <motion.div key={i} variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}>
            <Card className="p-4 hover-elevate" data-testid={`card-stat-${i}`}>
              <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <div className={`w-8 h-8 rounded-md ${stat.color} flex items-center justify-center`}>
                  <stat.icon className="w-4 h-4 text-white" />
                </div>
              </div>
              <p className="text-2xl font-bold">
                <AnimatedCounter end={stat.value} />
              </p>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      )}

      {results && results.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4">So'nggi Natijalar</h2>
          <div className="space-y-3">
            {results.slice(0, 10).map((r, i) => (
              <motion.div key={r.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                <Card className="p-4" data-testid={`card-result-${r.id}`}>
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${r.rank === 1 ? "gradient-orange" : r.rank === 2 ? "gradient-purple" : "gradient-teal"}`}>
                        #{r.rank}
                      </span>
                      <div>
                        <p className="font-medium text-sm">{r.correctAnswers}/{r.totalQuestions} to'g'ri</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(r.completedAt!).toLocaleDateString("uz-UZ")}
                        </p>
                      </div>
                    </div>
                    <p className="text-xl font-bold">{r.totalScore} ball</p>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {results && results.length === 0 && (
        <Card className="p-8 text-center">
          <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="font-semibold mb-2">Hali natijalar yo'q</h3>
          <p className="text-sm text-muted-foreground mb-4">Quizlarga qo'shilib bilimingizni sinang</p>
          <Button className="gradient-purple border-0" onClick={() => navigate("/discover")} data-testid="button-start-quiz">
            Quizlarni ko'rish
          </Button>
        </Card>
      )}
    </div>
  );
}
