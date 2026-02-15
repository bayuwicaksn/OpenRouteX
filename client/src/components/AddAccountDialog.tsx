import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
// import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"; // Need to install select!
// Wait, I missed installing 'select' component.
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";

interface AddAccountDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function AddAccountDialog({ open, onOpenChange }: AddAccountDialogProps) {
    const [provider, setProvider] = useState("google");
    const [label, setLabel] = useState("");
    const [apiKey, setApiKey] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

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
            // Trigger refresh? Invalidate query in parent
        } catch (err: any) {
            setError(err.response?.data?.error || err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAntigravityAuth = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const res = await api.post("/auth/login", {
                provider: 'antigravity',
                label: label || 'default'
            });
            // Check if successful
            if (res.data.success) {
                alert(`Authenticated as ${res.data.profile.label}`);
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
                        {/* Simple select for now since I might not have shadcn select installed yet */}
                        <select
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            value={provider}
                            onChange={(e) => setProvider(e.target.value)}
                        >
                            <option value="google">Google Gemini (API Key)</option>
                            <option value="antigravity">Google Antigravity (Auth)</option>
                            <option value="openai">OpenAI</option>
                            <option value="anthropic">Anthropic</option>
                            <option value="mistral">Mistral</option>
                            <option value="groq">Groq</option>
                            <option value="openrouter">OpenRouter</option>
                        </select>
                    </div>

                    <div className="space-y-2">
                        <Label>Label / Email</Label>
                        <Input
                            placeholder="user@example.com"
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            required
                        />
                    </div>

                    {provider === "antigravity" ? (
                        <div className="space-y-2">
                            <Label>Authentication</Label>
                            <Button type="button" variant="outline" className="w-full" onClick={handleAntigravityAuth} disabled={isLoading}>
                                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                Connect Google Account
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

                    {error && <div className="text-sm text-red-500">{error}</div>}

                    <DialogFooter>
                        {provider !== "antigravity" && (
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
