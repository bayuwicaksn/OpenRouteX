import { useQuery } from "@tanstack/react-query";
import { fetchStats } from "@/lib/api";
import { StatsGrid } from "./StatsGrid";
import { RecentActivity } from "./RecentActivity";
import { Charts } from "./Charts";
import { Button } from "@/components/ui/button";
import { RefreshCw, Settings, MessageSquare, LogOut } from "lucide-react";
import { useState } from "react";
import { ModeToggle } from "./mode-toggle";
import { useAuth } from "@/hooks/use-auth";
import { SettingsView } from "./SettingsView";
import { ChatView } from "./ChatView";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function Dashboard() {
    const [view, setView] = useState<'dashboard' | 'settings' | 'chat'>('dashboard');
    const { logout } = useAuth();

    const { data, refetch, isFetching } = useQuery({
        queryKey: ["stats"],
        queryFn: fetchStats,
        refetchInterval: 5000,
        enabled: view === 'dashboard',
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
                    <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-green-500 border-green-500/30 bg-green-500/5 mr-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse mr-1.5" />
                            Online
                        </Badge>

                        <ModeToggle />

                        <Separator orientation="vertical" className="h-6 mx-1" />

                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" onClick={() => setView('chat')}>
                                    <MessageSquare className="w-4 h-4 mr-2" />
                                    Chat
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Test models with live chat</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button variant="outline" size="sm" onClick={() => setView('settings')}>
                                    <Settings className="w-4 h-4 mr-2" />
                                    Manage
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Manage accounts, models & API keys</TooltipContent>
                        </Tooltip>

                        <Separator orientation="vertical" className="h-6 mx-1" />

                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" onClick={() => refetch()} disabled={isFetching}>
                                    <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Refresh stats</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" onClick={() => logout()}>
                                    <LogOut className="w-4 h-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Logout</TooltipContent>
                        </Tooltip>
                    </div>
                </header>

                {/* Stats */}
                <StatsGrid stats={data?.summary} />

                {/* Main Content */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Charts */}
                    <Charts providerBreakdown={data?.summary.providerBreakdown || {}} />

                    <div className="lg:col-span-2 space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>Recent Activity</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <RecentActivity logs={data?.requests || []} />
                            </CardContent>
                        </Card>
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle>Active Providers</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                {data?.activeProviders?.map(p => (
                                    <div key={p} className="flex items-center gap-2 text-sm">
                                        <span className="w-2 h-2 rounded-full bg-green-500" />
                                        <span className="uppercase font-medium">{p}</span>
                                    </div>
                                ))}
                                {!data?.activeProviders?.length && <p className="text-sm text-muted-foreground">No active providers</p>}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
