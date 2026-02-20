import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Dashboard } from "./components/Dashboard";
import { ThemeProvider } from "./components/theme-provider";
import { AuthProvider, useAuth } from "./hooks/use-auth";
import Login from "./pages/Login";
import { Loader2 } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SettingsView } from "./components/SettingsView";
import { ChatView } from "./components/ChatView";
import { useState } from "react";

const queryClient = new QueryClient();

type AppView = 'dashboard' | 'settings' | 'chat';

function MainContent() {
  const { isAuthenticated, isLoading } = useAuth();
  const [view, setView] = useState<AppView>('dashboard');

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  if (view === 'settings') {
    return <SettingsView onBack={() => setView('dashboard')} />;
  }

  if (view === 'chat') {
    return <ChatView onBack={() => setView('dashboard')} />;
  }

  return <Dashboard onNavigate={setView} />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider defaultTheme="dark" storageKey="smart-router-theme">
          <TooltipProvider delayDuration={300}>
            <MainContent />
            <Toaster richColors position="bottom-right" />
          </TooltipProvider>
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
