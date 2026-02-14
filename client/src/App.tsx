import { useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider, useTheme } from "@/components/theme-provider";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Moon, Sun } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Dashboard from "@/pages/dashboard";
import AdminDashboard from "@/pages/admin/index";
import AdminUsers from "@/pages/admin/users";
import AdminQuizzes from "@/pages/admin/quizzes";
import TeacherDashboard from "@/pages/teacher/index";
import TeacherQuizzes from "@/pages/teacher/quizzes";
import QuizEditor from "@/pages/teacher/quiz-editor";
import TeacherLive from "@/pages/teacher/live";
import TeacherResults from "@/pages/teacher/results";
import TeacherAssignments from "@/pages/teacher/assignments";
import TeacherClasses from "@/pages/teacher/classes";
import TeacherQuestionBank from "@/pages/teacher/question-bank";
import TeacherTelegram from "@/pages/teacher/telegram";
import StudentDashboard from "@/pages/student/index";
import StudentResults from "@/pages/student/results";
import StudentAssignments from "@/pages/student/assignments";
import StudentClasses from "@/pages/student/classes";
import JoinPlay from "@/pages/play/join";
import DiscoverPage from "@/pages/discover";
import AuthPage from "@/pages/auth";

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) {
      navigate("/auth");
    }
  }, [isLoading, user, navigate]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 rounded-md gradient-purple mx-auto animate-pulse" />
          <Skeleton className="h-5 w-40 mx-auto" />
        </div>
      </div>
    );
  }

  if (!user) return null;

  return <>{children}</>;
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <Button size="icon" variant="ghost" onClick={toggleTheme} data-testid="button-theme-toggle-inner">
      {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </Button>
  );
}

function DashboardLayout({ children }: { children: React.ReactNode }) {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <AuthGuard>
      <SidebarProvider style={style as React.CSSProperties}>
        <div className="flex h-screen w-full">
          <AppSidebar />
          <div className="flex flex-col flex-1 min-w-0">
            <header className="flex items-center justify-between gap-4 p-3 border-b sticky top-0 z-50 bg-background/80 backdrop-blur-md">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <ThemeToggle />
            </header>
            <main className="flex-1 overflow-auto">
              {children}
            </main>
          </div>
        </div>
      </SidebarProvider>
    </AuthGuard>
  );
}

function ProtectedPage({ component: Component }: { component: React.ComponentType }) {
  return (
    <DashboardLayout>
      <Component />
    </DashboardLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <Switch>
            <Route path="/" component={Landing} />
            <Route path="/auth" component={AuthPage} />
            <Route path="/dashboard" component={Dashboard} />
            <Route path="/play/join" component={JoinPlay} />

            <Route path="/admin">
              {() => <ProtectedPage component={AdminDashboard} />}
            </Route>
            <Route path="/admin/users">
              {() => <ProtectedPage component={AdminUsers} />}
            </Route>
            <Route path="/admin/quizzes">
              {() => <ProtectedPage component={AdminQuizzes} />}
            </Route>

            <Route path="/teacher">
              {() => <ProtectedPage component={TeacherDashboard} />}
            </Route>
            <Route path="/teacher/quizzes">
              {() => <ProtectedPage component={TeacherQuizzes} />}
            </Route>
            <Route path="/teacher/quizzes/new">
              {() => <ProtectedPage component={QuizEditor} />}
            </Route>
            <Route path="/teacher/quizzes/:id">
              {() => <ProtectedPage component={QuizEditor} />}
            </Route>
            <Route path="/teacher/live">
              {() => <ProtectedPage component={TeacherLive} />}
            </Route>
            <Route path="/teacher/results">
              {() => <ProtectedPage component={TeacherResults} />}
            </Route>
            <Route path="/teacher/assignments">
              {() => <ProtectedPage component={TeacherAssignments} />}
            </Route>
            <Route path="/teacher/classes">
              {() => <ProtectedPage component={TeacherClasses} />}
            </Route>
            <Route path="/teacher/question-bank">
              {() => <ProtectedPage component={TeacherQuestionBank} />}
            </Route>
            <Route path="/teacher/telegram">
              {() => <ProtectedPage component={TeacherTelegram} />}
            </Route>

            <Route path="/student">
              {() => <ProtectedPage component={StudentDashboard} />}
            </Route>
            <Route path="/student/results">
              {() => <ProtectedPage component={StudentResults} />}
            </Route>
            <Route path="/student/assignments">
              {() => <ProtectedPage component={StudentAssignments} />}
            </Route>
            <Route path="/student/classes">
              {() => <ProtectedPage component={StudentClasses} />}
            </Route>

            <Route path="/discover" component={DiscoverPage} />

            <Route component={NotFound} />
          </Switch>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
