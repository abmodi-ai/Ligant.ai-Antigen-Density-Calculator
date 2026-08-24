import type { ReactNode } from 'react'
import { LigantLockup } from '../LigantMark'
import { GuidanceToggle } from '../guidance/GuidanceToggle'
import { TOOLS, type ToolId } from '../../lib/site'

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
                <a href={tool.path}>{tool.name}</a>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </header>
  )
}
