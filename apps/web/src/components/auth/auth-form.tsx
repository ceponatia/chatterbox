"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

type AuthMode = "login" | "register";

interface AuthFields {
  user: string;
  email: string;
  password: string;
  confirmPassword: string;
}

function validateRegistrationInput({
  user,
  password,
  confirmPassword,
}: Pick<AuthFields, "user" | "password" | "confirmPassword">): string | null {
  if (user.length < 3 || user.length > 50) {
    return "Username must be 3-50 characters";
  }
  if (password.length < 8) {
    return "Password must be at least 8 characters";
  }
  if (password !== confirmPassword) {
    return "Passwords do not match";
  }
  return null;
}

async function submitAuthRequest(
  mode: AuthMode,
  fields: Pick<AuthFields, "user" | "email" | "password">,
): Promise<Response> {
  const url = mode === "register" ? "/api/auth/register" : "/api/auth/login";
  const body =
    mode === "register"
      ? {
          username: fields.user,
          password: fields.password,
          ...(fields.email ? { email: fields.email } : {}),
        }
      : { user: fields.user, password: fields.password };

  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function getErrorMessage(
  response: Response,
  mode: AuthMode,
): Promise<string> {
  const data = (await response.json()) as { error?: string };
  return (
    data.error ?? (mode === "register" ? "Registration failed" : "Login failed")
  );
}

function UsernameField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
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
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
      />
    </div>
  );
}

function EmailField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="email" className="text-xs">
        Email <span className="text-muted-foreground">(optional)</span>
      </Label>
      <Input
        id="email"
        type="email"
        autoComplete="email"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function PasswordField({
  isRegister,
  value,
  onChange,
}: {
  isRegister: boolean;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="password" className="text-xs">
        Password
      </Label>
      <Input
        id="password"
        type="password"
        autoComplete={isRegister ? "new-password" : "current-password"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
      />
    </div>
  );
}

function ConfirmPasswordField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="confirm-password" className="text-xs">
        Confirm password
      </Label>
      <Input
        id="confirm-password"
        type="password"
        autoComplete="new-password"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
      />
    </div>
  );
}

function SubmitButton({ loading, mode }: { loading: boolean; mode: AuthMode }) {
  if (loading) {
    return (
      <Button type="submit" disabled={true} className="w-full">
        {mode === "register" ? "Creating account..." : "Signing in..."}
      </Button>
    );
  }

  return (
    <Button type="submit" disabled={false} className="w-full">
      {mode === "register" ? "Create account" : "Sign in"}
    </Button>
  );
}

function ModeToggle({
  isRegister,
  onToggle,
}: {
  isRegister: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="text-center text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      {isRegister
        ? "Already have an account? Sign in"
        : "Don't have an account? Register"}
    </button>
  );
}

export function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("login");
  const [user, setUser] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isRegister = mode === "register";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");

    const validationError = isRegister
      ? validateRegistrationInput({ user, password, confirmPassword })
      : null;

    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);

    try {
      const response = await submitAuthRequest(mode, { user, email, password });
      if (response.ok) {
        router.push("/");
        return;
      }
      setError(await getErrorMessage(response, mode));
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  function toggleMode() {
    setMode(isRegister ? "login" : "register");
    setError("");
    setConfirmPassword("");
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="app-empty-state-card flex w-full max-w-sm flex-col gap-4 text-left"
    >
      <h1 className="text-center text-lg font-bold tracking-tight">
        Chatterbox
      </h1>
      <UsernameField value={user} onChange={setUser} />
      {isRegister ? <EmailField value={email} onChange={setEmail} /> : null}
      <PasswordField
        isRegister={isRegister}
        value={password}
        onChange={setPassword}
      />
      {isRegister ? (
        <ConfirmPasswordField
          value={confirmPassword}
          onChange={setConfirmPassword}
        />
      ) : null}
      {error ? (
        <p className="text-center text-sm text-destructive">{error}</p>
      ) : null}
      <SubmitButton loading={loading} mode={mode} />
      <ModeToggle isRegister={isRegister} onToggle={toggleMode} />
    </form>
  );
}
