import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock } from "lucide-react";

export default function Login() {
    const { login } = useAuth();
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            await login(password);
        } catch (err: any) {
            setError(err.response?.data?.error || "Login failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
            <Card className="w-full max-w-sm">
                <CardHeader className="space-y-1">
                    <div className="flex justify-center mb-4">
                        <div className="rounded-full bg-primary/10 p-3 text-primary">
                            <Lock className="h-6 w-6" />
                        </div>
                    </div>
                    <CardTitle className="text-2xl text-center">OpenRouteX</CardTitle>
                    <CardDescription className="text-center">
                        Enter admin password to access dashboard
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Input
                                type="password"
                                placeholder="Password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                disabled={loading}
                            />
                        </div>
                        {error && (
                            <div className="text-sm text-destructive text-center">
                                {error}
                            </div>
                        )}
                        <Button className="w-full" type="submit" disabled={loading}>
                            {loading ? "Verifying..." : "Login"}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
