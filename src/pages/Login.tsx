import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { loginWithToken } from "@/lib/auth";

export default function Login() {
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const result = await loginWithToken(token);
    setLoading(false);
    if (result.ok) {
      const from = params.get("from");
      navigate(from && from.startsWith("/") ? from : "/", { replace: true });
      return;
    }
    setError(result.message || "Login gagal.");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border/60">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <ShieldCheck className="w-6 h-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-xl">Masuk ke Dashboard</CardTitle>
          <CardDescription>Smart AI HSE — Computer Vision Analytics</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="access-token">Access token</Label>
              <Input
                id="access-token"
                type="password"
                autoComplete="current-password"
                placeholder="Tempel access token operator / admin"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                autoFocus
              />
            </div>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Memproses..." : "Masuk"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
