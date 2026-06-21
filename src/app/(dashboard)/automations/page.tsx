"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Zap, Plus, MoreVertical, Copy, Pencil, Trash2,
  FileText, MessageCircle, Clock, Users, PhoneCall,
  Loader2, Bot, Eye, EyeOff, ExternalLink, Info,
  Settings, MapPin, Upload, Download, ArrowRight, ArrowLeft, CheckCircle2,
} from "lucide-react"
import * as XLSX from "xlsx"

import { createClient } from "@/lib/supabase/client"
import { getOwnerId } from "@/lib/workspace/owner"
import type { Automation, Destination } from "@/types"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { AUTOMATION_TEMPLATES, type TemplateSlug } from "@/lib/automations/templates"
import { triggerMeta, formatRelative } from "@/lib/automations/trigger-meta"
import { cn } from "@/lib/utils"

// ─────────────────────────────────────────────
// AI Engine constants (mirrors Replora)
// ─────────────────────────────────────────────

type Provider = "groq" | "gemini" | "openai" | "deepseek" | "claude" | "webhook"

const PROVIDERS: { value: Provider; label: string }[] = [
  { value: "groq", label: "⚡ Groq (Free)" },
  { value: "gemini", label: "🔵 Google Gemini" },
  { value: "openai", label: "OpenAI / ChatGPT" },
  { value: "deepseek", label: "DeepSeek" },
  { value: "claude", label: "Anthropic Claude" },
  { value: "webhook", label: "n8n / Custom Webhook" },
]

const MODELS: Record<Provider, string[]> = {
  groq: ["llama-3.1-8b-instant ⚡ Free", "llama3-8b-8192", "llama-3.3-70b-versatile", "gemma2-9b-it"],
  gemini: ["gemini-2.0-flash ⚡ Free", "gemini-1.5-flash", "gemini-1.5-flash-8b"],
  openai: ["gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo"],
  deepseek: ["deepseek-chat", "deepseek-reasoner"],
  claude: ["claude-3-haiku-20240307", "claude-3-5-haiku-20241022", "claude-sonnet-4-20250514"],
  webhook: [],
}

const KEY_URLS: Record<Provider, string> = {
  groq: "https://console.groq.com/keys",
  gemini: "https://aistudio.google.com/app/apikey",
  openai: "https://platform.openai.com/api-keys",
  deepseek: "https://platform.deepseek.com/api_keys",
  claude: "https://console.anthropic.com/settings/keys",
  webhook: "#",
}

const DEFAULT_SYSTEM_PROMPT =
  "You are a helpful WhatsApp assistant for a Tour & Travel company. Keep replies short, clear, and friendly. Maximum 2-3 sentences. Always reply in the same language the customer uses. For new inquiries, ask about travel dates, group size, and destination."

const inputCls = "w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-[#0084ff] focus:outline-none transition"
const labelCls = "block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5"

// ─────────────────────────────────────────────
// Existing page setup (unchanged)
// ─────────────────────────────────────────────

const TEMPLATE_ORDER: TemplateSlug[] = [
  "welcome_message", "out_of_office", "lead_qualifier", "follow_up_reminder",
]
const TEMPLATE_ICON: Record<TemplateSlug, typeof Zap> = {
  welcome_message: MessageCircle, out_of_office: Clock,
  lead_qualifier: Users, follow_up_reminder: PhoneCall,
}

// ─────────────────────────────────────────────
// Tabs definition
// ─────────────────────────────────────────────

const TABS = [
  { id: "workflows", label: "Workflows", icon: Zap },
  { id: "ai", label: "AI Engine", icon: Bot },
] as const
type TabId = (typeof TABS)[number]["id"]

// ─────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────

export default function AutomationsPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabId>("workflows")
  const [automations, setAutomations] = useState<Automation[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Automation | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function load() {
    try {
      const supabase = createClient()
      const { data, error: fetchErr } = await supabase
        .from("automations")
        .select("*")
        .order("created_at", { ascending: false })
      if (fetchErr) throw fetchErr
      setAutomations((data ?? []) as Automation[])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load automations")
    }
  }

  useEffect(() => { load() }, [])

  async function toggleActive(a: Automation, next: boolean) {
    setAutomations((prev) => prev?.map((x) => (x.id === a.id ? { ...x, is_active: next } : x)) ?? prev)
    const res = await fetch(`/api/automations/${a.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ is_active: next }),
    })
    if (!res.ok) {
      setAutomations((prev) => prev?.map((x) => (x.id === a.id ? { ...x, is_active: !next } : x)) ?? prev)
      const body = await res.json().catch(() => ({}))
      toast.error(body?.error ?? "Failed to update")
      return
    }
    toast.success(next ? "Automation activated" : "Automation paused")
  }

  async function duplicate(a: Automation) {
    const res = await fetch(`/api/automations/${a.id}/duplicate`, { method: "POST" })
    if (!res.ok) { const body = await res.json().catch(() => ({})); toast.error(body?.error ?? "Failed to duplicate"); return }
    toast.success("Automation duplicated"); load()
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    const res = await fetch(`/api/automations/${pendingDelete.id}`, { method: "DELETE" })
    setDeleting(false)
    if (!res.ok) { const body = await res.json().catch(() => ({})); toast.error(body?.error ?? "Failed to delete"); return }
    toast.success("Automation deleted"); setPendingDelete(null); load()
  }

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-sm text-red-400">{error}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>Retry</Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Automations</h1>
          <p className="mt-1 text-sm text-slate-400">
            Build workflows and configure AI engine for WhatsApp.
          </p>
        </div>
        {activeTab === "workflows" && (
          <Button onClick={() => router.push("/automations/new")} className="bg-[#0084ff] text-white hover:bg-[#0055cc]">
            <Plus className="h-4 w-4" /> Create Automation
          </Button>
        )}
      </div>

      {/* Tab switcher */}
      <div className="inline-flex rounded-lg border border-slate-800 bg-slate-900 p-1 gap-1">
        {TABS.map((t) => {
          const Icon = t.icon
          const active = activeTab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={cn(
                "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-[#0084ff] text-white"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Tab: Workflows (existing content) */}
      {activeTab === "workflows" && (
        <>
          {automations === null ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-[#0084ff]" />
            </div>
          ) : (
            <>
              {automations.length < 3 && (
                <section>
                  <h2 className="mb-3 text-sm font-semibold text-slate-300">Quick-start templates</h2>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {TEMPLATE_ORDER.map((slug) => {
                      const t = AUTOMATION_TEMPLATES[slug]
                      const Icon = TEMPLATE_ICON[slug]
                      return (
                        <button key={slug} onClick={() => router.push(`/automations/new?template=${slug}`)}
                          className="group flex flex-col items-start rounded-xl border border-slate-800 bg-slate-900 p-4 text-left transition-colors hover:border-[#0084ff]/50 hover:bg-slate-900/80">
                          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-[#0084ff]/10 text-[#0084ff]">
                            <Icon className="h-5 w-5" />
                          </div>
                          <div className="text-sm font-semibold text-white">{t.name}</div>
                          <p className="mt-1 text-xs text-slate-400">{t.description}</p>
                        </button>
                      )
                    })}
                  </div>
                </section>
              )}

              {automations.length === 0 ? (
                <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-slate-800 bg-slate-900/40">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#0084ff]/10">
                    <Zap className="h-6 w-6 text-[#0084ff]" />
                  </div>
                  <p className="mt-3 text-sm font-medium text-white">No automations yet</p>
                  <p className="mt-1 text-xs text-slate-400">Pick a template above or create one from scratch.</p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {automations.map((a) => (
                    <AutomationCard
                      key={a.id} automation={a}
                      onToggle={(next) => toggleActive(a, next)}
                      onEdit={() => router.push(`/automations/${a.id}/edit`)}
                      onDuplicate={() => duplicate(a)}
                      onLogs={() => router.push(`/automations/${a.id}/logs`)}
                      onDelete={() => setPendingDelete(a)}
                    />
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}

      {/* Tab: AI Engine (new) */}
      {activeTab === "ai" && <AIEngineTab />}

      {/* Delete dialog (unchanged) */}
      <Dialog open={!!pendingDelete} onOpenChange={(v) => !v && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete automation</DialogTitle>
            <DialogDescription>
              This permanently removes{" "}
              <span className="text-white">{pendingDelete?.name}</span> and its execution history. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingDelete(null)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─────────────────────────────────────────────
// AutomationCard (unchanged from original)
// ─────────────────────────────────────────────

function AutomationCard({ automation, onToggle, onEdit, onDuplicate, onLogs, onDelete }: {
  automation: Automation; onToggle: (next: boolean) => void
  onEdit: () => void; onDuplicate: () => void; onLogs: () => void; onDelete: () => void
}) {
  const meta = triggerMeta(automation.trigger_type)
  return (
    <li className="rounded-xl border border-slate-800 bg-slate-900 transition-colors hover:border-slate-700">
      <div className="flex items-center gap-4 p-4">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-[#0084ff]/10" aria-hidden>
          <Zap className="h-5 w-5 text-[#0084ff]" />
        </div>
        <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-white">{automation.name}</span>
            {automation.is_active && (
              <span className="relative flex h-2 w-2" aria-label="active">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#0084ff] opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#0084ff]" />
              </span>
            )}
          </div>
          {automation.description && <p className="mt-0.5 truncate text-xs text-slate-400">{automation.description}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium", meta.pillClass)}>
              {meta.label}
            </span>
            <span className="tabular-nums">{automation.execution_count} run{automation.execution_count === 1 ? "" : "s"}</span>
            <span aria-hidden>·</span>
            <span>last {formatRelative(automation.last_executed_at)}</span>
          </div>
        </button>
        <div className="flex items-center gap-3">
          <Switch checked={automation.is_active} onCheckedChange={(v) => onToggle(!!v)} aria-label={automation.is_active ? "Deactivate" : "Activate"} />
          <DropdownMenu>
            <DropdownMenuTrigger aria-label="Open menu" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-800 hover:text-white">
              <MoreVertical className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}><Pencil className="h-4 w-4" />Edit</DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicate}><Copy className="h-4 w-4" />Duplicate</DropdownMenuItem>
              <DropdownMenuItem onClick={onLogs}><FileText className="h-4 w-4" />View Logs</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={onDelete}><Trash2 className="h-4 w-4" />Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </li>
  )
}

// ─────────────────────────────────────────────
// AI Engine Tab — New component
// ─────────────────────────────────────────────

function AIEngineTab() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [aiSubTab, setAiSubTab] = useState<"settings" | "catalogue">("settings")

  // AI Engine state
  const [aiEnabled, setAiEnabled] = useState(false)
  const [provider, setProvider] = useState<Provider>("groq")
  const [model, setModel] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT)
  const [webhookUrl, setWebhookUrl] = useState("")

  // Quick Automations state
  const [welcomeEnabled, setWelcomeEnabled] = useState(false)
  const [welcomeText, setWelcomeText] = useState("Hi! Thanks for reaching out. We'll get back to you with the best tour packages shortly. Can you tell us your travel dates and destination? 🌍")
  const [oooEnabled, setOooEnabled] = useState(false)
  const [oooStart, setOooStart] = useState("20:00")
  const [oooEnd, setOooEnd] = useState("09:00")
  const [oooText, setOooText] = useState("Hi! We're currently offline. Our team will reply during business hours (9am–8pm IST). For urgent queries, please call us.")

  // Load config from whatsapp_config
  useEffect(() => {
    const fetchConfig = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      const ownerId = await getOwnerId(supabase, user.id)

      const { data } = await supabase
        .from("whatsapp_config")
        .select("ai_enabled, ai_provider, ai_model, ai_api_key, ai_system_prompt, ai_webhook_url, welcome_enabled, welcome_text, ooo_enabled, ooo_start, ooo_end, ooo_text")
        .eq("user_id", ownerId)
        .maybeSingle()

      if (data) {
        setAiEnabled(!!data.ai_enabled)
        const p = (data.ai_provider as Provider) || "groq"
        setProvider(p)
        setModel(MODELS[p]?.[0] ?? "")
        // API key is encrypted — show placeholder if exists
        setApiKey(data.ai_api_key ? "••••••••••••••••" : "")
        setSystemPrompt(data.ai_system_prompt || DEFAULT_SYSTEM_PROMPT)
        setWebhookUrl(data.ai_webhook_url || "")
        setWelcomeEnabled(!!data.welcome_enabled)
        if (data.welcome_text) setWelcomeText(data.welcome_text)
        setOooEnabled(!!data.ooo_enabled)
        if (data.ooo_start) setOooStart(data.ooo_start)
        if (data.ooo_end) setOooEnd(data.ooo_end)
        if (data.ooo_text) setOooText(data.ooo_text)
      }
      setLoading(false)
    }
    fetchConfig()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/ai/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ai_enabled: aiEnabled,
          ai_provider: provider,
          ai_model: provider === "webhook" ? null : (model.split(" ")[0] || null),
          ai_api_key: (provider !== "webhook" && apiKey && !apiKey.startsWith("•")) ? apiKey : undefined,
          ai_system_prompt: provider !== "webhook" ? systemPrompt : null,
          ai_webhook_url: provider === "webhook" ? webhookUrl : null,
          welcome_enabled: welcomeEnabled,
          welcome_text: welcomeText,
          ooo_enabled: oooEnabled,
          ooo_start: oooStart,
          ooo_end: oooEnd,
          ooo_text: oooText,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error(body?.error ?? "Save failed")
      } else {
        toast.success("AI Engine configuration saved ✓")
      }
    } catch {
      toast.error("Save failed")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#0084ff]" />
      </div>
    )
  }

  return (
    <div className="space-y-4">

      {/* Sub-tab: Settings | Catalogue */}
      <div className="inline-flex rounded-lg border border-slate-800 bg-slate-900 p-1 gap-1">
        {([
          { id: "settings", label: "Settings", icon: Settings },
          { id: "catalogue", label: "Catalogue", icon: MapPin },
        ] as const).map((t) => {
          const Icon = t.icon
          const active = aiSubTab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setAiSubTab(t.id)}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-[#0084ff] text-white"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          )
        })}
      </div>

      {aiSubTab === "catalogue" ? (
        <CatalogueSection />
      ) : (
      <>
      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-xl border border-[#0084ff]/25 bg-[#0084ff]/10 px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#0084ff]" />
        <p className="text-sm text-slate-300">
          AI Engine automatically replies to incoming WhatsApp messages. Configure your LLM provider below. AI replies only when no agent is assigned and the contact is not a confirmed traveller.
        </p>
      </div>

      {/* ── Card 1: AI Engine ── */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-800 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0084ff]/10">
              <Bot className="h-5 w-5 text-[#0084ff]" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">AI Auto-Reply Engine</h3>
              <p className="text-xs text-slate-400 mt-0.5">LLM-powered replies to incoming messages</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400">{aiEnabled ? "Active" : "Paused"}</span>
            <Switch checked={aiEnabled} onCheckedChange={setAiEnabled} />
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Provider + Model */}
          <div className={`grid gap-4 ${provider === "webhook" ? "grid-cols-1" : "grid-cols-2"}`}>
            <div>
              <label className={labelCls}>AI Provider</label>
              <select
                value={provider}
                onChange={(e) => { setProvider(e.target.value as Provider); setModel(MODELS[e.target.value as Provider]?.[0] ?? "") }}
                className={inputCls}
              >
                {PROVIDERS.map((p) => <option key={p.value} value={p.value} className="bg-slate-900">{p.label}</option>)}
              </select>
            </div>
            {provider !== "webhook" && (
              <div>
                <label className={labelCls}>Model</label>
                <select value={model} onChange={(e) => setModel(e.target.value)} className={inputCls}>
                  {(MODELS[provider] ?? []).map((m) => <option key={m} value={m} className="bg-slate-900">{m}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Webhook URL or API Key */}
          {provider === "webhook" ? (
            <div>
              <label className={labelCls}>n8n Webhook URL</label>
              <input
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://your-n8n.com/webhook/..."
                className={inputCls}
              />
              <p className="mt-1.5 text-xs text-slate-500">WaCRM will POST contact + message JSON to this URL on every inbound message.</p>
            </div>
          ) : (
            <>
              <div>
                <label className={labelCls}>API Key</label>
                <div className="relative">
                  <input
                    type={showKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Paste your provider API key…"
                    className={inputCls + " pr-20 font-mono"}
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <button onClick={() => setShowKey(!showKey)} className="flex h-7 w-7 items-center justify-center text-slate-400 hover:text-white">
                      {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="text-xs text-slate-500">🔒 Encrypted with AES-256-GCM before storage.</span>
                  <a href={KEY_URLS[provider]} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-[#0084ff] hover:underline">
                    Get free API key <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>

              <div>
                <label className={labelCls}>System Prompt</label>
                <textarea
                  rows={4}
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value.slice(0, 1000))}
                  className={inputCls + " h-auto resize-none py-2.5"}
                />
                <div className="mt-1 text-right text-xs text-slate-500">{systemPrompt.length} / 1000</div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Card 2: Welcome Message ── */}
      <div className="rounded-xl border border-slate-800 bg-slate-900">
        <div className="flex items-center justify-between p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10">
              <MessageCircle className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">Welcome Message</div>
              <div className="text-xs text-slate-400 mt-0.5">Send to new contacts on their very first message</div>
            </div>
          </div>
          <Switch checked={welcomeEnabled} onCheckedChange={setWelcomeEnabled} />
        </div>
        {welcomeEnabled && (
          <div className="border-t border-slate-800 px-5 pb-5 pt-4">
            <label className={labelCls}>Message Text</label>
            <textarea
              rows={3}
              value={welcomeText}
              onChange={(e) => setWelcomeText(e.target.value)}
              className={inputCls + " h-auto resize-none py-2.5"}
            />
          </div>
        )}
      </div>

      {/* ── Card 3: Out of Office ── */}
      <div className="rounded-xl border border-slate-800 bg-slate-900">
        <div className="flex items-center justify-between p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10">
              <Clock className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">Out of Office</div>
              <div className="text-xs text-slate-400 mt-0.5">Auto-reply outside business hours (uses IST timezone)</div>
            </div>
          </div>
          <Switch checked={oooEnabled} onCheckedChange={setOooEnabled} />
        </div>
        {oooEnabled && (
          <div className="border-t border-slate-800 px-5 pb-5 pt-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Offline From</label>
                <input type="time" value={oooStart} onChange={(e) => setOooStart(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Back Online At</label>
                <input type="time" value={oooEnd} onChange={(e) => setOooEnd(e.target.value)} className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>OOO Message</label>
              <textarea
                rows={2}
                value={oooText}
                onChange={(e) => setOooText(e.target.value)}
                className={inputCls + " h-auto resize-none py-2.5"}
              />
            </div>
          </div>
        )}
      </div>

      {/* Save button */}
      <div className="flex items-center gap-3 pt-2">
        <Button onClick={handleSave} disabled={saving} className="bg-[#0084ff] text-white hover:bg-[#0055cc]">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {saving ? "Saving…" : "Save AI Engine Config"}
        </Button>
      </div>
      </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// Catalogue Section — destinations CRUD (Step 3)
// ─────────────────────────────────────────────

const EMPTY_DESTINATION_FORM = {
  name: "",
  slug: "",
  summary: "",
  description: "",
  keywords: "",
  highlights: "",
  departures: "",
  poster_url: "",
  itinerary_url: "",
  price_from: "",
  currency: "INR",
  nights: "",
  days: "",
  active: true,
}
type DestinationFormState = typeof EMPTY_DESTINATION_FORM

function destinationToForm(d: Destination): DestinationFormState {
  return {
    name: d.name,
    slug: d.slug,
    summary: d.summary ?? "",
    description: d.description ?? "",
    keywords: (d.keywords ?? []).join(", "),
    highlights: (d.highlights ?? []).join(", "),
    departures: (d.departures ?? []).join(", "),
    poster_url: d.poster_url ?? "",
    itinerary_url: d.itinerary_url ?? "",
    price_from: d.price_from != null ? String(d.price_from) : "",
    currency: d.currency || "INR",
    nights: d.nights != null ? String(d.nights) : "",
    days: d.days != null ? String(d.days) : "",
    active: d.active,
  }
}

function splitList(s: string): string[] {
  return s.split(",").map((x) => x.trim()).filter(Boolean)
}

// ─────────────────────────────────────────────
// CSV/XLSX Import — template + field config (Step 4)
// ─────────────────────────────────────────────

const DESTINATION_FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: "name", label: "Name", required: true },
  { key: "slug", label: "Slug" },
  { key: "summary", label: "Summary" },
  { key: "description", label: "Description" },
  { key: "keywords", label: "Keywords" },
  { key: "highlights", label: "Highlights" },
  { key: "departures", label: "Departures" },
  { key: "poster_url", label: "Poster URL" },
  { key: "itinerary_url", label: "Itinerary Link" },
  { key: "price_from", label: "Price From" },
  { key: "currency", label: "Currency" },
  { key: "nights", label: "Nights" },
  { key: "days", label: "Days" },
  { key: "active", label: "Active" },
]

function csvEscape(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

function downloadDestinationTemplate() {
  const headers = DESTINATION_FIELDS.map((f) => f.key)
  const example = [
    "Manali Honeymoon Package", "manali-honeymoon", "5N/6D snow & romance getaway",
    "Full day-by-day itinerary details go here.", "manali, honeymoon, himachal",
    "Snow point, candlelight dinner, cab included", "5 Jul, 12 Jul, 19 Jul",
    "https://example.com/poster.jpg", "https://drive.google.com/your-itinerary-link",
    "14999", "INR", "5", "6", "TRUE",
  ]
  const csv = [headers, example].map((row) => row.map(csvEscape).join(",")).join("\r\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = "destinations_template.csv"
  a.click()
  URL.revokeObjectURL(url)
}

function parseBoolCell(v: string | undefined): boolean {
  const s = (v ?? "").trim().toLowerCase()
  if (!s) return true
  return ["true", "yes", "1", "active", "y"].includes(s)
}

function guessColumn(headers: string[], field: { key: string; label: string }): number {
  const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]/g, "")
  const targets = [norm(field.key), norm(field.label)]
  return headers.findIndex((h) => targets.includes(norm(h)))
}

function CatalogueSection() {
  const [destinations, setDestinations] = useState<Destination[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Destination | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Destination | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  // Guards against out-of-order responses: if a second load() (e.g. after an
  // import) resolves before an in-flight one, the stale older response must
  // not overwrite the newer state — that previously made just-deleted rows
  // reappear after a fast delete-then-refresh sequence.
  const loadSeq = useRef(0)

  async function load() {
    const seq = ++loadSeq.current
    try {
      const res = await fetch("/api/destinations", { cache: "no-store" })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error ?? "Failed to load catalogue")
      if (seq !== loadSeq.current) return
      setDestinations((body.destinations ?? []) as Destination[])
    } catch (err) {
      if (seq !== loadSeq.current) return
      setError(err instanceof Error ? err.message : "Failed to load catalogue")
    }
  }

  useEffect(() => { load() }, [])

  function openAdd() { setEditing(null); setDialogOpen(true) }
  function openEdit(d: Destination) { setEditing(d); setDialogOpen(true) }

  async function toggleActive(d: Destination, next: boolean) {
    setTogglingId(d.id)
    setDestinations((prev) => prev?.map((x) => (x.id === d.id ? { ...x, active: next } : x)) ?? prev)
    const res = await fetch(`/api/destinations/${d.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: next }),
    })
    setTogglingId(null)
    if (!res.ok) {
      setDestinations((prev) => prev?.map((x) => (x.id === d.id ? { ...x, active: !next } : x)) ?? prev)
      const body = await res.json().catch(() => ({}))
      toast.error(body?.error ?? "Failed to update")
      return
    }
    toast.success(next ? "Destination activated" : "Destination deactivated")
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    const res = await fetch(`/api/destinations/${pendingDelete.id}`, { method: "DELETE" })
    setDeleting(false)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      toast.error(body?.error ?? "Failed to delete")
      return
    }
    toast.success("Destination deleted")
    setPendingDelete(null)
    load()
  }

  if (error) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-2">
        <p className="text-sm text-red-400">{error}</p>
        <Button variant="outline" onClick={() => { setError(null); load() }}>Retry</Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-[#0084ff]/25 bg-[#0084ff]/10 px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#0084ff]" />
        <p className="text-sm text-slate-300">
          Manage the packages your AI offers customers on WhatsApp. Add a destination here and it&apos;s instantly live — no code changes needed.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Destinations</h3>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={downloadDestinationTemplate}>
            <Download className="h-4 w-4" /> Template
          </Button>
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4" /> Import
          </Button>
          <Button onClick={openAdd} className="bg-[#0084ff] text-white hover:bg-[#0055cc]">
            <Plus className="h-4 w-4" /> Add Destination
          </Button>
        </div>
      </div>

      {destinations === null ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-[#0084ff]" />
        </div>
      ) : destinations.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-slate-800 bg-slate-900/40">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#0084ff]/10">
            <MapPin className="h-6 w-6 text-[#0084ff]" />
          </div>
          <p className="mt-3 text-sm font-medium text-white">No destinations yet</p>
          <p className="mt-1 text-xs text-slate-400">Add your first package — it&apos;ll show up in the AI&apos;s menu right away.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {destinations.map((d) => (
            <li key={d.id} className="rounded-xl border border-slate-800 bg-slate-900 transition-colors hover:border-slate-700">
              <div className="flex items-center gap-4 p-4">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-[#0084ff]/10" aria-hidden>
                  <MapPin className="h-5 w-5 text-[#0084ff]" />
                </div>
                <button type="button" onClick={() => openEdit(d)} className="min-w-0 flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-white">{d.name}</span>
                    <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-400">{d.slug}</span>
                    {d.imported && (
                      <span className="rounded-full border border-[#0084ff]/40 bg-[#0084ff]/10 px-2 py-0.5 text-[11px] text-[#0084ff]">Imported</span>
                    )}
                    {!d.active && (
                      <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[11px] text-slate-500">Inactive</span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-slate-500">
                    {d.nights != null && d.days != null && <span>{d.nights}N/{d.days}D</span>}
                    {d.price_from != null && <span>· from {d.currency} {d.price_from}</span>}
                    {d.summary && <span className="truncate">· {d.summary}</span>}
                  </div>
                </button>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={d.active}
                    disabled={togglingId === d.id}
                    onCheckedChange={(v) => toggleActive(d, !!v)}
                    aria-label={d.active ? "Deactivate" : "Activate"}
                  />
                  <DropdownMenu>
                    <DropdownMenuTrigger aria-label="Open menu" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-800 hover:text-white">
                      <MoreVertical className="h-4 w-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEdit(d)}><Pencil className="h-4 w-4" />Edit</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onClick={() => setPendingDelete(d)}><Trash2 className="h-4 w-4" />Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <DestinationDialog
        open={dialogOpen}
        destination={editing}
        onClose={() => setDialogOpen(false)}
        onSaved={() => { setDialogOpen(false); load() }}
      />

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => { setImportOpen(false); load() }}
      />

      <Dialog open={!!pendingDelete} onOpenChange={(v) => !v && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete destination</DialogTitle>
            <DialogDescription>
              This permanently removes <span className="text-white">{pendingDelete?.name}</span> from your catalogue. The AI will stop offering it. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingDelete(null)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─────────────────────────────────────────────
// DestinationDialog — Add/Edit form
// ─────────────────────────────────────────────

function DestinationDialog({ open, destination, onClose, onSaved }: {
  open: boolean
  destination: Destination | null
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<DestinationFormState>(EMPTY_DESTINATION_FORM)
  const [saving, setSaving] = useState(false)

  // Reset the form every time the dialog opens or the destination being
  // edited changes. Legitimate prop-driven sync; the rule is over-cautious
  // here (same pattern as deal-form.tsx).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open) setForm(destination ? destinationToForm(destination) : EMPTY_DESTINATION_FORM)
  }, [open, destination])
  /* eslint-enable react-hooks/set-state-in-effect */

  function set<K extends keyof DestinationFormState>(key: K, value: DestinationFormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error("Name is required"); return }
    setSaving(true)
    const payload = {
      name: form.name.trim(),
      slug: form.slug.trim() || undefined,
      summary: form.summary.trim() || null,
      description: form.description.trim() || null,
      keywords: splitList(form.keywords),
      highlights: splitList(form.highlights),
      departures: splitList(form.departures),
      poster_url: form.poster_url.trim() || null,
      itinerary_url: form.itinerary_url.trim() || null,
      price_from: form.price_from.trim() ? Number(form.price_from) : null,
      currency: form.currency.trim() || "INR",
      nights: form.nights.trim() ? Number(form.nights) : null,
      days: form.days.trim() ? Number(form.days) : null,
      active: form.active,
    }
    const url = destination ? `/api/destinations/${destination.id}` : "/api/destinations"
    const method = destination ? "PATCH" : "POST"
    const res = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    })
    setSaving(false)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      toast.error(body?.error ?? "Save failed")
      return
    }
    toast.success(destination ? "Destination updated" : "Destination added")
    onSaved()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{destination ? "Edit destination" : "Add destination"}</DialogTitle>
          <DialogDescription>
            This shows up live in the AI&apos;s menu and replies — no deploy needed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Name *</label>
              <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Manali Honeymoon Package" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Slug</label>
              <input value={form.slug} onChange={(e) => set("slug", e.target.value)} placeholder="auto from name" className={inputCls} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Summary</label>
            <input value={form.summary} onChange={(e) => set("summary", e.target.value)} placeholder="Short one-line shown in the menu" className={inputCls} />
          </div>

          <div>
            <label className={labelCls}>Description</label>
            <textarea rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} className={inputCls + " h-auto resize-none py-2.5"} />
          </div>

          <div>
            <label className={labelCls}>Keywords (comma-separated)</label>
            <input value={form.keywords} onChange={(e) => set("keywords", e.target.value)} placeholder="manali, honeymoon, himachal" className={inputCls} />
            <p className="mt-1 text-xs text-slate-500">Used to match this package when a customer mentions it.</p>
          </div>

          <div>
            <label className={labelCls}>Highlights (comma-separated)</label>
            <input value={form.highlights} onChange={(e) => set("highlights", e.target.value)} placeholder="Snow point, candlelight dinner, cab included" className={inputCls} />
          </div>

          <div>
            <label className={labelCls}>Departure dates (comma-separated)</label>
            <input value={form.departures} onChange={(e) => set("departures", e.target.value)} placeholder="5 Jul, 12 Jul, 19 Jul" className={inputCls} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Poster image URL</label>
              <input value={form.poster_url} onChange={(e) => set("poster_url", e.target.value)} placeholder="https://..." className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Itinerary link</label>
              <input value={form.itinerary_url} onChange={(e) => set("itinerary_url", e.target.value)} placeholder="Google Drive / Dropbox link" className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className={labelCls}>Price from</label>
              <input type="number" min={0} value={form.price_from} onChange={(e) => set("price_from", e.target.value)} placeholder="14999" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Currency</label>
              <input value={form.currency} onChange={(e) => set("currency", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Nights</label>
              <input type="number" min={0} value={form.nights} onChange={(e) => set("nights", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Days</label>
              <input type="number" min={0} value={form.days} onChange={(e) => set("days", e.target.value)} className={inputCls} />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-slate-800 px-3 py-2.5">
            <span className="text-sm text-slate-300">Active (visible to AI + customers)</span>
            <Switch checked={form.active} onCheckedChange={(v) => set("active", !!v)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-[#0084ff] text-white hover:bg-[#0055cc]">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {saving ? "Saving…" : destination ? "Save changes" : "Add destination"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────
// ImportDialog — CSV/XLSX bulk import (Step 4)
// ─────────────────────────────────────────────

type ImportStep = "upload" | "map" | "result"

function buildImportRow(row: string[], mapping: Record<string, number>): Record<string, unknown> {
  const get = (key: string): string => {
    const idx = mapping[key]
    return idx != null && idx >= 0 ? (row[idx] ?? "").trim() : ""
  }
  return {
    name: get("name"),
    slug: get("slug") || undefined,
    summary: get("summary") || null,
    description: get("description") || null,
    keywords: get("keywords"),
    highlights: get("highlights"),
    departures: get("departures"),
    poster_url: get("poster_url") || null,
    itinerary_url: get("itinerary_url") || null,
    price_from: get("price_from") ? Number(get("price_from")) : null,
    currency: get("currency") || "INR",
    nights: get("nights") ? Number(get("nights")) : null,
    days: get("days") ? Number(get("days")) : null,
    active: parseBoolCell(get("active")),
  }
}

function ImportDialog({ open, onClose, onImported }: {
  open: boolean
  onClose: () => void
  onImported: () => void
}) {
  const [step, setStep] = useState<ImportStep>("upload")
  const [parsing, setParsing] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<Record<string, number>>({})
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ inserted: number; skipped: { row: number; reason: string }[] } | null>(null)

  // Reset the wizard every time the dialog is (re)opened. Legitimate
  // prop-driven sync (same pattern as DestinationDialog/deal-form.tsx).
  useEffect(() => {
    if (open) {
      setStep("upload")
      setParsing(false)
      setFileError(null)
      setHeaders([])
      setRows([])
      setMapping({})
      setImporting(false)
      setResult(null)
    }
  }, [open])

  async function handleFile(file: File) {
    setParsing(true)
    setFileError(null)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: "array" })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }) as string[][]
      if (grid.length === 0) {
        setFileError("This file looks empty.")
        return
      }
      const [headerRow, ...dataRows] = grid
      const cleanedHeaders = headerRow.map((h) => String(h ?? "").trim())
      const cleanedRows = dataRows
        .map((r) => cleanedHeaders.map((_, i) => String(r[i] ?? "").trim()))
        .filter((r) => r.some((c) => c !== ""))
      if (cleanedRows.length === 0) {
        setFileError("No data rows found below the header row.")
        return
      }
      const guess: Record<string, number> = {}
      for (const f of DESTINATION_FIELDS) guess[f.key] = guessColumn(cleanedHeaders, f)
      setHeaders(cleanedHeaders)
      setRows(cleanedRows)
      setMapping(guess)
      setStep("map")
    } catch {
      setFileError("Could not read this file. Make sure it's a valid CSV/XLSX export.")
    } finally {
      setParsing(false)
    }
  }

  async function handleConfirm() {
    if (mapping.name == null || mapping.name < 0) {
      toast.error("Map the Name column before importing")
      return
    }
    setImporting(true)
    const payloadRows = rows.map((r) => buildImportRow(r, mapping))
    const res = await fetch("/api/destinations/bulk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rows: payloadRows }),
    })
    const resBody = await res.json().catch(() => ({}))
    setImporting(false)
    if (!res.ok) {
      toast.error(resBody?.error ?? "Import failed")
      return
    }
    setResult({ inserted: resBody.inserted ?? 0, skipped: resBody.skipped ?? [] })
    setStep("result")
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import destinations</DialogTitle>
          <DialogDescription>
            Upload a CSV or Excel export of your packages — preview and confirm before anything is saved.
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-slate-400">
              Don&apos;t have a file yet? Download the template, fill it in your spreadsheet tool, then upload it here.
            </p>
            <label className="flex h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-700 bg-slate-800/50 text-slate-400 transition-colors hover:border-[#0084ff]/50 hover:text-white">
              {parsing ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6" />}
              <span className="text-sm">{parsing ? "Reading file…" : "Click to choose a .csv or .xlsx file"}</span>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                disabled={parsing}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = "" }}
              />
            </label>
            {fileError && <p className="text-sm text-red-400">{fileError}</p>}
          </div>
        )}

        {step === "map" && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-slate-400">{rows.length} row(s) detected. Map your columns to destination fields, then review the preview below.</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {DESTINATION_FIELDS.map((f) => (
                <div key={f.key}>
                  <label className={labelCls}>{f.label}{f.required ? " *" : ""}</label>
                  <select
                    value={mapping[f.key] ?? -1}
                    onChange={(e) => setMapping((m) => ({ ...m, [f.key]: Number(e.target.value) }))}
                    className={inputCls}
                  >
                    <option value={-1} className="bg-slate-900">— Not mapped —</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i} className="bg-slate-900">{h || `Column ${i + 1}`}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div>
              <p className={labelCls}>Preview (first 5 rows)</p>
              <div className="overflow-x-auto rounded-lg border border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-800/60 text-slate-400">
                    <tr>
                      {DESTINATION_FIELDS.map((f) => (
                        <th key={f.key} className="whitespace-nowrap px-3 py-2 font-medium">{f.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 5).map((r, i) => {
                      const built = buildImportRow(r, mapping)
                      return (
                        <tr key={i} className="border-t border-slate-800 text-slate-300">
                          {DESTINATION_FIELDS.map((f) => (
                            <td key={f.key} className="max-w-[160px] truncate whitespace-nowrap px-3 py-2">
                              {String(built[f.key] ?? "")}
                            </td>
                          ))}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {step === "result" && result && (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
              <p className="text-sm text-slate-200">
                {result.inserted} destination{result.inserted === 1 ? "" : "s"} imported and live.
              </p>
            </div>
            {result.skipped.length > 0 && (
              <div>
                <p className={labelCls}>Skipped rows ({result.skipped.length})</p>
                <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-800 p-2 text-xs text-slate-400">
                  {result.skipped.map((s, i) => (
                    <div key={i}>Row {s.row}: {s.reason}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {step === "upload" && (
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
          )}
          {step === "map" && (
            <>
              <Button variant="ghost" onClick={() => setStep("upload")} disabled={importing}>
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button onClick={handleConfirm} disabled={importing} className="bg-[#0084ff] text-white hover:bg-[#0055cc]">
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                {importing ? "Importing…" : `Import ${rows.length} row(s)`}
              </Button>
            </>
          )}
          {step === "result" && (
            <Button onClick={onImported} className="bg-[#0084ff] text-white hover:bg-[#0055cc]">Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}