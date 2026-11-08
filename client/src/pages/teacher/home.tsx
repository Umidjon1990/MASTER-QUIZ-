import { Link } from "wouter";
import { BookOpen, Trophy } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { useProfile } from "@/lib/teacher-access";
import TeacherDashboard from "./index";

/** O'qituvchining bosh sahifasi. Admin (test muallifi) uchun eski to'liq dashboard qoladi. */
export default function TeacherHome() {
  const { data: profile, isLoading } = useProfile();
  const { user } = useAuth();
  if (isLoading) return null;
  if (profile?.role !== "teacher") return <TeacherDashboard />;
  const name = profile.displayName || user?.firstName || "Ustoz";
  const cards = [
    { href: "/teacher/tests", icon: BookOpen, title: "Quizlar", text: "Tayyor testni tanlang va sinfda o‘tkazing yoki havola bilan yuboring." },
    { href: "/teacher/results", icon: Trophy, title: "Natijalar", text: "O‘tkazilgan testlar natijalari va reyting." },
  ];
  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-teacher-title">Assalomu alaykum, {name}!</h1>
        <p className="text-muted-foreground mt-1">Bugun qaysi testni o‘tkazamiz?</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {cards.map((c) => (
          <Link key={c.href} href={c.href}>
            <Card className="p-5 h-full hover:border-purple-300 transition-colors cursor-pointer">
              <c.icon className="w-6 h-6 text-purple-600 mb-3" />
              <h2 className="font-semibold">{c.title}</h2>
              <p className="text-sm text-muted-foreground mt-1">{c.text}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
