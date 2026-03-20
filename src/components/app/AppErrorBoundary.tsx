import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface AppErrorBoundaryProps {
  children: React.ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class AppErrorBoundary extends React.Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    hasError: false,
    errorMessage: "",
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || "Terjadi error runtime pada aplikasi.",
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("AppErrorBoundary caught an error", error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen bg-background px-6 py-10">
        <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-3xl items-center justify-center">
          <Card className="w-full border-destructive/30 bg-card/95 shadow-xl">
            <CardHeader className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/15 text-destructive">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <div>
                  <CardTitle>Aplikasi Mengalami Error Runtime</CardTitle>
                  <CardDescription>
                    Halaman gagal dirender. Refresh aplikasi untuk mencoba lagi, lalu cek browser
                    console jika masalah tetap berulang.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-border/70 bg-secondary/30 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  Error Message
                </p>
                <p className="mt-2 break-words text-sm text-foreground">
                  {this.state.errorMessage}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button onClick={this.handleReload} className="gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Reload Aplikasi
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }
}
