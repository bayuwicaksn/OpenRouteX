import React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
    children: React.ReactNode;
    fallbackLabel?: string;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error(`[ErrorBoundary${this.props.fallbackLabel ? ` - ${this.props.fallbackLabel}` : ""}]`, error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <Card className="m-4 border-destructive/50">
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-destructive text-base">
                            <AlertTriangle className="w-4 h-4" />
                            {this.props.fallbackLabel || "Something went wrong"}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-32 whitespace-pre-wrap">
                            {this.state.error?.message}
                            {"\n"}
                            {this.state.error?.stack}
                        </pre>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => this.setState({ hasError: false, error: null })}
                        >
                            Try Again
                        </Button>
                    </CardContent>
                </Card>
            );
        }

        return this.props.children;
    }
}
