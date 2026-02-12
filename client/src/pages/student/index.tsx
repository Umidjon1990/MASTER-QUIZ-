import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AnimatedCounter } from "@/components/animated-counter";
import { useLocation } from "wouter";
import { Play, Trophy, BookOpen } from "lucide-react";
import type { QuizResult } from "@shared/schema";

export default function StudentDashboard() {
  const [, navigate] = useLocation();
  const [joinCode, setJoinCode] = useState("");

  const { data: results } = useQuery<QuizResult[]>({ queryKey: ["/api/my-results"] });

  const totalPlayed = results?.length || 0;
  const totalCorrect = results?.reduce((a, r) => a + r.correctAnswers, 0) || 0;
  const bestScore = results?.reduce((a, r) => Math.max(a, r.totalScore), 0) || 0;

  const handleJoin = () => {
    if (joinCode.trim().length === 6) navigate(`/play/join?code=${joinCode.trim()}`);
  };

  return (
    <div className="p-6 space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold" data-testid="text-student-title">O'quvchi Dashboard</h1>
        <p className="text-muted-foreground">Quizlarga qo'shiling va bilimingizni sinang</p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card className="p-6 gradient-hero text-white">
          <h2 className="text-xl font-bold mb-4">Quizga Qo'shilish</h2>
          <div className="flex gap-3 flex-wrap">
            <Input
              placeholder="6-raqamli kod"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="max-w-[200px] bg-white/10 border-white/20 text-white placeholder:text-white/40 text-center text-lg font-mono tracking-widest"
              maxLength={6}
              data-testid="input-join-code"
            />
            <Button onClick={handleJoin} disabled={joinCode.length !== 6} className="bg-white text-purple-700 border-0" data-testid="button-join">
              <Play className="w-4 h-4 mr-1" /> Qo'shilish
            </Button>
          </div>
        </Card>
      </motion.div>

      <motion.div
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.1 } } }}
        className="grid grid-cols-1 sm:grid-cols-3 gap-4"
      >
        {[
          { icon: BookOpen, label: "O'ynalgan", value: totalPlayed, color: "gradient-purple" },
          { icon: Trophy, label: "To'g'ri javoblar", value: totalCorrect, color: "gradient-teal" },
          { icon: Trophy, label: "Eng yuqori ball", value: bestScore, color: "gradient-orange" },
        ].map((stat, i) => (
          <motion.div key={i} variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}>
            <Card className="p-5 hover-elevate">
              <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <div className={`w-9 h-9 rounded-md ${stat.color} flex items-center justify-center`}>
                  <stat.icon className="w-4 h-4 text-white" />
                </div>
              </div>
              <p className="text-3xl font-bold"><AnimatedCounter end={stat.value} /></p>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {results && results.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4">So'nggi Natijalar</h2>
          <div className="space-y-3">
            {results.slice(0, 10).map((r, i) => (
              <motion.div key={r.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                <Card className="p-4" data-testid={`card-result-${r.id}`}>
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${r.rank === 1 ? "gradient-orange" : r.rank === 2 ? "gradient-purple" : "gradient-teal"}`}>
                          #{r.rank}
                        </span>
                        <div>
                          <p className="font-medium">{r.correctAnswers}/{r.totalQuestions} to'g'ri</p>
                        </div>
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
    </div>
  );
}
