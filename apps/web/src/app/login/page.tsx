"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user, password }),
      });

      if (res.ok) {
        router.push("/");
        return;
      }

      const data = (await res.json()) as { error?: string };
      setError(data.error ?? "Login failed");
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 safe-top safe-bottom">
      <form
        onSubmit={handleSubmit}
        className="app-empty-state-card flex w-full max-w-sm flex-col gap-4 text-left"
      >
        <h1 className="text-center text-lg font-bold tracking-tight">
          Chatterbox
        </h1>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="user" className="text-xs">
            Username
          </Label>
          <Input
            id="user"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password" className="text-xs">
            Password
          </Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && (
          <p className="text-center text-sm text-destructive">{error}</p>
        )}
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Signing in..." : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
