import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, Copy, Check, Plus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

interface ApiKey {
    key_hash: string;
    prefix: string;
    label: string;
    created_at: number;
    last_used_at?: number;
    is_active: number;
}

interface NewKeyResponse {
    key: string;
    hash: string;
    prefix: string;
    label: string;
}

export function ApiKeysTab() {
    const queryClient = useQueryClient();
    const [newKeyLabel, setNewKeyLabel] = useState("");
    const [createdKey, setCreatedKey] = useState<NewKeyResponse | null>(null);
    const [copied, setCopied] = useState(false);

    // Fetch Keys
    const { data: keys = [], isLoading } = useQuery<ApiKey[]>({
        queryKey: ["api-keys"],
        queryFn: async () => {
            const res = await axios.get("/api/keys");
            return res.data.keys;
        },
    });

    // Create Key Mutation
    const createMutation = useMutation({
        mutationFn: async (label: string) => {
            const res = await axios.post("/api/keys", { label });
            return res.data;
        },
        onSuccess: (data) => {
            setCreatedKey(data);
            setNewKeyLabel("");
            queryClient.invalidateQueries({ queryKey: ["api-keys"] });
        },
    });

    // Delete Key Mutation
    const deleteMutation = useMutation({
        mutationFn: async (hash: string) => {
            await axios.delete(`/api/keys?hash=${hash}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["api-keys"] });
        },
    });

    const handleCopy = () => {
        if (createdKey) {
            navigator.clipboard.writeText(createdKey.key);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Generate New Key</CardTitle>
                    <CardDescription>Create a new API key for your client applications.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex gap-2">
                        <Input
                            placeholder="Key Label (e.g. 'Mobile App')"
                            value={newKeyLabel}
                            onChange={(e) => setNewKeyLabel(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && newKeyLabel && createMutation.mutate(newKeyLabel)}
                        />
                        <Button
                            onClick={() => createMutation.mutate(newKeyLabel)}
                            disabled={!newKeyLabel || createMutation.isPending}
                        >
                            {createMutation.isPending ? "Generating..." : <><Plus className="w-4 h-4 mr-2" /> Generate</>}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Label</TableHead>
                            <TableHead>Prefix</TableHead>
                            <TableHead>Created</TableHead>
                            <TableHead>Last Used</TableHead>
                            <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center py-4">Loading keys...</TableCell>
                            </TableRow>
                        ) : keys.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center py-4 text-muted-foreground">No API keys found.</TableCell>
                            </TableRow>
                        ) : (
                            keys.map((key) => (
                                <TableRow key={key.key_hash}>
                                    <TableCell className="font-medium">{key.label}</TableCell>
                                    <TableCell><code className="bg-muted px-1 py-0.5 rounded">{key.prefix}</code></TableCell>
                                    <TableCell>{new Date(key.created_at).toLocaleDateString()}</TableCell>
                                    <TableCell>
                                        {key.last_used_at ? new Date(key.last_used_at).toLocaleString() : "Never"}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                            onClick={() => deleteMutation.mutate(key.key_hash)}
                                            disabled={deleteMutation.isPending}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* New Key Dialog */}
            <Dialog open={!!createdKey} onOpenChange={(open) => !open && setCreatedKey(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>API Key Generated</DialogTitle>
                        <DialogDescription>
                            Please copy your new API key now. You won't be able to see it again!
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex items-center space-x-2 mt-4">
                        <div className="grid flex-1 gap-2">
                            <Input readOnly value={createdKey?.key || ""} />
                        </div>
                        <Button size="sm" onClick={handleCopy} className="px-3">
                            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </Button>
                    </div>

                    <DialogFooter className="sm:justify-start">
                        <Button type="button" variant="secondary" onClick={() => setCreatedKey(null)}>
                            Close
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
