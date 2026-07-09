import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { listDocs } from '@/lib/docs/content'

export default async function DocsIndexPage() {
  const pages = await listDocs()
  const sections: Record<string, typeof pages> = {}
  for (const p of pages) {
    sections[p.section] ??= []
    sections[p.section].push(p)
  }

  return (
    <article className="mx-auto w-full max-w-3xl">
      <p className="text-xs font-semibold uppercase tracking-wider text-primary">
        Documentation
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
        Self-host the Tour and Travel CRM end to end
      </h1>
      <p className="mt-4 text-base leading-relaxed text-muted-foreground">
        Everything you need to take the template from a fresh fork to a
        production deploy. Work through the pages in order, or jump to the
        one you need.
      </p>

      <div className="mt-10 flex flex-col gap-10">
        {Object.entries(sections).map(([section, items]) => (
          <section key={section}>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {section}
            </h2>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {items.map((p) => (
                <Link
                  key={p.slug}
                  href={`/docs/${p.slug}`}
                  className="group flex flex-col rounded-xl border border-border bg-card/40 p-5 transition-colors hover:border-border hover:bg-card/70"
                >
                  <h3 className="text-sm font-semibold text-foreground">
                    {p.title}
                  </h3>
                  {p.description && (
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                      {p.description}
                    </p>
                  )}
                  <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-primary transition-colors group-hover:text-primary">
                    Read
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </article>
  )
}
