import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

interface AddAccountFormProps {
    onSuccess?: () => void;
}

export function AddAccountForm({ onSuccess }: AddAccountFormProps) {
    const [provider, setProvider] = useState("google");
    const [label, setLabel] = useState("");
    const [apiKey, setApiKey] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [authUrl, setAuthUrl] = useState<string | null>(null);

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
            // Reset form
            setLabel("");
            setApiKey("");
            onSuccess?.();
        } catch (err: any) {
            setError(err.response?.data?.error || err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleOAuthLogin = async () => {
        setIsLoading(true);
        setError(null);
        setAuthUrl(null);

        // [Popup Fix] Open window immediately (Trusted Event) to bypass blocker
        // We keep a reference to it and update the URL later.
        const authWindow = window.open('', '_blank', 'width=600,height=700');
        if (authWindow) {
            authWindow.document.write('<html><body style="font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background: #f9f9f9;"><h3>Preparing authentication...</h3></body></html>');
        }

        try {
            const response = await fetch("/api/auth/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    provider: provider,
                    label: label || 'default'
                }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || response.statusText);
            }

            const reader = response.body?.getReader();
            if (!reader) throw new Error("No response body");

            const decoder = new TextDecoder();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split("\n").filter(line => line.trim() !== "");

                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        try {
                            const data = JSON.parse(line.slice(6));

                            if (data.action === "open_url") {
                                console.log("[Auth] Opening URL:", data.url);
                                setAuthUrl(data.url);

                                // [Popup Fix] Update the existing window
                                if (authWindow && !authWindow.closed) {
                                    authWindow.location.href = data.url;
                                } else {
                                    // Fallback if user somehow closed it or it failed
                                    window.open(data.url, "_blank");
                                }

                            } else if (data.success) {
                                alert(`Authenticated as ${data.profile?.label}`);
                                if (authWindow && !authWindow.closed) authWindow.close(); // Close on success
                                onSuccess?.();
                                return;
                            } else if (data.error) {
                                throw new Error(data.error);
                            } else if (data.action === "log" || data.action === "progress") {
                                console.log(`[Auth] ${data.message}`);
                                if (authWindow && !authWindow.closed && data.action === "progress") {
                                    // Optional: Could update the loading message in the window, but specific URL is better
                                }
                            }
                        } catch (e: any) {
                            if (e.message) setError(e.message);
                            else console.error("Error parsing auth stream", e);
                        }
                    }
                }
            }

        } catch (err: any) {
            setError(err.message || "Authentication failed");
            if (authWindow && !authWindow.closed) authWindow.close(); // Close on error
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Add New Account</CardTitle>
                <CardDescription>Connect a new AI provider account.</CardDescription>
            </CardHeader>
            <CardContent>
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
                            <option value="openai-codex">OpenAI Codex (Login)</option>
                            <option value="openai">OpenAI (API Key)</option>
                            <option value="qwen-portal">Qwen Portal (Auth)</option>
                            <option value="qwen-dashscope">Qwen DashScope (API Key)</option>
                            <option value="anthropic">Anthropic</option>
                            <option value="mistral">Mistral</option>
                            <option value="groq">Groq</option>
                            <option value="openrouter">OpenRouter</option>
                            <option value="nvidia">Nvidia NIM</option>
                        </select>
                    </div>

                    {!(provider === "antigravity" || provider === "openai-codex" || provider === "qwen-portal") && (
                        <div className="space-y-2">
                            <Label>Label / Email</Label>
                            <Input
                                placeholder="user@example.com"
                                value={label}
                                onChange={(e) => setLabel(e.target.value)}
                                required
                            />
                        </div>
                    )}

                    {(provider === "antigravity" || provider === "openai-codex" || provider === "qwen-portal") ? (
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

                    {authUrl && (
                        <div className="p-3 mb-2 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-md text-sm">
                            <p className="font-medium mb-1 text-blue-700 dark:text-blue-300">Popup blocked? Click to login:</p>
                            <a
                                href={authUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="break-all text-blue-600 dark:text-blue-400 underline hover:text-blue-800 dark:hover:text-blue-200"
                            >
                                {authUrl}
                            </a>
                        </div>
                    )}
                    {error && <div className="text-sm text-red-500">{error}</div>}
                </form>
            </CardContent>
            <CardFooter>
                {!(provider === "antigravity" || provider === "openai-codex" || provider === "qwen-portal") && (
                    <Button type="submit" onClick={handleSubmit} disabled={isLoading} className="w-full">
                        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Save Account"}
                    </Button>
                )}
            </CardFooter>
        </Card>
    );
}
