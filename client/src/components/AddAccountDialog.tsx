import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface AddAccountDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const OAUTH_PROVIDERS = new Set(["antigravity", "openai-codex", "qwen-portal"]);

const PROVIDERS = [
    { value: "google", label: "Google Gemini", type: "API Key" },
    { value: "antigravity", label: "Google Antigravity", type: "Auth" },
    { value: "openai-codex", label: "OpenAI Codex", type: "Login" },
    { value: "openai", label: "OpenAI", type: "API Key" },
    { value: "qwen-portal", label: "Qwen Portal", type: "Auth" },
    { value: "qwen-dashscope", label: "Qwen DashScope", type: "API Key" },
    { value: "anthropic", label: "Anthropic", type: "API Key" },
    { value: "mistral", label: "Mistral", type: "API Key" },
    { value: "groq", label: "Groq", type: "API Key" },
    { value: "openrouter", label: "OpenRouter", type: "API Key" },
];

export function AddAccountDialog({ open, onOpenChange }: AddAccountDialogProps) {
    const [provider, setProvider] = useState("google");
    const [label, setLabel] = useState("");
    const [apiKey, setApiKey] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isOAuth = OAUTH_PROVIDERS.has(provider);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            await api.post("/profile", {
                provider,
                label,
                apiKey,
            });
            onOpenChange(false);
            toast.success("Account added successfully");
        } catch (err: any) {
            setError(err.response?.data?.error || err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleOAuthLogin = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const res = await api.post("/auth/login", {
                provider: provider,
                label: label || 'default'
            });
            if (res.data.success) {
                toast.success(`Authenticated as ${res.data.profile.label}`, {
                    description: `Provider: ${provider}`,
                });
                onOpenChange(false);
            }
        } catch (err: any) {
            setError(err.response?.data?.error || err.message);
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Add Account</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label>Provider</Label>
                        <Select value={provider} onValueChange={setProvider}>
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select a provider" />
                            </SelectTrigger>
                            <SelectContent>
                                {PROVIDERS.map((p) => (
                                    <SelectItem key={p.value} value={p.value}>
                                        <span className="flex items-center justify-between gap-3 w-full">
                                            <span>{p.label}</span>
                                            <span className="text-xs text-muted-foreground">{p.type}</span>
                                        </span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label>Label / Email</Label>
                        <Input
                            placeholder="user@example.com"
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            required={!isOAuth}
                        />
                    </div>

                    {isOAuth ? (
                        <div className="space-y-2">
                            <Label>Authentication</Label>
                            <Button type="button" variant="outline" className="w-full" onClick={handleOAuthLogin} disabled={isLoading}>
                                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                Connect {provider === 'antigravity' ? 'Google' : provider === 'qwen-portal' ? 'Qwen' : 'OpenAI'} Account
                            </Button>
                            <p className="text-xs text-muted-foreground text-center">Browser will open for sign-in</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <Label>API Key</Label>
                            <Input
                                type="password"
                                placeholder="sk-..."
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                required
                            />
                        </div>
                    )}

                    {error && <div className="text-sm text-destructive">{error}</div>}

                    <DialogFooter>
                        {!isOAuth && (
                            <Button type="submit" disabled={isLoading}>
                                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Save Account"}
                            </Button>
                        )}
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
