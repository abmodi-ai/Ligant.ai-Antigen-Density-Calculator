import type { ReactNode } from 'react'
import { LigantLockup } from '../LigantMark'

interface Props {
  title: string
  children: ReactNode
}

export function Masthead({ title, children }: Props) {
  return (
    <header className="masthead">
      <div>
        <LigantLockup />
        <h1>{title}</h1>
        <p>{children}</p>
      </div>
      <div className="tool-nav">
        {/*
          The suite's name. The lockup on the left names the company; this names
          what the company is offering here, which is the half a visitor
          arriving on a shared link does not otherwise get told. It sat beside a
          tool switcher and a guidance switch, and has outlived both.
        */}
        <span className="eyebrow suite-mark">Bench Tools</span>
      </div>
    </header>
  )
}
