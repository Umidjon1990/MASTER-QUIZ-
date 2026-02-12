import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { AnimatedCounter } from "@/components/animated-counter";
import { Users, BookOpen, Zap, Trophy } from "lucide-react";

export default function AdminDashboard() {
  const { data: stats, isLoading } = useQuery<{
    totalUsers: number;
    totalQuizzes: number;
    totalSessions: number;
    totalPlays: number;
  }>({
    queryKey: ["/api/admin/stats"],
  });

  const statCards = [
    { icon: Users, label: "Foydalanuvchilar", value: stats?.totalUsers || 0, color: "gradient-purple" },
    { icon: BookOpen, label: "Quizlar", value: stats?.totalQuizzes || 0, color: "gradient-teal" },
    { icon: Zap, label: "Sessiyalar", value: stats?.totalSessions || 0, color: "gradient-orange" },
    { icon: Trophy, label: "O'ynalgan", value: stats?.totalPlays || 0, color: "gradient-pink" },
  ];

  return (
    <div className="p-6 space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 className="text-2xl font-bold" data-testid="text-admin-title">Admin Dashboard</h1>
        <p className="text-muted-foreground">Platformani boshqarish va statistikalar</p>
      </motion.div>

      <motion.div
        initial="hidden"
        animate="show"
        variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.1 } } }}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {statCards.map((stat, i) => (
          <motion.div key={i} variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}>
            <Card className="p-5 hover-elevate" data-testid={`card-stat-${i}`}>
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
    </div>
  );
}
