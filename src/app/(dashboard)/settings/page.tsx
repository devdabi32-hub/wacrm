'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Settings, MessageSquare, Tag, User, SlidersHorizontal } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { WhatsAppConfig } from '@/components/settings/whatsapp-config';
import { TemplateManager } from '@/components/settings/template-manager';
import { TagManager } from '@/components/settings/tag-manager';
import { ProfileForm } from '@/components/settings/profile-form';
import { PasswordForm } from '@/components/settings/password-form';
import { SessionsCard } from '@/components/settings/sessions-card';
import { CustomFieldManager } from '@/components/settings/custom-field-manager';

const TAB_VALUES = ['profile', 'whatsapp', 'templates', 'tags', 'fields'] as const;
type TabValue = (typeof TAB_VALUES)[number];

function isTabValue(v: string | null): v is TabValue {
  return !!v && (TAB_VALUES as readonly string[]).includes(v);
}

export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const queryTab = searchParams.get('tab');
  const tab: TabValue = isTabValue(queryTab) ? queryTab : 'profile';

  const onChange = (next: TabValue) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', next);
    router.replace(`/settings?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-sm text-slate-400 mt-1">
          Manage your profile, WhatsApp® integration, message templates, tags,
          and custom contact fields.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => onChange(v as TabValue)}>
        {/* Horizontally scrollable on mobile — 5 tabs with labels don't
            fit a narrow viewport, and TabsList itself doesn't wrap
            (whitespace-nowrap triggers per tab). Icon-only below sm
            keeps the row compact; sm+ restores full labels. */}
        <div className="overflow-x-auto">
          <TabsList className="bg-slate-900 border border-slate-700">
            <TabsTrigger
              value="profile"
              className="data-active:bg-slate-800 data-active:text-[#0084ff] text-slate-400"
            >
              <User className="size-4" />
              <span className="hidden sm:inline">Profile</span>
            </TabsTrigger>
            <TabsTrigger
              value="whatsapp"
              className="data-active:bg-slate-800 data-active:text-[#0084ff] text-slate-400"
            >
              <Settings className="size-4" />
              <span className="hidden sm:inline">WhatsApp Config</span>
            </TabsTrigger>
            <TabsTrigger
              value="templates"
              className="data-active:bg-slate-800 data-active:text-[#0084ff] text-slate-400"
            >
              <MessageSquare className="size-4" />
              <span className="hidden sm:inline">Templates</span>
            </TabsTrigger>
            <TabsTrigger
              value="tags"
              className="data-active:bg-slate-800 data-active:text-[#0084ff] text-slate-400"
            >
              <Tag className="size-4" />
              <span className="hidden sm:inline">Tags</span>
            </TabsTrigger>
            <TabsTrigger
              value="fields"
              className="data-active:bg-slate-800 data-active:text-[#0084ff] text-slate-400"
            >
              <SlidersHorizontal className="size-4" />
              <span className="hidden sm:inline">Custom Fields</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="profile" className="space-y-6">
          <ProfileForm />
          <PasswordForm />
          <SessionsCard />
        </TabsContent>

        <TabsContent value="whatsapp">
          <WhatsAppConfig />
        </TabsContent>

        <TabsContent value="templates">
          <TemplateManager />
        </TabsContent>

        <TabsContent value="tags">
          <TagManager />
        </TabsContent>

        <TabsContent value="fields">
          <CustomFieldManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}