'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Building2, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { getOwnerId } from '@/lib/workspace/owner';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export function BusinessSettingsForm() {
  const supabase = createClient();
  const { user, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [businessName, setBusinessName] = useState('');
  const [supportPhone, setSupportPhone] = useState('');
  const [upiId, setUpiId] = useState('');
  const [paymentQrUrl, setPaymentQrUrl] = useState('');
  const [paymentNote, setPaymentNote] = useState('');

  const loadSettings = useCallback(async () => {
    if (!user) return;
    const ownerId = await getOwnerId(supabase, user.id);
    const { data } = await supabase
      .from('whatsapp_config')
      .select('business_name, support_phone, upi_id, payment_qr_url, payment_note')
      .eq('user_id', ownerId)
      .maybeSingle();

    if (data) {
      setBusinessName(data.business_name ?? '');
      setSupportPhone(data.support_phone ?? '');
      setUpiId(data.upi_id ?? '');
      setPaymentQrUrl(data.payment_qr_url ?? '');
      setPaymentNote(data.payment_note ?? '');
    }
    setLoading(false);
  }, [user, supabase]);

  useEffect(() => {
    if (!authLoading) loadSettings();
  }, [authLoading, loadSettings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);

    const ownerId = await getOwnerId(supabase, user.id);
    const { error } = await supabase
      .from('whatsapp_config')
      .update({
        business_name: businessName.trim() || null,
        support_phone: supportPhone.trim() || null,
        upi_id: upiId.trim() || null,
        payment_qr_url: paymentQrUrl.trim() || null,
        payment_note: paymentNote.trim() || null,
      })
      .eq('user_id', ownerId);

    setSaving(false);
    if (error) {
      toast.error('Failed to save settings. Please try again.');
    } else {
      toast.success('Business settings saved.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-400">
        <Loader2 className="size-5 animate-spin" aria-hidden="true" />
      </div>
    );
  }

  return (
    <Card className="border-slate-700 bg-slate-900">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Building2 className="size-5 text-[#0084ff]" aria-hidden="true" />
          <CardTitle className="text-white">Business Settings</CardTitle>
        </div>
        <CardDescription className="text-slate-400">
          These details are used by the AI assistant to answer customer queries about payment and support.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="flex flex-col gap-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="business-name" className="text-slate-300">Business Name</Label>
              <Input
                id="business-name"
                name="business_name"
                type="text"
                autoComplete="organization"
                placeholder="e.g. Sharma Travels…"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className="border-slate-700 bg-slate-800 text-white placeholder:text-slate-500 focus-visible:border-[#0084ff] focus-visible:ring-[#0084ff]/20"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="support-phone" className="text-slate-300">Support Phone</Label>
              <Input
                id="support-phone"
                name="support_phone"
                type="tel"
                autoComplete="tel"
                placeholder="e.g. 9876543210…"
                value={supportPhone}
                onChange={(e) => setSupportPhone(e.target.value)}
                className="border-slate-700 bg-slate-800 text-white placeholder:text-slate-500 focus-visible:border-[#0084ff] focus-visible:ring-[#0084ff]/20"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="upi-id" className="text-slate-300">UPI ID</Label>
              <Input
                id="upi-id"
                name="upi_id"
                type="text"
                autoComplete="off"
                spellCheck={false}
                placeholder="e.g. sharma@upi…"
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                className="border-slate-700 bg-slate-800 text-white placeholder:text-slate-500 focus-visible:border-[#0084ff] focus-visible:ring-[#0084ff]/20"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="payment-qr-url" className="text-slate-300">Payment QR URL</Label>
              <Input
                id="payment-qr-url"
                name="payment_qr_url"
                type="url"
                autoComplete="off"
                spellCheck={false}
                placeholder="https://…"
                value={paymentQrUrl}
                onChange={(e) => setPaymentQrUrl(e.target.value)}
                className="border-slate-700 bg-slate-800 text-white placeholder:text-slate-500 focus-visible:border-[#0084ff] focus-visible:ring-[#0084ff]/20"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="payment-note" className="text-slate-300">
              Payment Note <span className="text-slate-500 font-normal">(optional)</span>
            </Label>
            <Input
              id="payment-note"
              name="payment_note"
              type="text"
              autoComplete="off"
              placeholder="e.g. Pay to confirm your booking…"
              value={paymentNote}
              onChange={(e) => setPaymentNote(e.target.value)}
              className="border-slate-700 bg-slate-800 text-white placeholder:text-slate-500 focus-visible:border-[#0084ff] focus-visible:ring-[#0084ff]/20"
            />
          </div>

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={saving}
              className="bg-[#0084ff] text-white hover:bg-[#0066cc] disabled:opacity-50"
            >
              {saving ? (
                <><Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />Saving…</>
              ) : (
                'Save Business Settings'
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
