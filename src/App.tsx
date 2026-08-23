import { useEffect, useMemo, useState } from 'react'
import { BEAD_KITS, standardsForKit, type BeadKit } from './lib/kits'
import {
  DEFAULT_OPTIONS,
  fitStandardCurve,
  quantifySample,
  type BeadStandard,
  type CurveResult,
  type QuantifyOptions,
  type Sample,
} from './lib/quantify'
import { exportChartSvg, exportResultsCsv } from './lib/export'
import { StandardCurve } from './components/StandardCurve'
import { Results, FlagList } from './components/Results'
import { StandardsTable, SamplesTable } from './components/Tables'
import { Method } from './components/Method'

const APP_VERSION = 'v0.1.0'
const STORAGE_KEY = 'adc.state.v1'

interface PersistedState {
  kitId: string
  standards: BeadStandard[]
  samples: Sample[]
  options: QuantifyOptions
}

/** A worked Quantum Simply Cellular run, including one deliberately out-of-range sample. */
function demoState(): PersistedState {
  return {
    kitId: 'qsc-mouse',
    standards: [
      { id: 'd0', label: 'Blank', mfi: 210, assigned: null, included: false },
      { id: 'd1', label: 'Population 1', mfi: 2_050, assigned: 8_300, included: true },
      { id: 'd2', label: 'Population 2', mfi: 12_900, assigned: 51_000, included: true },
      { id: 'd3', label: 'Population 3', mfi: 39_500, assigned: 175_000, included: true },
      { id: 'd4', label: 'Population 4', mfi: 121_000, assigned: 512_000, included: true },
    ],
    samples: [
      { id: 'ds1', label: 'CD19 — NALM-6', mfi: 8_900, controlMfi: 240 },
      { id: 'ds2', label: 'HER2 — SK-BR-3', mfi: 62_000, controlMfi: 310 },
      { id: 'ds3', label: 'HER2 — primary keratinocyte', mfi: 420, controlMfi: 260 },
    ],
    options: { ...DEFAULT_OPTIONS },
  }
}

function emptyState(kit: BeadKit): PersistedState {
  return {
    kitId: kit.id,
    standards: standardsForKit(kit),
    samples: [
      { id: 'e1', label: 'Sample 1', mfi: null, controlMfi: null },
      { id: 'e2', label: 'Sample 2', mfi: null, controlMfi: null },
    ],
    options: { ...DEFAULT_OPTIONS, standardKind: kit.standardKind },
  }
}

function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as PersistedState
      if (parsed.standards?.length && parsed.options) return parsed
    }
  } catch {
    // Private browsing, blocked site data, or a corrupt payload: fall through.
  }
  return demoState()
}

type Theme = 'system' | 'light' | 'dark'

export default function App() {
  const [state, setState] = useState<PersistedState>(loadState)
  const [theme, setTheme] = useState<Theme>('system')

  const kit = BEAD_KITS.find((k) => k.id === state.kitId) ?? BEAD_KITS[0]
  const { standards, samples, options } = state

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // Storage unavailable — the app stays fully functional without it.
    }
  }, [state])

  useEffect(() => {
    if (theme === 'system') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const curveResult = useMemo(() => fitStandardCurve(standards), [standards])
  const curve: CurveResult | null = 'error' in curveResult ? null : curveResult

  const entries = useMemo(() => {
    if (!curve) return []
    return samples.map((sample) => ({ sample, result: quantifySample(sample, curve, options) }))
  }, [samples, curve, options])

  const setOptions = (patch: Partial<QuantifyOptions>) =>
    setState((s) => ({ ...s, options: { ...s.options, ...patch } }))

  const changeKit = (kitId: string) => {
    const next = BEAD_KITS.find((k) => k.id === kitId)
    if (!next) return
    setState((s) => ({
      ...s,
      kitId,
      standards: standardsForKit(next),
      options: { ...s.options, standardKind: next.standardKind },
    }))
  }

  const isPe = options.standardKind === 'pe-molecules'

  return (
    <div className="app">
      <header className="masthead">
        <div>
          <div className="eyebrow">CAR-T bench tools</div>
          <h1>Antigen density calculator</h1>
          <p>
            Convert flow cytometry MFI into molecules per cell against a calibrated bead standard.
            Every number is computed deterministically from your inputs — no model, no estimation
            beyond the regression shown.
          </p>
        </div>
        <div className="toggle-theme">
          <label className="visually-hidden" htmlFor="theme">Colour theme</label>
          <select
            id="theme"
            value={theme}
            style={{ width: 'auto' }}
            onChange={(e) => setTheme(e.target.value as Theme)}
          >
            <option value="system">Auto</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
      </header>

      <div className="layout">
        {/* ---------------- inputs ---------------- */}
        <div className="stack">
          <section className="panel">
            <div className="panel-head">
              <div className="titles">
                <span className="step">1</span>
                <h2>Calibration standard</h2>
              </div>
            </div>
            <div className="panel-body" style={{ paddingBottom: 12 }}>
              <div className="field">
                <label htmlFor="kit">Bead kit</label>
                <select id="kit" value={kit.id} onChange={(e) => changeKit(e.target.value)}>
                  {BEAD_KITS.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name}{k.vendor && ` — ${k.vendor}`}
                    </option>
                  ))}
                </select>
              </div>
              <p className="hint" style={{ marginTop: 9 }}>{kit.note}</p>
              <p className="hint" style={{ marginTop: 7 }}>
                <strong>Assigned values are lot-specific.</strong> Transcribe them from the vial or the
                lot certificate of analysis — they are never hard-coded here.
              </p>
            </div>
            <StandardsTable
              standards={standards}
              assignedLabel={kit.assignedLabel}
              onChange={(next) => setState((s) => ({ ...s, standards: next }))}
            />
          </section>

          <section className="panel">
            <div className="panel-head">
              <div className="titles">
                <span className="step">2</span>
                <h2>Samples</h2>
              </div>
            </div>
            <SamplesTable
              samples={samples}
              showControl={options.backgroundMode !== 'none'}
              onChange={(next) => setState((s) => ({ ...s, samples: next }))}
            />
          </section>

          <section className="panel">
            <div className="panel-head">
              <div className="titles">
                <span className="step">3</span>
                <h2>Analysis settings</h2>
              </div>
            </div>
            <div className="panel-body stack" style={{ gap: 14 }}>
              <div className="field-row">
                <div className="field">
                  <label htmlFor="bg">Background subtraction</label>
                  <select
                    id="bg"
                    value={options.backgroundMode}
                    onChange={(e) => setOptions({ backgroundMode: e.target.value as QuantifyOptions['backgroundMode'] })}
                  >
                    <option value="abc">Subtract in density space</option>
                    <option value="mfi">Subtract in MFI space</option>
                    <option value="none">None</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="valency">Detection antibody</label>
                  <select
                    id="valency"
                    value={options.valency}
                    onChange={(e) => setOptions({ valency: e.target.value as QuantifyOptions['valency'] })}
                  >
                    <option value="bivalent">Whole IgG (bivalent)</option>
                    <option value="monovalent">Fab / scFv (1:1)</option>
                  </select>
                </div>
              </div>

              <div className="field-row">
                {isPe && (
                  <div className="field">
                    <label htmlFor="fp">Fluorophore:protein ratio</label>
                    <input
                      id="fp"
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={options.fpRatio}
                      onChange={(e) => setOptions({ fpRatio: Number(e.target.value) || 1 })}
                    />
                  </div>
                )}
                <div className="field">
                  <label htmlFor="conf">Confidence level</label>
                  <select
                    id="conf"
                    value={options.confidenceLevel}
                    onChange={(e) => setOptions({ confidenceLevel: Number(e.target.value) })}
                  >
                    <option value={0.9}>90%</option>
                    <option value={0.95}>95%</option>
                    <option value={0.99}>99%</option>
                  </select>
                </div>
              </div>

              <p className="hint">
                {options.backgroundMode === 'abc' &&
                  'Sample and control MFI are each converted to a density, then subtracted. Preferred when the log-log slope differs from 1.'}
                {options.backgroundMode === 'mfi' &&
                  'Control MFI is subtracted before conversion. Equivalent to density-space subtraction only when the log-log slope is exactly 1.'}
                {options.backgroundMode === 'none' &&
                  'No background correction. The reported density includes non-specific binding and autofluorescence.'}
              </p>

              <div className="button-row">
                <button onClick={() => setState(demoState())}>Load worked example</button>
                <button onClick={() => setState(emptyState(kit))}>Clear all</button>
              </div>
            </div>
          </section>

          <Method />
        </div>

        {/* ---------------- outputs ---------------- */}
        <div className="rail">
          <section className="panel">
            <div className="panel-head">
              <div className="titles"><h2>Standard curve</h2></div>
              {curve && (
                <button onClick={() => exportChartSvg('standard-curve-svg', 'standard-curve.svg')}>
                  Export SVG
                </button>
              )}
            </div>
            {curve ? (
              <>
                <StandardCurve
                  curve={curve}
                  samples={entries}
                  assignedLabel={isPe ? 'PE molecules per bead' : 'Molecules per cell'}
                  confidenceLevel={options.confidenceLevel}
                />
                <div className="fit-stats">
                  <span>Slope <b>{curve.fit.slope.toFixed(3)}</b></span>
                  <span>Intercept <b>{curve.fit.intercept.toFixed(3)}</b></span>
                  <span>R² <b>{curve.fit.r2.toFixed(4)}</b></span>
                  <span>n <b>{curve.fit.n}</b></span>
                </div>
                {curve.flags.length > 0 && (
                  <div className="panel-body" style={{ paddingTop: 4 }}>
                    <FlagList flags={curve.flags} />
                  </div>
                )}
              </>
            ) : (
              <div className="empty">
                {'error' in curveResult ? curveResult.error : 'Enter calibration standards to fit a curve.'}
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel-head">
              <div className="titles"><h2>Antigen density</h2></div>
              {curve && entries.length > 0 && (
                <button
                  className="primary"
                  onClick={() =>
                    exportResultsCsv(
                      {
                        kitName: kit.name,
                        assignedLabel: kit.assignedLabel,
                        options,
                        standards,
                        curve,
                        samples: entries,
                        appVersion: APP_VERSION,
                      },
                      'antigen-density-results.csv',
                    )
                  }
                >
                  Export CSV
                </button>
              )}
            </div>
            <div className="panel-body">
              {curve ? (
                <Results entries={entries} valency={options.valency} />
              ) : (
                <div className="empty">Fit a standard curve first.</div>
              )}
            </div>
          </section>
        </div>
      </div>

      <p className="disclaimer">
        <strong>Research use only. Not for clinical or diagnostic decision-making.</strong>{' '}
        Results depend entirely on the calibration standard you supply and on the assumption that
        the beads and cells were acquired with identical cytometer settings. Antibody-binding
        capacity is not the same quantity as antigen copy number: epitope accessibility, binding
        valency, conjugate performance, and antigen internalisation all sit between them. All
        calculations run locally in your browser — nothing is uploaded. {APP_VERSION}
      </p>
    </div>
  )
}
