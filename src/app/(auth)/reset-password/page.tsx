"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
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
import { MessageSquare, Loader2 } from "lucide-react";

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();

  const [ready, setReady] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setReady(true);
      } else {
        setSessionError("Reset link is invalid or has expired. Please request a new one.");
      }
    });
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    router.push("/dashboard");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <Card className="w-full max-w-md border-slate-800 bg-slate-900">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-[#0084ff]/10">
            <MessageSquare className="h-6 w-6 text-[#0084ff]" />
          </div>
          <CardTitle className="text-xl text-white">Set new password</CardTitle>
          <CardDescription className="text-slate-400">
            Enter your new password below
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!ready && !sessionError ? (
            <div className="flex items-center justify-center py-8 text-slate-400">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : sessionError ? (
            <div className="flex flex-col gap-4">
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {sessionError}
              </div>
              <Button
                variant="outline"
                className="w-full border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
                onClick={() => router.push("/forgot-password")}
              >
                Request new reset link
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {error && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                  {error}
                </div>
              )}

              <div className="flex flex-col gap-2">
                <Label htmlFor="password" className="text-slate-300">
                  New password
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="border-slate-700 bg-slate-800 text-white placeholder:text-slate-500 focus-visible:border-[#0084ff] focus-visible:ring-[#0084ff]/20"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="confirm" className="text-slate-300">
                  Confirm password
                </Label>
                <Input
                  id="confirm"
                  type="password"
                  placeholder="Re-enter password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  className="border-slate-700 bg-slate-800 text-white placeholder:text-slate-500 focus-visible:border-[#0084ff] focus-visible:ring-[#0084ff]/20"
                />
              </div>

              <Button
                type="submit"
                disabled={saving}
                className="mt-2 h-10 w-full bg-[#0084ff] text-white hover:bg-[#0066cc] disabled:opacity-50"
              >
                {saving ? "Saving..." : "Update password"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
