export type Link = {
  label: string
  url: string
  kind?: 'github' | 'linkedin' | 'email' | 'website' | 'other'
}

export type Profile = {
  name: string
  role: string
  tagline: string
  location?: string
  about: string[] // paragraphs
  /** Optional collapsible addendum for the About station (collapsed initially) */
  // {link} in text marks where the inline link goes
  aboutExtra?: {
    title: string
    paragraphs: (string | { text: string; link: { label: string; url: string } })[]
  }
  links: Link[] // profile links; email as mailto:
}

export type Project = {
  id: string // unique, url-safe
  title: string
  summary: string // 1-2 sentences
  tags: string[]
  url?: string // primary live link; opens in a new tab (repo-only projects can omit)
  repoUrl?: string
  year?: number
  role?: string
  /** 'mobile' renders the screenshot(s) inside in-code phone frames;
      'web' (default) renders the thumbnail full-bleed */
  thumbnailKind?: 'web' | 'mobile'
  thumbnail?: string // optional; if missing, generate a glyph from id
  /** Additional screens (mobile phone deck or web stack, up to 3 total) */
  thumbnailSecondary?: string
  thumbnailTertiary?: string
}

export type SkillGroup = { label: string; items: string[] }

export type Experience = {
  id: string
  role: string
  org: string
  start: string // 'YYYY-MM'
  end: string | null // null = present
  summary: string
  highlights?: string[]
  tags?: string[]
}

export type StationKind = 'intro' | 'about' | 'skills' | 'experience' | 'projects' | 'links'

export type Station = {
  id: string
  kind: StationKind
  title: string
}
