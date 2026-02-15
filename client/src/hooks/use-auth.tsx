import { createContext, useContext, useEffect, useState } from "react";
import axios from "axios";

interface AuthContextType {
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (password: string) => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    const checkAuth = async () => {
        try {
            const res = await axios.get("/api/auth/status");
            setIsAuthenticated(res.data.authenticated);
        } catch {
            setIsAuthenticated(false);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        checkAuth();
    }, []);

    const login = async (password: string) => {
        await axios.post("/api/auth/dashboard-login", { password });
        await checkAuth();
    };

    const logout = async () => {
        await axios.post("/api/auth/logout");
        setIsAuthenticated(false);
    };

    return (
        <AuthContext.Provider value={{ isAuthenticated, isLoading, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
}
