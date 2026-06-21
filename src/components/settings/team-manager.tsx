'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Mail, UserPlus, Trash2, Clock, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Member {
  id: string;
  invited_email: string;
  role: string;
  status: 'invited' | 'active' | 'revoked';
  member_id: string | null;
  invited_at: string;
  accepted_at: string | null;
}

const STATUS_META: Record<
  Member['status'],
  { label: string; className: string; icon: typeof Clock }
> = {
  active: {
    label: 'Active',
    className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    icon: CheckCircle2,
  },
  invited: {
    label: 'Invite pending',
    className: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    icon: Clock,
  },
  revoked: {
    label: 'Revoked',
    className: 'bg-slate-600/10 text-slate-400 border-slate-600/20',
    icon: Trash2,
  },
};

/**
 * Team / User Access — owner-only. Invite members by email (they set their
 * own password via the Supabase invite link) and revoke access. Once active,
 * a member shares the owner's entire workspace (contacts, inbox, pipelines…).
 */
export function TeamManager() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/team', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to load team');
      setMembers(json.members ?? []);
    } catch (err) {
      console.error('[TeamManager] load failed:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to load team');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!value) {
      toast.error('Enter an email to invite');
      return;
    }
    setInviting(true);
    try {
      const res = await fetch('/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: value }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Invite failed');
      toast.success(`Invite sent to ${value}`);
      setEmail('');
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Invite failed');
    } finally {
      setInviting(false);
    }
  }

  async function handleRevoke(member: Member) {
    setRevokingId(member.id);
    try {
      const res = await fetch(`/api/team/${member.id}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Revoke failed');
      toast.success(`Access revoked for ${member.invited_email}`);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Revoke failed');
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="border-slate-700 bg-slate-900">
        <CardContent className="pt-6">
          <div className="mb-4 flex items-center gap-2">
            <UserPlus className="size-5 text-[#0084ff]" />
            <h2 className="text-lg font-semibold text-white">Invite a team member</h2>
          </div>
          <p className="mb-4 text-sm text-slate-400">
            They&apos;ll get an email to set their own password. Once they accept,
            they can access this workspace&apos;s inbox, contacts and pipelines.
          </p>
          <form onSubmit={handleInvite} className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <Label htmlFor="invite-email" className="sr-only">
                Email
              </Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="teammate@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={inviting}
                className="border-slate-700 bg-slate-800 text-white placeholder:text-slate-500 focus-visible:border-[#0084ff] focus-visible:ring-[#0084ff]/20"
              />
            </div>
            <Button
              type="submit"
              disabled={inviting}
              className="bg-[#0084ff] text-white hover:bg-[#0066cc] disabled:opacity-50"
            >
              {inviting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Mail className="size-4" />
              )}
              Send invite
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-slate-700 bg-slate-900">
        <CardContent className="pt-6">
          <h2 className="mb-4 text-lg font-semibold text-white">Members</h2>

          {loading ? (
            <div className="flex items-center justify-center py-8 text-slate-400">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : members.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              No team members yet. Invite someone above.
            </p>
          ) : (
            <ul className="divide-y divide-slate-800">
              {members.map((m) => {
                const meta = STATUS_META[m.status];
                const StatusIcon = meta.icon;
                return (
                  <li
                    key={m.id}
                    className="flex items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">
                        {m.invited_email}
                      </p>
                      <p className="text-xs text-slate-500">
                        Invited {new Date(m.invited_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={`gap-1 ${meta.className}`}
                      >
                        <StatusIcon className="size-3" />
                        {meta.label}
                      </Badge>
                      {m.status !== 'revoked' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRevoke(m)}
                          disabled={revokingId === m.id}
                          className="text-slate-400 hover:bg-red-500/10 hover:text-red-400"
                        >
                          {revokingId === m.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Trash2 className="size-4" />
                          )}
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
