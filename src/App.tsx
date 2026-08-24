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
import { formatR2 } from './lib/format'
import { StandardCurve } from './components/StandardCurve'
import { Results, FlagList } from './components/Results'
import { StandardsTable, SamplesTable } from './components/Tables'
import { Method } from './components/Method'
import { LigantMark } from './components/LigantMark'
import { Masthead } from './components/shared/Masthead'
import { SkipLink } from './components/shared/SkipLink'
import { GuidanceProvider } from './components/guidance/GuidanceProvider'
import { GuidancePin } from './components/guidance/GuidancePin'
import { ANTIGEN_DENSITY_GUIDANCE } from './lib/guidance/corpus/antigen-density'
import { SHARED_GUIDANCE } from './lib/guidance/corpus/shared'
import type { ToolContext } from './lib/guidance/types'

const CORPUS = [...ANTIGEN_DENSITY_GUIDANCE, ...SHARED_GUIDANCE]

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
      { id: 'ds1', label: 'CD19 (NALM-6)', mfi: 8_900, controlMfi: 240 },
      { id: 'ds2', label: 'HER2 (SK-BR-3)', mfi: 62_000, controlMfi: 310 },
      { id: 'ds3', label: 'HER2 (primary keratinocyte)', mfi: 420, controlMfi: 260 },
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

export default function App() {
  const [state, setState] = useState<PersistedState>(loadState)
  // Clearing wipes transcribed data in one click, so it stays reversible.
  const [undoState, setUndoState] = useState<PersistedState | null>(null)

  const kit = BEAD_KITS.find((k) => k.id === state.kitId) ?? BEAD_KITS[0]
  const { standards, samples, options } = state

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // Storage unavailable. The application remains fully functional without it.
    }
  }, [state])

  const curveResult = useMemo(() => fitStandardCurve(standards), [standards])
  const curve: CurveResult | null = 'error' in curveResult ? null : curveResult

  const entries = useMemo(() => {
    if (!curve) return []
    return samples.map((sample) => ({ sample, result: quantifySample(sample, curve, options) }))
  }, [samples, curve, options])

  const guidanceContext: ToolContext = useMemo(
    () => ({
      tool: 'antigen-density',
      facts: {
        slope: curve?.fit.slope ?? null,
        intercept: curve?.fit.intercept ?? null,
        r2: curve?.fit.r2 ?? null,
        beadCount: curve?.fit.n ?? 0,
        standardKind: options.standardKind,
        backgroundMode: options.backgroundMode,
        valency: options.valency,
        confidenceLevel: options.confidenceLevel,
        sampleCount: entries.length,
        hasCriticalFlag: entries.some((e) => e.result.flags.some((f) => f.level === 'critical')),
      },
      flags: [...(curve?.flags ?? []), ...entries.flatMap((e) => e.result.flags)],
    }),
    [curve, options, entries],
  )

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
    <GuidanceProvider corpus={CORPUS} context={guidanceContext}>
    <div className="app">
      <SkipLink />
      <Masthead current="antigen-density" title="Antigen Density Calculator">
        Quantifies surface antigen density from flow cytometry median fluorescence intensity by
        calibration against certified bead standards. All values are computed deterministically by
        least-squares regression. No model or inference is applied beyond the reported fit.
      </Masthead>

      <main id="main">
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
                <label htmlFor="kit">Bead kit<GuidancePin anchor="ad.bead-kit" /></label>
                <select id="kit" value={kit.id} onChange={(e) => changeKit(e.target.value)}>
                  {BEAD_KITS.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name}{k.vendor && ` (${k.vendor})`}
                    </option>
                  ))}
                </select>
              </div>
              <p className="hint" style={{ marginTop: 9 }}>{kit.note}</p>
              <p className="hint" style={{ marginTop: 7 }}>
                <strong>Assigned values are lot-specific.</strong> Transcribe them from the vial or the
                lot certificate of analysis. No assigned values are hard-coded in this tool.
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
                  <label htmlFor="bg">Background subtraction<GuidancePin anchor="ad.background" /></label>
                  <select
                    id="bg"
                    value={options.backgroundMode}
                    onChange={(e) => setOptions({ backgroundMode: e.target.value as QuantifyOptions['backgroundMode'] })}
                  >
                    <option value="abc">Density space</option>
                    <option value="mfi">MFI space</option>
                    <option value="none">None</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="valency">Detection antibody<GuidancePin anchor="ad.valency" /></label>
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
                  <label htmlFor="conf">Confidence level<GuidancePin anchor="shared.confidence" /></label>
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
                  'Sample and control MFI are converted to densities independently, then subtracted. Preferred where the log-log slope departs from unity.'}
                {options.backgroundMode === 'mfi' &&
                  'Control MFI is subtracted prior to conversion. Equivalent to density-space subtraction only where the log-log slope is exactly unity.'}
                {options.backgroundMode === 'none' &&
                  'No background correction applied. The reported density includes non-specific binding and autofluorescence.'}
              </p>

              <div className="button-row">
                <button
                  onClick={() => {
                    setUndoState(null)
                    setState(demoState())
                  }}
                >
                  Load worked example
                </button>
                <button
                  onClick={() => {
                    setUndoState(state)
                    setState(emptyState(kit))
                  }}
                >
                  Clear all
                </button>
                {undoState && (
                  <button
                    className="primary"
                    onClick={() => {
                      setState(undoState)
                      setUndoState(null)
                    }}
                  >
                    Undo clear
                  </button>
                )}
              </div>
              <p className="hint">
                The worked example is a Quantum Simply Cellular run with three samples. The
                keratinocyte sample is deliberately under-range, so you can see what the tool does
                with a measurement that should not be reported.
              </p>
            </div>
          </section>

          <Method
            storageKeys={[STORAGE_KEY]}
            onClearStorage={() => {
              try {
                localStorage.removeItem(STORAGE_KEY)
              } catch {
                // Nothing was persisted, so there is nothing to remove.
              }
              setState(emptyState(kit))
            }}
          />
        </div>

        {/* ---------------- outputs ---------------- */}
        <div className="rail">
          <section className="panel">
            <div className="panel-head">
              <div className="titles"><h2>Standard curve</h2><GuidancePin anchor="ad.curve" /></div>
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
                  <span>R² <b>{formatR2(curve.fit.r2)}</b></span>
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
              <div className="titles"><h2>Antigen density</h2><GuidancePin anchor="ad.result" /></div>
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
                <Results
                  entries={entries}
                  valency={options.valency}
                  confidenceLevel={options.confidenceLevel}
                />
              ) : (
                <div className="empty">Fit a standard curve first.</div>
              )}
            </div>
          </section>
        </div>
      </div>

      </main>

      <p className="disclaimer">
        <strong>Research use only. Not for clinical or diagnostic decision-making.</strong>{' '}
        Results depend on the calibration standard supplied and on the assumption that beads and
        cells were acquired under identical cytometer settings. Antibody binding capacity is not
        equivalent to antigen copy number: epitope accessibility, binding valency, conjugate
        performance, and antigen internalisation all intervene between the two quantities. All
        computation is performed locally in this browser. Nothing you enter is transmitted, and the
        page contacts no third party.
      </p>

      <div className="colophon">
        <LigantMark size={16} />
        <span>Ligant · Antigen Density Calculator {APP_VERSION}</span>
      </div>
    </div>
    </GuidanceProvider>
  )
}
