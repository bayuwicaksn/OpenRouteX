import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { fetchConfig, deleteProfile } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Trash2, Loader2, Search } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { ApiKeysTab } from "./ApiKeysTab";

interface ManagementDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function ManagementDialog({ open, onOpenChange }: ManagementDialogProps) {
    const { data, refetch, isLoading } = useQuery({
        queryKey: ["config"],
        queryFn: fetchConfig,
        enabled: open, // Only fetch when open
    });

    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [modelFilter, setModelFilter] = useState("");

    const handleDelete = async (id: string) => {
        if (!confirm(`Delete profile ${id}?`)) return;
        setDeletingId(id);
        try {
            await deleteProfile(id);
            await refetch();
        } catch (err) {
            alert("Failed to delete profile");
        } finally {
            setDeletingId(null);
        }
    };

    const filteredModels = data?.models.filter(m =>
        m.id.toLowerCase().includes(modelFilter.toLowerCase()) ||
        m.name.toLowerCase().includes(modelFilter.toLowerCase())
    ) || [];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>System Management</DialogTitle>
                </DialogHeader>

                {isLoading ? (
                    <div className="flex items-center justify-center flex-1">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <Tabs defaultValue="profiles" className="flex-1 flex flex-col overflow-hidden">
                        <TabsList>
                            <TabsTrigger value="profiles">Profiles</TabsTrigger>
                            <TabsTrigger value="models">Models</TabsTrigger>
                            <TabsTrigger value="providers">Providers</TabsTrigger>
                            <TabsTrigger value="apikeys">API Keys</TabsTrigger>
                        </TabsList>

                        <TabsContent value="apikeys" className="flex-1 overflow-hidden p-1">
                            <ScrollArea className="h-full pr-4">
                                <ApiKeysTab />
                            </ScrollArea>
                        </TabsContent>

                        <TabsContent value="profiles" className="flex-1 overflow-hidden">
                            <ScrollArea className="h-full pr-4">
                                <div className="space-y-4 pt-4">
                                    {data?.profiles.length === 0 && <p className="text-center text-muted-foreground">No profiles found.</p>}
                                    {data?.profiles.map(p => (
                                        <div key={p.id} className="flex items-center justify-between p-4 border rounded-lg">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center font-bold uppercase">
                                                    {p.provider.substring(0, 2)}
                                                </div>
                                                <div>
                                                    <div className="font-medium">{p.id}</div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {p.type} • {p.email || 'No email'}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Badge variant={p.state === 'ACTIVE' ? 'default' : p.state === 'COOLDOWN' ? 'secondary' : 'destructive'}>
                                                    {p.state}
                                                </Badge>
                                                <Button variant="ghost" size="icon" onClick={() => handleDelete(p.id)} disabled={deletingId === p.id}>
                                                    {deletingId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-destructive" />}
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        </TabsContent>

                        <TabsContent value="models" className="flex-1 overflow-hidden flex flex-col">
                            <div className="py-4">
                                <div className="relative">
                                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input placeholder="Filter models..." className="pl-8" value={modelFilter} onChange={(e) => setModelFilter(e.target.value)} />
                                </div>
                            </div>
                            <ScrollArea className="flex-1 pr-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4">
                                    {filteredModels.map(m => (
                                        <div key={m.id} className="p-4 border rounded-lg space-y-2">
                                            <div className="flex justify-between items-start">
                                                <div className="font-medium break-all">{m.id}</div>
                                                <Badge variant="outline" className="uppercase text-[10px]">{m.provider}</Badge>
                                            </div>
                                            <div className="text-sm text-muted-foreground">{m.name}</div>
                                            <div className="flex flex-wrap gap-1">
                                                {m.contextWindow && <Badge variant="secondary" className="text-[10px]">{m.contextWindow / 1000}k ctx</Badge>}
                                                {m.capabilities.map(c => <Badge key={c} variant="outline" className="text-[10px]">{c}</Badge>)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        </TabsContent>

                        <TabsContent value="providers" className="flex-1 overflow-hidden">
                            <ScrollArea className="h-full pr-4">
                                <div className="space-y-4 pt-4">
                                    {data?.providers.map(p => (
                                        <div key={p.id} className="p-4 border rounded-lg">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-12 h-12 rounded bg-muted flex items-center justify-center font-bold text-lg uppercase">
                                                        {p.id.substring(0, 2)}
                                                    </div>
                                                    <div>
                                                        <h3 className="font-bold">{p.name}</h3>
                                                        <p className="text-xs font-mono text-muted-foreground">{p.baseUrl}</p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-xs text-muted-foreground">Rate Limit</div>
                                                    <div className="font-mono text-sm">{p.rateLimits ? `${p.rateLimits.requestsPerMinute} RPM` : 'Unlimited'}</div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        </TabsContent>
                    </Tabs>
                )}
            </DialogContent>
        </Dialog>
    );
}
