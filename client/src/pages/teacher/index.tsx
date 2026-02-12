import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AnimatedCounter } from "@/components/animated-counter";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "wouter";
import { BookOpen, Play, Trophy, Plus, Users, Heart, ClipboardList, BarChart3, GraduationCap, Target } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import type { Quiz } from "@shared/schema";

interface TeacherStats {
  totalQuizzes: number;
  totalPlays: number;
  totalLikes: number;
  totalStudents: number;
  totalClasses: number;
  totalAssignments: number;
  totalAttempts: number;
  avgScore: number;
  avgCorrectRate: number;
  quizStats: { quizTitle: string; attempts: number; avgScore: number }[];
  categoryData: { name: string; plays: number; quizzes: number }[];
  topStudents: { name: string; attempts: number; avgScore: number }[];
  hardestQuestions: { question: string; correctRate: number; total: number }[];
}

const CHART_COLORS = ["hsl(262, 83%, 58%)", "hsl(172, 66%, 50%)", "hsl(25, 95%, 53%)", "hsl(221, 83%, 53%)", "hsl(340, 75%, 55%)", "hsl(47, 96%, 53%)"];

export default function TeacherDashboard() {
  const [, navigate] = useLocation();

  const { data: quizzes } = useQuery<Quiz[]>({
    queryKey: ["/api/quizzes"],
  });

  const { data: stats, isLoading: statsLoading } = useQuery<TeacherStats>({
    queryKey: ["/api/teacher/stats"],
  });

  const totalQuizzes = quizzes?.length || 0;
  const publishedQuizzes = quizzes?.filter((q) => q.status === "published").length || 0;
  const totalPlays = quizzes?.reduce((acc, q) => acc + q.totalPlays, 0) || 0;

  const statCards = [
    { icon: BookOpen, label: "Quizlarim", value: totalQuizzes, color: "gradient-purple" },
    { icon: Play, label: "Nashr qilingan", value: publishedQuizzes, color: "gradient-teal" },
    { icon: Trophy, label: "O'ynalgan", value: totalPlays, color: "gradient-orange" },
    { icon: Heart, label: "Yoqtirishlar", value: stats?.totalLikes || 0, color: "gradient-purple" },
    { icon: Users, label: "O'quvchilar", value: stats?.totalStudents || 0, color: "gradient-teal" },
    { icon: GraduationCap, label: "Sinflar", value: stats?.totalClasses || 0, color: "gradient-orange" },
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
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4"
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

      {stats && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="p-4 hover-elevate" data-testid="card-assignment-stats">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <ClipboardList className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm font-medium">Vazifalar</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-2xl font-bold"><AnimatedCounter end={stats.totalAssignments} /></p>
                <p className="text-xs text-muted-foreground">Jami vazifalar</p>
              </div>
              <div>
                <p className="text-2xl font-bold"><AnimatedCounter end={stats.totalAttempts} /></p>
                <p className="text-xs text-muted-foreground">Jami urinishlar</p>
              </div>
            </div>
          </Card>

          <Card className="p-4 hover-elevate" data-testid="card-avg-score">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <Target className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm font-medium">O'rtacha natija</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-2xl font-bold"><AnimatedCounter end={stats.avgScore} /></p>
                <p className="text-xs text-muted-foreground">O'rtacha ball</p>
              </div>
              <div>
                <p className="text-2xl font-bold"><AnimatedCounter end={stats.avgCorrectRate} />%</p>
                <p className="text-xs text-muted-foreground">To'g'ri javob</p>
              </div>
            </div>
          </Card>

          <Card className="p-4 hover-elevate" data-testid="card-engagement">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <BarChart3 className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm font-medium">Faollik</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-2xl font-bold"><AnimatedCounter end={stats.totalPlays} /></p>
                <p className="text-xs text-muted-foreground">Jami o'ynalgan</p>
              </div>
              <div>
                <p className="text-2xl font-bold"><AnimatedCounter end={stats.totalLikes} /></p>
                <p className="text-xs text-muted-foreground">Yoqtirishlar</p>
              </div>
            </div>
          </Card>
        </motion.div>
      )}

      {statsLoading && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {stats && stats.quizStats.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
            <Card className="p-5" data-testid="card-chart-plays">
              <h3 className="text-sm font-semibold mb-4">Quizlar bo'yicha o'ynalgan</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.quizStats} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="quizTitle" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                    <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                    <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", color: "hsl(var(--card-foreground))" }} />
                    <Bar dataKey="attempts" fill="hsl(262, 83%, 58%)" radius={[4, 4, 0, 0]} name="O'ynalgan" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </motion.div>
        )}

        {stats && stats.categoryData.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
            <Card className="p-5" data-testid="card-chart-categories">
              <h3 className="text-sm font-semibold mb-4">Kategoriyalar bo'yicha</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.categoryData}
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      dataKey="quizzes"
                      nameKey="name"
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    >
                      {stats.categoryData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", color: "hsl(var(--card-foreground))" }} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </motion.div>
        )}
      </div>

      {stats && (stats.topStudents.length > 0 || stats.hardestQuestions.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {stats.topStudents.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
              <Card className="p-5" data-testid="card-top-students">
                <div className="flex items-center gap-2 mb-4 flex-wrap">
                  <Users className="w-4 h-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">Eng faol o'quvchilar</h3>
                </div>
                <div className="space-y-3">
                  {stats.topStudents.map((student, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 flex-wrap" data-testid={`row-student-${i}`}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}.</span>
                        <span className="text-sm font-medium">{student.name}</span>
                      </div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-xs text-muted-foreground">{student.attempts} urinish</span>
                        <span className="text-sm font-semibold">{student.avgScore} ball</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </motion.div>
          )}

          {stats.hardestQuestions.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}>
              <Card className="p-5" data-testid="card-hardest-questions">
                <div className="flex items-center gap-2 mb-4 flex-wrap">
                  <Target className="w-4 h-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">Eng qiyin savollar</h3>
                </div>
                <div className="space-y-3">
                  {stats.hardestQuestions.map((q, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 flex-wrap" data-testid={`row-question-${i}`}>
                      <span className="text-sm flex-1 truncate">{q.question}</span>
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="w-16 h-2 rounded-sm bg-muted overflow-hidden">
                          <div className="h-full rounded-sm gradient-orange" style={{ width: `${q.correctRate}%` }} />
                        </div>
                        <span className="text-xs font-semibold text-muted-foreground">{q.correctRate}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </motion.div>
          )}
        </div>
      )}

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
