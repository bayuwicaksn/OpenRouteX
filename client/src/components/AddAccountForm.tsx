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

    const submitManualCode = async (inputUrl: string) => {
        if (!inputUrl) return;

        // Extract code/state from URL or use raw if valid
        let targetUrl = inputUrl;

        // If it's a localhost URL, rewrite it to target the server's exposing port
        // But since we are on the client, we need to hit the server's public IP.
        // Actually, we can just proxy this request via our own backend or hit the port directly if exposed.
        // If 1455 is exposed, we can hit window.location.hostname:1455

        try {
            // Check if it's a url
            const urlObj = new URL(inputUrl);
            const code = urlObj.searchParams.get("code");
            const state = urlObj.searchParams.get("state");

            if (code && state) {
                // Construct URL pointing to the actual server port
                const protocol = window.location.protocol;
                const hostname = window.location.hostname;
                const port = "1455"; // Docker exposed port

                targetUrl = `${protocol}//${hostname}:${port}/auth/callback?code=${code}&state=${state}`;

                // If using https on main app but 1455 is http, mixed content block might occur.
                // But let's try.
            }
        } catch {
            // Not a URL? maybe just code? We need state too usually.
        }

        try {
            const res = await fetch(targetUrl, { mode: 'no-cors' });
            // opaque response with no-cors, but request is sent.
            alert("Code submitted to server! If successful, the 'Connecting...' state will finish shortly.");
        } catch (e: any) {
            alert("Failed to submit code: " + e.message + "\n\nMake sure port 1455 is allowed in your firewall.");
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
                                if (msg) msg.innerHTML = '<h3>Still waiting...</h3><p>Server is taking longer than expected.</p>';
                            }, 5000);
                            setTimeout(() => {
                                const msg = document.getElementById('msg');
                                if (msg) msg.innerHTML = '<h3 style="color:red">Error</h3><p>Timeout waiting for server URL.</p>';
                            }, 15000);
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

                // Keep the last part in the buffer as it might be incomplete
                buffer = lines.pop() || "";

                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (!trimmedLine || !trimmedLine.startsWith("data: ")) continue;

                    try {
                        const data = JSON.parse(trimmedLine.slice(6));

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
                                // Update status in popup if possible (cross-origin might block if already navigated, but fine before)
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

                            {/* Manual Input Fallback */}
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
