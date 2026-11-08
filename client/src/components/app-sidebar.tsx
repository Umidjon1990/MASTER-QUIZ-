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
import { FolderOpen, PencilLine, ExternalLink, Zap, LayoutDashboard, BookOpen, Users, Trophy, Settings, LogOut, Play, Upload, Send, ClipboardList, GraduationCap, Library, Search, Bot, Presentation, BrainCircuit } from "lucide-react";
import type { UserProfile } from "@shared/schema";
import { PORTAL_URL } from "@/lib/teacher-access";
import siteLogo from "@assets/photo_2024-09-08_23-13-48-removebg-preview_1771243223962.png";

const adminMenu = [
  { title: "Dashboard", url: "/admin", icon: LayoutDashboard },
  { title: "Foydalanuvchilar", url: "/admin/users", icon: Users },
  { title: "Test tuzish", url: "/teacher/quizzes", icon: PencilLine },
  { title: "Tayyor quizlar", url: "/admin/teacher-library", icon: FolderOpen },
  { title: "O'qituvchilar", url: "/admin/teacher-stats", icon: GraduationCap },
  { title: "Barcha quizlar", url: "/admin/quizzes", icon: BookOpen },
  { title: "Kutubxona", url: "/admin/library", icon: Library },
];

// O'qituvchi menyusi ataylab qisqa. Yashirilgan bo'limlar ro'yxati: lib/teacher-access.ts.
const simpleTeacherMenu = [
  { title: "Bosh sahifa", url: "/teacher", icon: LayoutDashboard },
  { title: "Quizlar", url: "/teacher/tests", icon: BookOpen },
  { title: "Sinflarim", url: "/teacher/groups", icon: GraduationCap },
  { title: "Natijalar", url: "/teacher/results", icon: Trophy },
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
  const { data: libraryAccess } = useQuery<{ enabled: boolean; bookCount: number }>({
    queryKey: ["/api/library/me/access-summary"],
    enabled: !!user && role === "teacher",
  });
  const teacherItems = libraryAccess?.enabled
    ? [...simpleTeacherMenu, { title: "Kitoblar", url: "/teacher/library", icon: Library }]
    : simpleTeacherMenu;
  const menuItems = role === "admin" ? adminMenu : role === "teacher" ? teacherItems : studentMenu;

  const roleLabel = role === "admin" ? "Administrator" : role === "teacher" ? "O'qituvchi" : "O'quvchi";
  const roleColor = role === "admin" ? "gradient-pink" : role === "teacher" ? "gradient-purple" : "gradient-teal";

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Link href="/" className="flex items-center gap-2">
          <img src={siteLogo} alt="Zamonaviy Ta'lim" className="w-9 h-9 rounded-md object-contain" />
          <div>
            <span className="font-bold text-base" data-testid="text-sidebar-logo">Zamonaviy Ta'lim</span>
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
                  <SidebarMenuButton asChild data-active={location === menuItem.url || (menuItem.url !== "/teacher" && menuItem.url.startsWith("/teacher/") && location.startsWith(menuItem.url + "/")) || (menuItem.url === "/teacher/tests" && location.startsWith("/teacher/test/"))}>
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

      <SidebarFooter className="p-4 gap-3">
        {role === "teacher" && (
          <a href={PORTAL_URL + "/kabinet"} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground" data-testid="link-portal">
            <ExternalLink className="w-4 h-4" /> Asosiy kabinetga qaytish
          </a>
        )}
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
