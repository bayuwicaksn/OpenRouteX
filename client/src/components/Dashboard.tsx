import { useQuery } from "@tanstack/react-query";
import { fetchStats } from "@/lib/api";
import { StatsGrid } from "./StatsGrid";
import { RecentActivity } from "./RecentActivity";
import { Charts } from "./Charts";
import { Button } from "@/components/ui/button";
import { RefreshCw, Settings } from "lucide-react";
// import { AddAccountDialog } from "./AddAccountDialog"; // Removed
// import { ManagementDialog } from "./ManagementDialog"; // Removed
import { useState } from "react";
import { ModeToggle } from "./mode-toggle";
import { useAuth } from "@/hooks/use-auth";
import { LogOut } from "lucide-react";

import { SettingsView } from "./SettingsView";

import { ChatView } from "./ChatView";
import { MessageSquare } from "lucide-react";

export function Dashboard() {
    // const [isAddOpen, setIsAddOpen] = useState(false); // Removed
    // const [isManageOpen, setIsManageOpen] = useState(false); // Removed
    const [view, setView] = useState<'dashboard' | 'settings' | 'chat'>('dashboard');
    const { logout } = useAuth();

    const { data, refetch, isFetching } = useQuery({
        queryKey: ["stats"],
        queryFn: fetchStats,
        refetchInterval: 5000,
        enabled: view === 'dashboard', // Pause fetching when in settings or chat
    });

    if (view === 'settings') {
        return <SettingsView onBack={() => setView('dashboard')} />;
    }

    if (view === 'chat') {
        return <ChatView onBack={() => setView('dashboard')} />;
    }

    return (
        <div className="min-h-screen bg-background text-foreground p-6">
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Header */}
                <header className="flex justify-between items-center pb-6 border-b">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center text-primary">
                            <span className="font-bold text-xl">S</span>
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight">OpenRouteX</h1>
                            <p className="text-muted-foreground text-sm">Real-time LLM Gateway Monitor</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 text-sm text-green-500 mr-2">
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                            Online
                        </div>

                        <ModeToggle />

                        <Button variant="ghost" size="sm" onClick={() => setView('chat')}>
                            <MessageSquare className="w-4 h-4 mr-2" />
                            Chat
                        </Button>

                        <Button variant="outline" size="sm" onClick={() => setView('settings')}>
                            <Settings className="w-4 h-4 mr-2" />
                            Manage
                        </Button>

                        <Button variant="ghost" size="icon" onClick={() => refetch()} disabled={isFetching}>
                            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
                        </Button>

                        <Button variant="ghost" size="icon" onClick={() => logout()} title="Logout">
                            <LogOut className="w-4 h-4" />
                        </Button>
                    </div>
                </header>

                {/* Stats */}
                <StatsGrid stats={data?.summary} />

                {/* Main Content */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Charts */}
                    <Charts providerBreakdown={data?.summary.providerBreakdown || {}} />

                    <div className="lg:col-span-2 space-y-6">
                        <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
                            <div className="p-6 flex flex-row items-center justify-between space-y-0 pb-2">
                                <h3 className="font-semibold leading-none tracking-tight">Recent Activity</h3>
                            </div>
                            <div className="p-6 pt-0">
                                <RecentActivity logs={data?.requests || []} />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6">
                        {/* Active Providers List - Placeholder for now, could be its own component */}
                        <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-6">
                            <h3 className="font-semibold mb-4">Active Providers</h3>
                            {/* We can fetch config or derive from activeProviders list in stats */}
                            <div className="space-y-2">
                                {data?.activeProviders?.map(p => (
                                    <div key={p} className="flex items-center gap-2 text-sm">
                                        <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                        <span className="uppercase">{p}</span>
                                    </div>
                                ))}
                                {!data?.activeProviders?.length && <p className="text-sm text-muted-foreground">No active providers</p>}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
