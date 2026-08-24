import type { ReactNode } from 'react'
import { LigantLockup } from '../LigantMark'
import { GuidanceToggle } from '../guidance/GuidanceToggle'

/**
 * The suite. Absolute paths, since the site is served from a domain root.
 */
export const TOOLS = [
  { id: 'antigen-density', name: 'Antigen density', href: '/' },
  { id: 'cytotoxicity', name: 'Cytotoxicity', href: '/cytotoxicity/' },
] as const

export type ToolId = (typeof TOOLS)[number]['id']

interface Props {
  current: ToolId
  title: string
  children: ReactNode
}

export function Masthead({ current, title, children }: Props) {
  return (
    <header className="masthead">
      <div>
        <LigantLockup />
        <h1>{title}</h1>
        <p>{children}</p>
      </div>
      <nav className="tool-nav" aria-label="Bench tools">
        <GuidanceToggle />
        <ul>
          {TOOLS.map((tool) => (
            <li key={tool.id}>
              {tool.id === current ? (
                <span aria-current="page">{tool.name}</span>
              ) : (
                <a href={tool.href}>{tool.name}</a>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </header>
  )
}
