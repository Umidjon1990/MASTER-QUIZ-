import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AnimatedCounter } from "@/components/animated-counter";
import { useLocation } from "wouter";
import {
  Zap, Users, Trophy, BookOpen, ArrowRight, Moon, Sun, Sparkles, Globe,
  Monitor, Mic, FileText, Radio, BarChart3, MessageSquare, Video, Presentation, Send
} from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import type { Quiz } from "@shared/schema";
import siteLogo from "@assets/photo_2024-09-08_23-13-48-removebg-preview_1771243223962.png";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

interface PlatformStats {
  totalUsers: number;
  totalQuizzes: number;
  totalSessions: number;
  totalPlays: number;
}

export default function Landing() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const { theme, toggleTheme } = useTheme();

  const { data: publicQuizzes, isLoading: quizzesLoading } = useQuery<Quiz[]>({
    queryKey: ["/api/quizzes/public"],
  });

  const { data: platformStats } = useQuery<PlatformStats>({
    queryKey: ["/api/public-stats"],
  });

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-2">
            <img src={siteLogo} alt="Zamonaviy Ta'lim" className="w-9 h-9 rounded-md object-contain" />
            <span className="font-bold text-lg" data-testid="text-logo">Zamonaviy Ta'lim</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="icon" variant="ghost" onClick={toggleTheme} data-testid="button-theme-toggle">
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
            {!authLoading && user && (
              <Button onClick={() => navigate("/dashboard")} data-testid="button-dashboard">
                Dashboard
              </Button>
            )}
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden gradient-hero py-20 md:py-32">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-purple-500/20 blur-3xl animate-float" />
          <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-teal-500/20 blur-3xl animate-float" style={{ animationDelay: "1.5s" }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-purple-600/10 blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 text-center">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
            <Badge variant="secondary" className="mb-6 bg-white/10 text-white border-white/20">
              <Sparkles className="w-3 h-3 mr-1" />
              Interaktiv ta'lim platformasi
            </Badge>

            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-white mb-6 leading-tight" data-testid="text-hero-title">
              O'qishni <span className="text-gradient">qiziqarli</span> va{" "}
              <span className="text-gradient">interaktiv</span> qiling
            </h1>

            <p className="text-lg md:text-xl text-white/70 max-w-2xl mx-auto mb-10">
              Jonli quizlar, real vaqt natijalari, jonli darslar va zamonaviy interfeys bilan ta'lim jarayonini yangi darajaga olib chiqing
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="flex items-center justify-center gap-4 mb-12 flex-wrap"
          >
            {user && (
              <Button size="lg" onClick={() => navigate("/dashboard")} className="gradient-purple border-0" data-testid="button-hero-dashboard">
                Dashboardga o'tish <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            )}
            <Button size="lg" variant="outline" onClick={() => navigate("/discover")} className="bg-white/5 backdrop-blur-sm border-white/20 text-white" data-testid="button-hero-discover">
              <Globe className="w-4 h-4 mr-1" /> Quizlarni ko'rish
            </Button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.6 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto"
          >
            {[
              { icon: Users, label: "Foydalanuvchilar", value: platformStats?.totalUsers || 0 },
              { icon: BookOpen, label: "Quizlar", value: platformStats?.totalQuizzes || 0 },
              { icon: Zap, label: "Jonli sessiyalar", value: platformStats?.totalSessions || 0 },
              { icon: Trophy, label: "O'ynalgan", value: platformStats?.totalPlays || 0 },
            ].map((stat, i) => (
              <div key={i} className="glass-card rounded-md p-4 text-center">
                <stat.icon className="w-5 h-5 text-purple-400 mx-auto mb-2" />
                <div className="text-2xl font-bold text-white">
                  <AnimatedCounter end={stat.value} suffix="+" />
                </div>
                <div className="text-sm text-white/60">{stat.label}</div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      <section className="py-16 md:py-24 max-w-7xl mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4" data-testid="text-features-title">Platforma imkoniyatlari</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">O'qituvchilar va o'quvchilar uchun barcha zarur vositalar</p>
        </motion.div>

        <motion.div variants={container} initial="hidden" whileInView="show" viewport={{ once: true }} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            { icon: Zap, color: "gradient-purple", title: "Jonli Quizlar", desc: "Real vaqtda o'quvchilar bilan interaktiv quiz o'tkazing, leaderboard bilan" },
            { icon: Presentation, color: "gradient-teal", title: "Jonli Darslar", desc: "PDF taqdimotlar, ekran almashish va ovozli darslar" },
            { icon: Video, color: "gradient-orange", title: "Video va Audio", desc: "WebRTC orqali yuqori sifatli video/audio uzatish va yozib olish" },
            { icon: Monitor, color: "gradient-purple", title: "Ekran Almashish", desc: "Ekranni to'liq ko'rsatish va yozib olish imkoniyati" },
            { icon: FileText, color: "gradient-teal", title: "Vazifalar", desc: "Uy vazifalarini tayinlash, muddat va urinishlar limiti bilan" },
            { icon: Users, color: "gradient-orange", title: "Sinflar", desc: "Sinf yaratish, o'quvchilarni qo'shish va boshqarish" },
            { icon: MessageSquare, color: "gradient-purple", title: "Jonli Chat", desc: "Dars davomida o'quvchilar bilan real vaqt muloqot" },
            { icon: BarChart3, color: "gradient-teal", title: "Statistika", desc: "Batafsil natijalar, tahlil va o'quvchi faolligi" },
            { icon: Send, color: "gradient-orange", title: "Telegram Ulashish", desc: "Quizlarni Telegram guruh va kanallarga quiz formatda yuborish" },
          ].map((feature, i) => (
            <motion.div key={i} variants={item}>
              <Card className="p-5 h-full hover-elevate">
                <div className={`w-10 h-10 rounded-md ${feature.color} flex items-center justify-center mb-3`}>
                  <feature.icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-sm font-semibold mb-1">{feature.title}</h3>
                <p className="text-muted-foreground text-xs">{feature.desc}</p>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </section>

      <section className="py-16 md:py-24 max-w-7xl mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Ommaviy Quizlar</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">Bepul quizlarni sinab ko'ring va bilimingizni tekshiring</p>
        </motion.div>

        {quizzesLoading ? (
          <div className="grid md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-5">
                <Skeleton className="h-5 w-3/4 mb-3" />
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-1/2 mb-4" />
                <Skeleton className="h-9 w-full" />
              </Card>
            ))}
          </div>
        ) : publicQuizzes && publicQuizzes.length > 0 ? (
          <motion.div variants={container} initial="hidden" whileInView="show" viewport={{ once: true }} className="grid md:grid-cols-3 gap-6">
            {publicQuizzes.map((quiz) => (
              <motion.div key={quiz.id} variants={item}>
                <Card className="p-5 hover-elevate" data-testid={`card-quiz-${quiz.id}`}>
                  <div className="flex items-start justify-between gap-2 mb-3 flex-wrap">
                    <h3 className="font-semibold">{quiz.title}</h3>
                    <Badge variant="secondary">{quiz.category || "Umumiy"}</Badge>
                  </div>
                  {quiz.description && (
                    <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{quiz.description}</p>
                  )}
                  <div className="flex items-center justify-between gap-2 flex-wrap text-sm text-muted-foreground mb-4">
                    <span>{quiz.totalQuestions} savol</span>
                    <span>{quiz.totalPlays} marta o'ynalgan</span>
                  </div>
                  <Button className="w-full gradient-purple border-0" onClick={() => navigate(`/quiz/${quiz.id}`)} data-testid={`button-view-quiz-${quiz.id}`}>
                    Ko'rish <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        ) : (
          <div className="text-center py-12">
            <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Hozircha ommaviy quizlar yo'q</p>
          </div>
        )}
      </section>

      <footer className="border-t py-8">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>Zamonaviy Ta'lim - Interaktiv ta'lim platformasi</p>
        </div>
      </footer>
    </div>
  );
}
