import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AnimatedCounter } from "@/components/animated-counter";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "wouter";
import { Users, BookOpen, Zap, Trophy, UserPlus, Settings, Shield } from "lucide-react";

export default function AdminDashboard() {
  const [, navigate] = useLocation();

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
    { icon: Zap, label: "Jonli sessiyalar", value: stats?.totalSessions || 0, color: "gradient-orange" },
    { icon: Trophy, label: "O'ynalgan", value: stats?.totalPlays || 0, color: "gradient-purple" },
  ];

  const quickActions = [
    { icon: UserPlus, label: "Foydalanuvchi qo'shish", path: "/admin/users", color: "gradient-purple" },
    { icon: BookOpen, label: "Quizlarni ko'rish", path: "/admin/quizzes", color: "gradient-teal" },
    { icon: Settings, label: "Sozlamalar", path: "/admin/settings", color: "gradient-orange" },
  ];

  return (
    <div className="p-6 space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Shield className="w-5 h-5 text-muted-foreground" />
            <h1 className="text-2xl font-bold" data-testid="text-admin-title">Admin Dashboard</h1>
          </div>
          <p className="text-muted-foreground">Platformani boshqarish va monitoring</p>
        </div>
        <Button className="gradient-purple border-0" onClick={() => navigate("/admin/users")} data-testid="button-manage-users">
          <Users className="w-4 h-4 mr-1" /> Foydalanuvchilar
        </Button>
      </motion.div>

      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : (
        <motion.div
          initial="hidden"
          animate="show"
          variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.1 } } }}
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
      )}

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <h2 className="text-lg font-semibold mb-4">Tezkor amallar</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {quickActions.map((action, i) => (
            <Card
              key={i}
              className="p-5 hover-elevate cursor-pointer"
              onClick={() => navigate(action.path)}
              data-testid={`card-action-${i}`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-md ${action.color} flex items-center justify-center`}>
                  <action.icon className="w-5 h-5 text-white" />
                </div>
                <span className="font-medium text-sm">{action.label}</span>
              </div>
            </Card>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
