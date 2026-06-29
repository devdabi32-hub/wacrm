"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { EmailOtpType } from "@supabase/supabase-js";
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
import { Users, Loader2 } from "lucide-react";

/**
 * Invite-accept landing. The Supabase invite email redirects here with the
 * session in the URL (detected automatically by the browser client). The
 * invitee sets a password, which finalises their account; handle_new_user()
 * (migration 012) has already linked them to the workspace as an active
 * member. After saving we send them to the dashboard.
 */
export default function AcceptInvitePage() {
  const router = useRouter();
  const supabase = createClient();

  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;

    async function establish() {
      const url = new URL(window.location.href);
      const params = url.searchParams;
      // Supabase can report failures via query or hash.
      const errDesc =
        params.get("error_description") ??
        new URLSearchParams(url.hash.replace(/^#/, "")).get("error_description");
      if (errDesc) {
        if (active) {
          setLinkError(decodeURIComponent(errDesc));
          setChecking(false);
        }
        return;
      }

      const tokenHash = params.get("token_hash");
      const type = params.get("type");
      const code = params.get("code");

      // 1. token_hash flow (recommended for server-generated invites — no
      //    PKCE code_verifier needed, works across devices/browsers).
      if (tokenHash && type) {
        const { error: otpErr } = await supabase.auth.verifyOtp({
          type: type as EmailOtpType,
          token_hash: tokenHash,
        });
        if (!active) return;
        if (otpErr) setLinkError(otpErr.message);
        else setHasSession(true);
        setChecking(false);
        return;
      }

      // 2. PKCE code flow (works when the flow started in this browser).
      if (code) {
        const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
        if (!active) return;
        if (exErr) setLinkError(exErr.message);
        else setHasSession(true);
        setChecking(false);
        return;
      }

      // 3. Implicit hash tokens or an already-established session.
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setHasSession(!!data.session);
      setChecking(false);
    }

    establish();
    return () => {
      active = false;
    };
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
            <Users className="h-6 w-6 text-[#0084ff]" aria-hidden="true" />
          </div>
          <CardTitle className="text-xl text-white">Set your password</CardTitle>
          <CardDescription className="text-slate-400">
            You&apos;ve been invited to the team. Choose a password to finish.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {checking ? (
            <div className="flex items-center justify-center py-8 text-slate-400">
              <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            </div>
          ) : !hasSession ? (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              This invite link is invalid or has expired. Ask the workspace
              owner to send a new invite.
              {linkError && (
                <span className="mt-2 block text-xs text-red-400/70">
                  ({linkError})
                </span>
              )}
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
                  name="password"
                  autoComplete="new-password"
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
                  name="confirm"
                  autoComplete="new-password"
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
                {saving ? "Saving…" : "Set password & continue"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
