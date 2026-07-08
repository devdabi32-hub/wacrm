import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { listDocs, loadDoc } from '@/lib/docs/content'

interface DocPageProps {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  const pages = await listDocs()
  return pages.map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({
  params,
}: DocPageProps): Promise<Metadata> {
  const { slug } = await params
  const doc = await loadDoc(slug)
  if (!doc) return {}
  return {
    title: doc.title,
    description: doc.description,
  }
}

export default async function DocPage({ params }: DocPageProps) {
  const { slug } = await params
  const doc = await loadDoc(slug)
  if (!doc) notFound()

  const pages = await listDocs()
  const idx = pages.findIndex((p) => p.slug === slug)
  const prev = idx > 0 ? pages[idx - 1] : null
  const next = idx >= 0 && idx < pages.length - 1 ? pages[idx + 1] : null

  return (
    <article className="mx-auto w-full max-w-3xl">
      <p className="text-xs font-semibold uppercase tracking-wider text-primary">
        {doc.section}
      </p>
      <div
        className="doc-prose mt-2"
        dangerouslySetInnerHTML={{ __html: doc.html }}
      />

      <nav
        aria-label="Pagination"
        className="mt-16 grid grid-cols-1 gap-3 border-t border-border pt-8 sm:grid-cols-2"
      >
        {prev ? (
          <Link
            href={`/docs/${prev.slug}`}
            className="group flex flex-col gap-1 rounded-xl border border-border bg-card/40 px-5 py-4 transition-colors hover:border-border hover:bg-card/70"
          >
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <ArrowLeft className="h-3.5 w-3.5" />
              Previous
            </span>
            <span className="text-sm font-semibold text-foreground">
              {prev.title}
            </span>
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link
            href={`/docs/${next.slug}`}
            className="group flex flex-col items-end gap-1 rounded-xl border border-border bg-card/40 px-5 py-4 text-right transition-colors hover:border-border hover:bg-card/70"
          >
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Next
              <ArrowRight className="h-3.5 w-3.5" />
            </span>
            <span className="text-sm font-semibold text-foreground">
              {next.title}
            </span>
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </article>
  )
}
