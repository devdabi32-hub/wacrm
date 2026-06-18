import type { MetadataRoute } from 'next'

/**
 * Sitemap served at /sitemap.xml. There's no public landing page —
 * "/" redirects straight to /login or /dashboard — so there's nothing
 * indexable to list here.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return []
}
