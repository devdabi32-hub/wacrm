"use client"

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'
import { DocsSidebar } from './sidebar'
import { GithubIcon } from '@/components/docs/github-icon'
import { MessageSquare } from 'lucide-react'
import type { DocPage } from '@/lib/docs/content'

const REPO_URL = 'https://github.com/ArnasDon/wacrm'

interface DocsShellProps {
  pages: DocPage[]
  children: ReactNode
}

export function DocsShell({ pages, children }: DocsShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const closeMobile = () => setMobileOpen(false)

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground lg:hidden"
              aria-label={mobileOpen ? 'Close docs menu' : 'Open docs menu'}
              onClick={() => setMobileOpen((v) => !v)}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <Link
              href="/"
              className="flex items-center gap-2"
              aria-label="CRM Template for WhatsApp home"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <MessageSquare className="h-4 w-4 text-foreground" />
              </span>
              <span className="text-sm font-semibold text-foreground">
                CRM Template for WhatsApp
              </span>
              <span className="hidden rounded-md border border-border bg-card px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:inline-block">
                Docs
              </span>
            </Link>
          </div>

          <div className="flex items-center gap-1.5">
            <Link
              href="/"
              className="hidden rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground sm:inline-flex"
            >
              Home
            </Link>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="View source on GitHub"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <GithubIcon className="h-4 w-4" />
            </a>
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-primary/80"
            >
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl gap-8 px-4 sm:px-6">
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-64 flex-shrink-0 overflow-y-auto py-10 pr-2 lg:block">
          <DocsSidebar pages={pages} />
        </aside>

        {mobileOpen && (
          <div className="fixed inset-0 top-16 z-30 flex lg:hidden">
            <div
              className="absolute inset-0 bg-background/80 backdrop-blur-sm"
              onClick={closeMobile}
              aria-hidden
            />
            <div className="relative ml-0 mr-auto flex h-full w-72 max-w-[85vw] flex-col overflow-y-auto border-r border-border bg-background px-4 py-6">
              <DocsSidebar pages={pages} onNavigate={closeMobile} />
            </div>
          </div>
        )}

        <main className="min-w-0 flex-1 py-10">{children}</main>
      </div>

      <footer className="mt-10 border-t border-border bg-background">
        <div className="mx-auto w-full max-w-7xl px-4 py-6 text-xs leading-relaxed text-muted-foreground sm:px-6">
          WhatsApp® is a registered trademark of Meta Platforms, Inc.
          Hostinger is not affiliated with, endorsed by, or sponsored by
          Meta Platforms, Inc.
        </div>
      </footer>
    </div>
  )
}
