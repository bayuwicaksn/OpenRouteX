import { useState, useRef, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Send, Bot, User, Loader2, ArrowLeft, Brain } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { fetchConfig, type ChatMessage } from "@/lib/api";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

interface ChatViewProps {
    onBack: () => void;
}

export function ChatView({ onBack }: ChatViewProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [selectedModel, setSelectedModel] = useState<string>("");
    const [enableReasoning, setEnableReasoning] = useState(true);
    const scrollRef = useRef<HTMLDivElement>(null);

    const { data: config } = useQuery({
        queryKey: ["config"],
        queryFn: fetchConfig,
    });

    const models = useMemo(() => config?.models ?? [], [config]);
    const availableProviders = useMemo(
        () => new Set(config?.providers?.map(p => p.id) ?? []),
        [config]
    );

    const availableModels = useMemo(
        () => models.filter(m => availableProviders.has(m.provider) || m.provider === "router"),
        [models, availableProviders]
    );
    const unavailableModels = useMemo(
        () => models.filter(m => !availableProviders.has(m.provider) && m.provider !== "router"),
        [models, availableProviders]
    );

    // Auto-select first available model on load
    useEffect(() => {
        if (availableModels.length > 0 && !selectedModel) {
            setSelectedModel(availableModels[0].id);
        }
    }, [availableModels.length, selectedModel]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isLoading]);

    const handleSend = async () => {
        if (!input.trim() || !selectedModel) return;

        const userMsg: ChatMessage = { role: "user", content: input };
        setMessages(prev => [...prev, userMsg]);
        setInput("");
        setIsLoading(true);

        const assistantMsg: ChatMessage = { role: "assistant", content: "", reasoning: "" };
        setMessages(prev => [...prev, assistantMsg]);

        try {
            const response = await fetch("/v1/chat/completions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: selectedModel,
                    messages: [...messages, userMsg],
                    stream: true,
                    enable_thinking: enableReasoning,
                }),
            });

            if (!response.body) throw new Error("No response body");

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let accumulatedContent = "";
            let accumulatedReasoning = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split("\n").filter(line => line.trim() !== "");

                for (const line of lines) {
                    if (line === "data: [DONE]") continue;
                    if (line.startsWith("data: ")) {
                        try {
                            const json = JSON.parse(line.slice(6));
                            const delta = json.choices[0]?.delta;

                            if (delta?.reasoning_content) {
                                accumulatedReasoning += delta.reasoning_content;
                            }
                            if (delta?.content) {
                                accumulatedContent += delta.content;
                            }

                            setMessages(prev => {
                                const newMessages = [...prev];
                                const lastMsg = newMessages[newMessages.length - 1];
                                if (lastMsg.role === "assistant") {
                                    let displayContent = accumulatedContent;
                                    let extraReasoning = "";

                                    const thinkMatch = accumulatedContent.match(/<think>(.*?)<\/think>/s);
                                    if (thinkMatch) {
                                        extraReasoning = thinkMatch[1];
                                        displayContent = accumulatedContent.replace(/<think>.*?<\/think>/s, "").trim();
                                    } else if (accumulatedContent.includes("<think>")) {
                                        const startIndex = accumulatedContent.indexOf("<think>");
                                        extraReasoning = accumulatedContent.slice(startIndex + 7);
                                        displayContent = accumulatedContent.slice(0, startIndex).trim();
                                    }

                                    lastMsg.content = displayContent;
                                    lastMsg.reasoning = accumulatedReasoning || extraReasoning;
                                }
                                return newMessages;
                            });
                        } catch (e) {
                            console.error("Error parsing stream chunk", e);
                        }
                    }
                }
            }
        } catch (err) {
            console.error(err);
            setMessages(prev => {
                const newMessages = [...prev];
                const lastMsg = newMessages[newMessages.length - 1];
                if (lastMsg.role === "assistant") {
                    lastMsg.content += "\n[Error: Failed to send message]";
                }
                return newMessages;
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-100px)] bg-background">
            {/* Header with Model Selector */}
            <div className="flex items-center justify-between p-4 border-b">
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={onBack}>
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <h2 className="text-lg font-semibold">Chat</h2>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <Switch
                            id="thinking-toggle"
                            checked={enableReasoning}
                            onCheckedChange={setEnableReasoning}
                        />
                        <Label htmlFor="thinking-toggle" className="text-sm flex items-center gap-1.5 cursor-pointer">
                            <Brain className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Thinking</span>
                        </Label>
                    </div>
                    <Separator orientation="vertical" className="h-6" />
                    {models.length === 0 ? (
                        <Button variant="outline" className="w-[220px] justify-start text-muted-foreground" disabled>
                            No models available
                        </Button>
                    ) : (
                        <Select value={selectedModel || undefined} onValueChange={setSelectedModel}>
                            <SelectTrigger className="w-[220px]">
                                <SelectValue placeholder="Select a model" />
                            </SelectTrigger>
                            <SelectContent>
                                {availableModels.length > 0 && (
                                    <SelectGroup>
                                        <SelectLabel>Available Models</SelectLabel>
                                        {availableModels.map(m => (
                                            <SelectItem key={m.id} value={m.id}>
                                                🟢 {m.name}
                                            </SelectItem>
                                        ))}
                                    </SelectGroup>
                                )}
                                {unavailableModels.length > 0 && (
                                    <>
                                        <SelectSeparator />
                                        <SelectGroup>
                                            <SelectLabel>Unavailable (Provider Offline)</SelectLabel>
                                            {unavailableModels.map(m => (
                                                <SelectItem key={m.id} value={m.id}>
                                                    🔴 {m.name} ({m.provider})
                                                </SelectItem>
                                            ))}
                                        </SelectGroup>
                                    </>
                                )}
                            </SelectContent>
                        </Select>
                    )}
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 p-4 overflow-y-auto" ref={scrollRef}>
                <div className="space-y-4 max-w-3xl mx-auto">
                    {messages.length === 0 && (
                        <div className="text-center text-muted-foreground mt-20">
                            <Bot className="w-12 h-12 mx-auto mb-4 opacity-20" />
                            <p>Start a conversation with {selectedModel || "AI"}</p>
                        </div>
                    )}
                    {messages.map((msg, i) => (
                        <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                            {msg.role === "assistant" && (
                                <Avatar className="w-8 h-8">
                                    <AvatarFallback><Bot className="w-4 h-4" /></AvatarFallback>
                                </Avatar>
                            )}
                            <div className={`p-3 rounded-lg max-w-[80%] whitespace-pre-wrap ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                                {msg.reasoning && (
                                    <details className="mb-2 text-xs text-muted-foreground border-l-2 border-primary/20 pl-2">
                                        <summary className="cursor-pointer font-medium hover:text-primary">Thinking Process</summary>
                                        <div className="mt-1 italic whitespace-pre-wrap">{msg.reasoning}</div>
                                    </details>
                                )}
                                {msg.content}
                            </div>
                            {msg.role === "user" && (
                                <Avatar className="w-8 h-8">
                                    <AvatarFallback><User className="w-4 h-4" /></AvatarFallback>
                                </Avatar>
                            )}
                        </div>
                    ))}
                    {isLoading && (
                        <div className="flex gap-3 justify-start">
                            <Avatar className="w-8 h-8">
                                <AvatarFallback><Bot className="w-4 h-4" /></AvatarFallback>
                            </Avatar>
                            <div className="bg-muted p-3 rounded-lg">
                                <Loader2 className="w-4 h-4 animate-spin" />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Input Area */}
            <div className="p-4 border-t">
                <div className="max-w-3xl mx-auto flex gap-2">
                    <Input
                        placeholder="Type a message..."
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                    />
                    <Button onClick={handleSend} disabled={isLoading || !input.trim()}>
                        <Send className="w-4 h-4" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
