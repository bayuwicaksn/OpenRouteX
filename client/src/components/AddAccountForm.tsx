import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

interface AddAccountFormProps {
    onSuccess?: () => void;
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
    { value: "nvidia", label: "Nvidia NIM", type: "API Key" },
];

export function AddAccountForm({ onSuccess }: AddAccountFormProps) {
    const [provider, setProvider] = useState("google");
    const [label, setLabel] = useState("");
    const [apiKey, setApiKey] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [authUrl, setAuthUrl] = useState<string | null>(null);

    const isOAuth = OAUTH_PROVIDERS.has(provider);

    const submitManualCode = async (inputUrl: string) => {
        if (!inputUrl) return;

        let targetUrl = inputUrl;

        try {
            const urlObj = new URL(inputUrl);
            const code = urlObj.searchParams.get("code");
            const state = urlObj.searchParams.get("state");

            if (code && state) {
                const protocol = window.location.protocol;
                const hostname = window.location.hostname;
                const port = "1455";

                targetUrl = `${protocol}//${hostname}:${port}/auth/callback?code=${code}&state=${state}`;
            }
        } catch {
            // Not a URL
        }

        try {
            await fetch(targetUrl, { mode: 'no-cors' });
            toast.success("Code submitted to server!", {
                description: "If successful, the connection will complete shortly.",
            });
        } catch (e: any) {
            toast.error("Failed to submit code", {
                description: e.message + "\n\nMake sure port 1455 is allowed in your firewall.",
            });
        }
    };

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
            setLabel("");
            setApiKey("");
            toast.success("Account added successfully");
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

        const authWindow = window.open('', '_blank', 'width=600,height=700');
        if (authWindow) {
            authWindow.document.write(`
                <html>
                    <body style="font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background: #f9f9f9; text-align: center;">
                        <div id="msg">
                            <h3>Preparing authentication...</h3>
                            <p>Connecting to server...</p>
                        </div>
                        <script>
                            setTimeout(() => {
                                const msg = document.getElementById('msg');
                                if (msg) msg.innerHTML = '<h3>Still waiting...</h3><p>Waiting for authentication approval...</p>';
                            }, 10000);
                            setTimeout(() => {
                                const msg = document.getElementById('msg');
                                if (msg) msg.innerHTML = '<h3 style="color:red">Error</h3><p>Timeout waiting for server response. Please try again.</p>';
                            }, 60000);
                        </script>
                    </body>
                </html>
            `);
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
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                buffer += chunk;
                const lines = buffer.split("\n");

                buffer = lines.pop() || "";

                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (!trimmedLine || !trimmedLine.startsWith("data: ")) continue;

                    try {
                        const data = JSON.parse(trimmedLine.slice(6));

                        if (data.action === "open_url") {
                            console.log("[Auth] Opening URL:", data.url);
                            setAuthUrl(data.url);

                            if (authWindow && !authWindow.closed) {
                                authWindow.location.href = data.url;
                            } else {
                                window.open(data.url, "_blank");
                            }

                        } else if (data.success) {
                            toast.success(`Authenticated as ${data.profile?.label}`, {
                                description: `Provider: ${provider}`,
                            });
                            if (authWindow && !authWindow.closed) authWindow.close();
                            onSuccess?.();
                            return;
                        } else if (data.error) {
                            throw new Error(data.error);
                        } else if (data.action === "log" || data.action === "progress") {
                            console.log(`[Auth] ${data.message}`);
                            if (authWindow && !authWindow.closed && data.action === "progress") {
                                try {
                                    authWindow.document.body.innerHTML = `<h3>Authentication in progress...</h3><p>${data.message}</p>`;
                                } catch (e) { /* ignore cross-origin errors */ }
                            }
                        }
                    } catch (e: any) {
                        if (e.message) setError(e.message);
                        else console.error("Error parsing auth stream", e);
                    }
                }
            }

        } catch (err: any) {
            setError(err.message || "Authentication failed");
            if (authWindow && !authWindow.closed) authWindow.close();
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

                    {!isOAuth && (
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

                    {authUrl && (
                        <div className="space-y-4">
                            <div className="p-3 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-md text-sm">
                                <p className="font-medium mb-1 text-blue-700 dark:text-blue-300">Authentication Started</p>
                                <p className="mb-2">If the popup didn't open, click here:</p>
                                <a
                                    href={authUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="break-all text-blue-600 dark:text-blue-400 underline hover:text-blue-800 dark:hover:text-blue-200 block mb-2"
                                >
                                    Open Login Page
                                </a>
                            </div>

                            {provider === "openai-codex" && (
                                <div className="p-4 border rounded-md bg-yellow-50 dark:bg-yellow-900/10 border-yellow-200 dark:border-yellow-800">
                                    <p className="text-sm font-semibold text-yellow-800 dark:text-yellow-200 mb-2">
                                        Remote Server / Docker Issue?
                                    </p>
                                    <p className="text-xs text-yellow-700 dark:text-yellow-300 mb-2">
                                        If "Refused to connect" appears, copy the full URL from your browser's address bar (starting with <code>http://localhost:1455/...</code>) and paste it below:
                                    </p>
                                    <div className="flex gap-2">
                                        <Input
                                            placeholder="Paste http://localhost:1455/auth/callback?code=..."
                                            className="flex-1 text-xs"
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    const val = (e.target as HTMLInputElement).value;
                                                    if (val) submitManualCode(val);
                                                }
                                            }}
                                        />
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            onClick={(e) => {
                                                const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                                                submitManualCode(input.value);
                                            }}
                                        >
                                            Submit
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    {error && <div className="text-sm text-destructive">{error}</div>}
                </form>
            </CardContent>
            <CardFooter>
                {!isOAuth && (
                    <Button type="submit" onClick={handleSubmit} disabled={isLoading} className="w-full">
                        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Save Account"}
                    </Button>
                )}
            </CardFooter>
        </Card>
    );
}
