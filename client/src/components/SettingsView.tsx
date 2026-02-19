import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { fetchConfig, deleteProfile } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Trash2, Loader2, Search, ArrowLeft } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { ApiKeysTab } from "./ApiKeysTab";
import { AddAccountForm } from "./AddAccountForm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface SettingsViewProps {
    onBack: () => void;
}

export function SettingsView({ onBack }: SettingsViewProps) {
    const { data, refetch, isLoading } = useQuery({
        queryKey: ["config"],
        queryFn: fetchConfig,
    });

    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [modelFilter, setModelFilter] = useState("");

    const handleDelete = async (id: string) => {
        setDeletingId(id);
        try {
            await deleteProfile(id);
            await refetch();
            toast.success("Profile deleted", {
                description: `Removed ${id}`,
            });
        } catch (err) {
            toast.error("Failed to delete profile", {
                description: "Please try again.",
            });
        } finally {
            setDeletingId(null);
        }
    };

    const filteredModels = data?.models.filter(m =>
        m.id.toLowerCase().includes(modelFilter.toLowerCase()) ||
        m.name.toLowerCase().includes(modelFilter.toLowerCase())
    ) || [];

    if (isLoading) {
        return (
            <div className="min-h-screen bg-background text-foreground flex flex-col">
                <header className="border-b bg-card px-6 py-4 flex items-center gap-4 sticky top-0 z-10">
                    <Button variant="ghost" size="icon" onClick={onBack}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <Skeleton className="h-6 w-24 mb-1" />
                        <Skeleton className="h-4 w-64" />
                    </div>
                </header>
                <div className="flex-1 p-6 max-w-7xl mx-auto w-full space-y-6">
                    <Skeleton className="h-10 w-96" />
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2 space-y-4">
                            {[...Array(3)].map((_, i) => (
                                <Skeleton key={i} className="h-20 w-full rounded-lg" />
                            ))}
                        </div>
                        <Skeleton className="h-64 w-full rounded-lg" />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background text-foreground flex flex-col">
            {/* Header */}
            <header className="border-b bg-card px-6 py-4 flex items-center gap-4 sticky top-0 z-10">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" onClick={onBack}>
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Back to Dashboard</TooltipContent>
                </Tooltip>
                <div>
                    <h1 className="text-xl font-bold">Settings</h1>
                    <p className="text-sm text-muted-foreground">Manage accounts, models, and system configuration</p>
                </div>
            </header>

            <div className="flex-1 p-6 max-w-7xl mx-auto w-full">
                <Tabs defaultValue="profiles" className="space-y-6">
                    <TabsList>
                        <TabsTrigger value="profiles">Profiles & Accounts</TabsTrigger>
                        <TabsTrigger value="models">Models</TabsTrigger>
                        <TabsTrigger value="providers">Providers</TabsTrigger>
                        <TabsTrigger value="apikeys">API Keys</TabsTrigger>
                    </TabsList>

                    <TabsContent value="profiles" className="space-y-6">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Management List (Existing Profiles) */}
                            <div className="lg:col-span-2 space-y-6">
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Connected Accounts</CardTitle>
                                        <CardDescription>Manage your connected LLM provider accounts.</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-4">
                                            {data?.profiles.length === 0 && <p className="text-center text-muted-foreground py-8">No profiles found.</p>}
                                            {data?.profiles.map(p => (
                                                <div key={p.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold uppercase text-primary">
                                                            {p.provider.substring(0, 2)}
                                                        </div>
                                                        <div>
                                                            <div className="font-medium flex items-center gap-2">
                                                                {p.id}
                                                                <Badge variant={p.state === 'ACTIVE' ? 'default' : p.state === 'COOLDOWN' ? 'secondary' : 'destructive'}>
                                                                    {p.state}
                                                                </Badge>
                                                            </div>
                                                            <div className="text-xs text-muted-foreground">
                                                                {p.type} • {p.email || 'No email'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <AlertDialog>
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <AlertDialogTrigger asChild>
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            disabled={deletingId === p.id}
                                                                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                                                        >
                                                                            {deletingId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                                                        </Button>
                                                                    </AlertDialogTrigger>
                                                                </TooltipTrigger>
                                                                <TooltipContent>Delete Profile</TooltipContent>
                                                            </Tooltip>
                                                            <AlertDialogContent>
                                                                <AlertDialogHeader>
                                                                    <AlertDialogTitle>Delete Profile</AlertDialogTitle>
                                                                    <AlertDialogDescription>
                                                                        Are you sure you want to delete profile <span className="font-mono font-semibold">{p.id}</span>? This action cannot be undone.
                                                                    </AlertDialogDescription>
                                                                </AlertDialogHeader>
                                                                <AlertDialogFooter>
                                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                                    <AlertDialogAction
                                                                        onClick={() => handleDelete(p.id)}
                                                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                                    >
                                                                        Delete
                                                                    </AlertDialogAction>
                                                                </AlertDialogFooter>
                                                            </AlertDialogContent>
                                                        </AlertDialog>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Add Account Section */}
                            <div>
                                <div className="sticky top-24">
                                    <AddAccountForm onSuccess={() => refetch()} />
                                </div>
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="apikeys">
                        <Card>
                            <CardHeader>
                                <CardTitle>API Keys</CardTitle>
                                <CardDescription>Manage API keys for accessing the Smart Router.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <ApiKeysTab />
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="models">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <div className="space-y-1">
                                    <CardTitle>Available Models</CardTitle>
                                    <CardDescription>Browse all models available through your connected providers.</CardDescription>
                                </div>
                                <div className="relative w-64">
                                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input placeholder="Filter models..." className="pl-8" value={modelFilter} onChange={(e) => setModelFilter(e.target.value)} />
                                </div>
                            </CardHeader>
                            <CardContent>
                                <ScrollArea className="h-[600px] pr-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-4">
                                        {filteredModels.map(m => (
                                            <div key={m.id} className="p-4 border rounded-lg space-y-2 hover:bg-muted/50 transition-colors">
                                                <div className="flex justify-between items-start gap-2">
                                                    <div className="font-medium break-all text-sm">{m.id}</div>
                                                    <Badge variant="outline" className="uppercase text-[10px] shrink-0">{m.provider}</Badge>
                                                </div>
                                                <div className="text-xs text-muted-foreground line-clamp-2" title={m.name}>{m.name}</div>
                                                <div className="flex flex-wrap gap-1 pt-2">
                                                    {m.contextWindow && <Badge variant="secondary" className="text-[10px]">{Math.round(m.contextWindow / 1000)}k ctx</Badge>}
                                                    {m.capabilities.map(c => <Badge key={c} variant="outline" className="text-[10px]">{c}</Badge>)}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </ScrollArea>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="providers">
                        <Card>
                            <CardHeader>
                                <CardTitle>Provider Information</CardTitle>
                                <CardDescription>Details about supported LLM providers.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {data?.providers.map(p => (
                                        <div key={p.id} className="p-4 border rounded-lg flex items-center justify-between hover:bg-muted/50 transition-colors">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded bg-muted flex items-center justify-center font-bold text-lg uppercase">
                                                    {p.id.substring(0, 2)}
                                                </div>
                                                <div>
                                                    <h3 className="font-bold">{p.name}</h3>
                                                    <p className="text-xs font-mono text-muted-foreground truncate max-w-[200px]" title={p.baseUrl}>{p.baseUrl}</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-xs text-muted-foreground">Rate Limit</div>
                                                <Badge variant="outline" className="font-mono text-xs">{p.rateLimits ? `${p.rateLimits.requestsPerMinute} RPM` : 'Unlimited'}</Badge>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}
