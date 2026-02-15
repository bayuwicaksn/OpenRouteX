import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { RequestLog } from "@/lib/api";
import { ScrollArea } from "@/components/ui/scroll-area";

interface RecentActivityProps {
    logs: RequestLog[];
}

export function RecentActivity({ logs }: RecentActivityProps) {
    // Take last 50 logs and reverse logic should be in parent or here
    // Assuming parent passes active/recent logs

    return (
        <div className="rounded-md border">
            <ScrollArea className="h-[400px]">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[100px]">Status</TableHead>
                            <TableHead>Time</TableHead>
                            <TableHead>Provider</TableHead>
                            <TableHead>Model</TableHead>
                            <TableHead className="text-right">Tokens</TableHead>
                            <TableHead className="text-right">Latency</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {logs.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="h-24 text-center">
                                    No requests yet.
                                </TableCell>
                            </TableRow>
                        ) : (
                            logs.map((log, i) => (
                                <TableRow key={i}>
                                    <TableCell>
                                        <Badge variant={log.success ? "outline" : "destructive"} className={log.success ? "text-green-500 border-green-500/20 bg-green-500/10" : ""}>
                                            {log.success ? "200 OK" : "Error"}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-xs text-muted-foreground">
                                        {new Date(log.timestamp).toLocaleTimeString()}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="secondary" className="font-mono text-xs">
                                            {log.provider}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-sm">{log.model}</TableCell>
                                    <TableCell className="text-right font-mono text-xs">
                                        {(log.promptTokens + log.completionTokens).toLocaleString()}
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-xs">
                                        {log.latencyMs}ms
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </ScrollArea>
        </div>
    );
}
