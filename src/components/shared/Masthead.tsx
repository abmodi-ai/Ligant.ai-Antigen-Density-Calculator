import type { ReactNode } from 'react'
import { LigantLockup } from '../LigantMark'
import { LISTED_TOOLS, TOOLS, type ToolId } from '../../lib/site'

interface Props {
  current: ToolId
  title: string
  children: ReactNode
}

export function Masthead({ current, title, children }: Props) {
  // Listed tools, plus the one being looked at. A visitor who followed a link
  // to an unlisted tool is already there, so the switcher is the only way back
  // and hiding it would strand them. It does not advertise that tool anywhere
  // else. With nothing to switch between the list is dropped rather than shown
  // as a single item labelled as the current page, which says nothing.
  const here = TOOLS.find((tool) => tool.id === current)
  const offered =
    here && !here.listed ? [...LISTED_TOOLS, here] : LISTED_TOOLS

  return (
    <header className="masthead">
      <div>
        <LigantLockup />
        <h1>{title}</h1>
        <p>{children}</p>
      </div>
      <nav className="tool-nav" aria-label="Bench tools">
        {/*
          The suite's name, where the guidance switch used to sit. The lockup on
          the left names the company; this names what the company is offering
          here, which is the half a visitor arriving on a shared link does not
          otherwise get told.
        */}
        <span className="eyebrow suite-mark">Bench Tools</span>
        {offered.length > 1 && (
          <ul>
            {offered.map((tool) => (
              <li key={tool.id}>
                {tool.id === current ? (
                  <span aria-current="page">{tool.name}</span>
                ) : (
                  <a href={tool.path}>{tool.name}</a>
                )}
              </li>
            ))}
          </ul>
        )}
      </nav>
    </header>
  )
}
