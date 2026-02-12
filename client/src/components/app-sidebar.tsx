import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Zap, LayoutDashboard, BookOpen, Users, Trophy, Settings, LogOut, Play, Upload, Send, ClipboardList, GraduationCap, Library, Search } from "lucide-react";
import type { UserProfile } from "@shared/schema";

const adminMenu = [
  { title: "Dashboard", url: "/admin", icon: LayoutDashboard },
  { title: "Foydalanuvchilar", url: "/admin/users", icon: Users },
  { title: "Quizlar", url: "/admin/quizzes", icon: BookOpen },
];

const teacherMenu = [
  { title: "Dashboard", url: "/teacher", icon: LayoutDashboard },
  { title: "Quizlarim", url: "/teacher/quizzes", icon: BookOpen },
  { title: "Jonli Quiz", url: "/teacher/live", icon: Play },
  { title: "Vazifalar", url: "/teacher/assignments", icon: ClipboardList },
  { title: "Sinflarim", url: "/teacher/classes", icon: GraduationCap },
  { title: "Savol Banki", url: "/teacher/question-bank", icon: Library },
  { title: "Natijalar", url: "/teacher/results", icon: Trophy },
  { title: "Discover", url: "/discover", icon: Search },
];

const studentMenu = [
  { title: "Dashboard", url: "/student", icon: LayoutDashboard },
  { title: "Quizga Qo'shilish", url: "/play/join", icon: Play },
  { title: "Vazifalar", url: "/student/assignments", icon: ClipboardList },
  { title: "Sinflarim", url: "/student/classes", icon: GraduationCap },
  { title: "Discover", url: "/discover", icon: Search },
  { title: "Natijalarim", url: "/student/results", icon: Trophy },
];

export function AppSidebar() {
  const { user, logout } = useAuth();
  const [location] = useLocation();

  const { data: profile } = useQuery<UserProfile>({
    queryKey: ["/api/profile"],
    enabled: !!user,
  });

  const role = profile?.role || "student";
  const menuItems = role === "admin" ? adminMenu : role === "teacher" ? teacherMenu : studentMenu;

  const roleLabel = role === "admin" ? "Administrator" : role === "teacher" ? "O'qituvchi" : "O'quvchi";
  const roleColor = role === "admin" ? "gradient-pink" : role === "teacher" ? "gradient-purple" : "gradient-teal";

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-md gradient-purple flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="font-bold text-base" data-testid="text-sidebar-logo">QuizLive</span>
            <div className={`text-[10px] px-1.5 py-0.5 rounded-sm ${roleColor} text-white inline-block ml-1`}>
              {roleLabel}
            </div>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menyu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((menuItem) => (
                <SidebarMenuItem key={menuItem.title}>
                  <SidebarMenuButton asChild data-active={location === menuItem.url}>
                    <Link href={menuItem.url}>
                      <menuItem.icon className="w-4 h-4" />
                      <span>{menuItem.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4">
        {user && (
          <div className="flex items-center gap-3">
            <Avatar className="w-9 h-9">
              <AvatarImage src={user.profileImageUrl || undefined} />
              <AvatarFallback className="text-xs gradient-purple text-white">
                {(user.firstName || user.email || "U")[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user.firstName || user.email}</p>
              <p className="text-xs text-muted-foreground truncate">{profile?.displayName || roleLabel}</p>
            </div>
            <Button size="icon" variant="ghost" onClick={() => logout()} data-testid="button-logout">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
