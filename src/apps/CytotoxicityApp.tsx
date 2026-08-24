import { useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_CYTOTOX_OPTIONS,
  analyseAll,
  emptyMatrix,
  formatDose,
  seriesFromMatrix,
  type CytotoxOptions,
  type DoseMatrix,
} from '../lib/cytotox'
import { confidenceLabel } from '../lib/quantify'
import { restoreOptions } from '../lib/persist'
import { formatR2 } from '../lib/format'
import { CytotoxTables } from '../components/CytotoxTables'
import { DoseResponseCurve } from '../components/DoseResponseCurve'
import { FlagList } from '../components/Results'
import { Masthead } from '../components/shared/Masthead'
import { SkipLink } from '../components/shared/SkipLink'
import { GuidanceProvider } from '../components/guidance/GuidanceProvider'
import { GuidancePin } from '../components/guidance/GuidancePin'
import { CYTOTOXICITY_GUIDANCE } from '../lib/guidance/corpus/cytotoxicity'
import { SHARED_GUIDANCE } from '../lib/guidance/corpus/shared'
import type { ToolContext } from '../lib/guidance/types'

const CORPUS = [...CYTOTOXICITY_GUIDANCE, ...SHARED_GUIDANCE]
import { LigantMark } from '../components/LigantMark'
import { exportChartSvg, exportCytotoxCsv } from '../lib/export'
import { CytotoxMethod } from '../components/CytotoxMethod'

const APP_VERSION = 'v0.1.0'
const STORAGE_KEY = 'cyto.state.v1'

interface Persisted {
  matrix: DoseMatrix
  options: CytotoxOptions
}

/**
 * A worked example with two constructs: one potent, one shifted right.
 *
 * The scatter is deliberate. A noiseless curve fits to R squared indistinguishable
 * from 1 and teaches nothing about reading a real assay. The low affinity
 * construct is also deliberately under-dosed, so its upper plateau is never
 * reached and the tool raises the flag that matters most here.
 */
function demoState(): Persisted {
  const doses = [0.156, 0.313, 0.625, 1.25, 2.5, 5, 10, 20]
  const strong = [2.4, 7.9, 13.1, 30.2, 48.1, 69.8, 78.6, 86.2]
  const weak = [1.8, 2.1, 5.7, 9.1, 20.6, 32.8, 54.3, 67.5]
  return {
    matrix: {
      doses,
      seriesNames: ['CAR-19 high affinity', 'CAR-19 low affinity'],
      responses: doses.map((_, i) => [strong[i], weak[i]]),
    },
    options: { ...DEFAULT_CYTOTOX_OPTIONS },
  }
}

function loadState(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Persisted>
      if (parsed.matrix?.doses?.length && parsed.options) {
        return {
          matrix: parsed.matrix,
          // Same merge as the other tool, for the same reason: an option added
          // after this state was written has no key here.
          options: restoreOptions(parsed.options, DEFAULT_CYTOTOX_OPTIONS),
        }
      }
    }
  } catch {
    // Private browsing, blocked site data, or a corrupt payload.
  }
  return demoState()
}

export default function CytotoxicityApp() {
  const [state, setState] = useState<Persisted>(loadState)
  // Clearing wipes transcribed data in one click, so it stays reversible.
  const [undoState, setUndoState] = useState<Persisted | null>(null)
  const { matrix, options } = state

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // Storage unavailable. The application remains fully functional without it.
    }
  }, [state])

  const analyses = useMemo(
    () => analyseAll(seriesFromMatrix(matrix), options),
    [matrix, options],
  )

  const guidanceContext: ToolContext = useMemo(() => {
    const fits = analyses.map((a) => a.fit).filter((f) => f !== null)
    const allFlags = analyses.flatMap((a) => a.flags)
    return {
      tool: 'cytotoxicity',
      facts: {
        seriesCount: analyses.length,
        pointCount: fits.length > 0 ? Math.max(...fits.map((f) => f!.n)) : 0,
        r2Worst: fits.length > 0 ? Math.min(...fits.map((f) => f!.r2)) : null,
        hillWorst: fits.length > 0 ? Math.max(...fits.map((f) => Math.abs(f!.params.hill))) : null,
        responseIsPercent: options.responseIsPercent,
        confidenceLevel: options.confidenceLevel,
        hasCriticalFlag: allFlags.some((f) => f.level === 'critical'),
        plateauUnreached: allFlags.some((f) => /plateau is not reached/.test(f.message)),
      },
      flags: allFlags,
    }
  }, [analyses, options])

  const setOptions = (patch: Partial<CytotoxOptions>) =>
    setState((s) => ({ ...s, options: { ...s.options, ...patch } }))

  return (
    <GuidanceProvider corpus={CORPUS} context={guidanceContext}>
    <div className="app">
      <SkipLink />
      <Masthead current="cytotoxicity" title="Cytotoxicity Curve Fitter">
        Fits a four parameter logistic to dose response data and reports potency with a confidence
        interval. Fitting is by Levenberg-Marquardt on a log dose axis. All values are computed
        deterministically. No model or inference is applied beyond the reported fit.
      </Masthead>

      <main id="main">
      <div className="layout">
        <div className="stack">
          <section className="panel">
            <div className="panel-head">
              <div className="titles">
                <span className="step">1</span>
                <h2>Dose response data</h2>
                <GuidancePin anchor="cy.dose" />
              </div>
            </div>
            <CytotoxTables
              matrix={matrix}
              doseLabel={options.doseLabel}
              onChange={(next) => setState((s) => ({ ...s, matrix: next }))}
            />
          </section>

          <section className="panel">
            <div className="panel-head">
              <div className="titles">
                <span className="step">2</span>
                <h2>Analysis settings</h2>
              </div>
            </div>
            <div className="panel-body stack" style={{ gap: 14 }}>
              <div className="field-row">
                <div className="field">
                  <label htmlFor="dose-label">Dose axis</label>
                  <input
                    id="dose-label"
                    type="text"
                    value={options.doseLabel}
                    onChange={(e) => setOptions({ doseLabel: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="response-label">Response axis</label>
                  <input
                    id="response-label"
                    type="text"
                    value={options.responseLabel}
                    onChange={(e) => setOptions({ responseLabel: e.target.value })}
                  />
                </div>
              </div>

              <div className="field-row">
                <div className="field">
                  <label htmlFor="pct">Response scale<GuidancePin anchor="cy.scale" /></label>
                  <select
                    id="pct"
                    value={options.responseIsPercent ? 'percent' : 'other'}
                    onChange={(e) => setOptions({ responseIsPercent: e.target.value === 'percent' })}
                  >
                    <option value="percent">Percentage (0 to 100)</option>
                    <option value="other">Unbounded</option>
                  </select>
                </div>
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
                A percentage scale enables a check that the fitted plateaus stay within a plausible
                range. Choose unbounded for raw counts or luminescence.
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
                    setState({ matrix: emptyMatrix(), options: { ...DEFAULT_CYTOTOX_OPTIONS } })
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
                The worked example compares two constructs with real scatter. The low affinity
                construct is deliberately under-dosed, so its response never plateaus and its
                potency is flagged as model-dependent.
              </p>
            </div>
          </section>

          <CytotoxMethod
            storageKeys={[STORAGE_KEY]}
            onClearStorage={() => {
              try {
                localStorage.removeItem(STORAGE_KEY)
              } catch {
                // Nothing was persisted, so there is nothing to remove.
              }
              setUndoState(state)
              setState({ matrix: emptyMatrix(), options: { ...DEFAULT_CYTOTOX_OPTIONS } })
            }}
          />
        </div>

        <div className="rail">
          <section className="panel">
            <div className="panel-head">
              <div className="titles"><h2>Fitted curves</h2><GuidancePin anchor="cy.curve" /></div>
              <button onClick={() => exportChartSvg('dose-response-svg', 'dose-response.svg')}>
                Export SVG
              </button>
            </div>
            <DoseResponseCurve analyses={analyses} options={options} />
          </section>

          <section className="panel">
            <div className="panel-head">
              <div className="titles"><h2>Potency</h2><GuidancePin anchor="cy.potency" /></div>
              {analyses.some((a) => a.fit) && (
                <button
                  className="primary"
                  onClick={() =>
                    exportCytotoxCsv(
                      {
                        doseLabel: options.doseLabel,
                        responseLabel: options.responseLabel,
                        responseIsPercent: options.responseIsPercent,
                        confidenceLevel: options.confidenceLevel,
                        appVersion: APP_VERSION,
                        series: analyses.map((a) => ({
                          label: a.series.label,
                          points: a.series.points.map((p) => ({ dose: p.dose, response: p.response })),
                          ec50: a.fit?.ec50 ?? null,
                          ec50Lower: a.fit?.ec50Lower ?? null,
                          ec50Upper: a.fit?.ec50Upper ?? null,
                          potencyLabel: a.potencyLabel,
                          hill: a.fit?.params.hill ?? null,
                          top: a.fit?.params.top ?? null,
                          bottom: a.fit?.params.bottom ?? null,
                          r2: a.fit?.r2 ?? null,
                          n: a.fit?.n ?? null,
                          converged: a.fit?.converged ?? null,
                          flags: a.flags.map((f) => f.message),
                        })),
                      },
                      'cytotoxicity-results.csv',
                    )
                  }
                >
                  Export CSV
                </button>
              )}
            </div>
            <div className="panel-body">
              {analyses.length === 0 && <div className="empty">Add a construct to fit a curve.</div>}
              {analyses.map((a) => (
                <div className="result-card" key={a.series.id}>
                  <div className="result-name">
                    <span>{a.series.label || 'Unnamed construct'}</span>
                    {a.fit && <span className="band-chip">{a.potencyLabel}</span>}
                  </div>

                  {a.error && <p className="hint">{a.error}</p>}

                  {a.fit && (
                    <>
                      <div className="hero">
                        <span className="value">{formatDose(a.fit.ec50)}</span>
                        <span className="unit">{options.doseLabel}</span>
                      </div>
                      <div className="ci">
                        {confidenceLabel(options.confidenceLevel)} {formatDose(a.fit.ec50Lower)} –{' '}
                        {formatDose(a.fit.ec50Upper)}
                      </div>

                      <dl className="detail-grid">
                        <dt>Hill slope</dt>
                        <dd>{a.fit.params.hill.toFixed(2)}</dd>
                        <dt>Top plateau</dt>
                        <dd>{a.fit.params.top.toFixed(1)}</dd>
                        <dt>Bottom plateau</dt>
                        <dd>{a.fit.params.bottom.toFixed(1)}</dd>
                        <dt>R²</dt>
                        <dd>{formatR2(a.fit.r2)}</dd>
                        <dt>Points</dt>
                        <dd>{a.fit.n}</dd>
                      </dl>
                    </>
                  )}

                  <FlagList flags={a.flags} />
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      </main>

      <p className="disclaimer">
        <strong>Research use only. Not for clinical or diagnostic decision-making.</strong>{' '}
        A four parameter logistic assumes a single saturating transition. A potency estimate is
        meaningful only where the data bracket the transition and reach both plateaus, which the
        flags above check. All computation is performed locally in this browser. Nothing you enter
        is transmitted, and the page contacts no third party.
      </p>

      <div className="colophon">
        <LigantMark size={16} />
        <span>Ligant · Cytotoxicity Curve Fitter {APP_VERSION}</span>
      </div>
    </div>
    </GuidanceProvider>
  )
}
