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
import { ErrorBoundary } from "./components/ErrorBoundary";
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
    return (
      <ErrorBoundary fallbackLabel="Settings crashed">
        <SettingsView onBack={() => setView('dashboard')} />
      </ErrorBoundary>
    );
  }

  if (view === 'chat') {
    return (
      <ErrorBoundary fallbackLabel="Chat crashed">
        <ChatView onBack={() => setView('dashboard')} />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary fallbackLabel="Dashboard crashed">
      <Dashboard onNavigate={setView} />
    </ErrorBoundary>
  );
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
