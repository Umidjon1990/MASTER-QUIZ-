import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AnimatedCounter } from "@/components/animated-counter";
import { useLocation } from "wouter";
import { BookOpen, Play, Trophy, Plus } from "lucide-react";
import type { Quiz } from "@shared/schema";

export default function TeacherDashboard() {
  const [, navigate] = useLocation();

  const { data: quizzes } = useQuery<Quiz[]>({
    queryKey: ["/api/quizzes"],
  });

  const totalQuizzes = quizzes?.length || 0;
  const publishedQuizzes = quizzes?.filter((q) => q.status === "published").length || 0;
  const totalPlays = quizzes?.reduce((acc, q) => acc + q.totalPlays, 0) || 0;

  const statCards = [
    { icon: BookOpen, label: "Quizlarim", value: totalQuizzes, color: "gradient-purple" },
    { icon: Play, label: "Nashr qilingan", value: publishedQuizzes, color: "gradient-teal" },
    { icon: Trophy, label: "O'ynalgan", value: totalPlays, color: "gradient-orange" },
  ];

  return (
    <div className="p-6 space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-teacher-title">O'qituvchi Dashboard</h1>
          <p className="text-muted-foreground">Quizlarni yarating va boshqaring</p>
        </div>
        <Button className="gradient-purple border-0" onClick={() => navigate("/teacher/quizzes/new")} data-testid="button-create-quiz">
          <Plus className="w-4 h-4 mr-1" /> Yangi Quiz
        </Button>
      </motion.div>

      <motion.div
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.1 } } }}
        className="grid grid-cols-1 sm:grid-cols-3 gap-4"
      >
        {statCards.map((stat, i) => (
          <motion.div key={i} variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}>
            <Card className="p-5 hover-elevate">
              <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <div className={`w-9 h-9 rounded-md ${stat.color} flex items-center justify-center`}>
                  <stat.icon className="w-4 h-4 text-white" />
                </div>
              </div>
              <p className="text-3xl font-bold">
                <AnimatedCounter end={stat.value} />
              </p>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {quizzes && quizzes.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4">So'nggi Quizlar</h2>
          <motion.div
            initial="hidden"
            animate="show"
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {quizzes.slice(0, 6).map((quiz) => (
              <motion.div key={quiz.id} variants={{ hidden: { opacity: 0, scale: 0.95 }, show: { opacity: 1, scale: 1 } }}>
                <Card className="p-4 hover-elevate" data-testid={`card-quiz-${quiz.id}`}>
                  <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
                    <h3 className="font-semibold truncate flex-1">{quiz.title}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-sm text-white ${quiz.status === "published" ? "gradient-teal" : "bg-muted text-muted-foreground"}`}>
                      {quiz.status === "published" ? "Nashr" : "Qoralama"}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">{quiz.totalQuestions} savol</p>
                  <div className="flex gap-2 flex-wrap">
                    <Button variant="outline" size="sm" onClick={() => navigate(`/teacher/quizzes/${quiz.id}`)} data-testid={`button-edit-${quiz.id}`}>
                      Tahrirlash
                    </Button>
                    {quiz.status === "published" && (
                      <Button size="sm" className="gradient-purple border-0" onClick={() => navigate(`/teacher/live?quizId=${quiz.id}`)} data-testid={`button-live-${quiz.id}`}>
                        <Play className="w-3 h-3 mr-1" /> Jonli
                      </Button>
                    )}
                  </div>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      )}
    </div>
  );
}
