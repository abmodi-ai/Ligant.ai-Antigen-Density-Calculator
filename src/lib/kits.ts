import type { BeadStandard, HostSpecies, StandardKind } from './quantify'

export interface BeadKit {
  id: string
  name: string
  vendor: string
  standardKind: StandardKind
  /**
   * Immunoglobulin host these beads capture, where the kit works by capture.
   * Null for pre-conjugated standards, which carry no capture antibody and so
   * impose no constraint on the detection reagent's host.
   */
  captureHost: HostSpecies | null
  /** Labels of the bead populations, in ascending intensity order. */
  populations: string[]
  /** What the vial's certificate of analysis calls the assigned value. */
  assignedLabel: string
  note: string
}

/**
 * Assigned bead values are LOT-SPECIFIC and are deliberately not hard-coded:
 * they must be transcribed from the vial or the lot's certificate of analysis.
 * Kits here supply the population structure and the calibration chemistry only.
 */
export const BEAD_KITS: BeadKit[] = [
  {
    id: 'qsc-mouse',
    name: 'Quantum Simply Cellular (anti-Mouse IgG)',
    vendor: 'Bangs Laboratories',
    standardKind: 'abc',
    captureHost: 'mouse',
    populations: ['Blank', 'Population 1', 'Population 2', 'Population 3', 'Population 4'],
    assignedLabel: 'ABC',
    note: 'Beads carry a certified antibody binding capacity (ABC). Stain them with the antibody used for the sample. Calibration is fluorophore-independent, so no F/P correction applies.',
  },
  {
    id: 'qsc-human',
    name: 'Quantum Simply Cellular (anti-Human IgG)',
    vendor: 'Bangs Laboratories',
    standardKind: 'abc',
    captureHost: 'human',
    populations: ['Blank', 'Population 1', 'Population 2', 'Population 3', 'Population 4'],
    assignedLabel: 'ABC',
    note: 'Beads carry a certified antibody binding capacity (ABC), for humanised or fully human detection antibodies. Stain them with the antibody used for the sample.',
  },
  {
    id: 'quantibrite-pe',
    name: 'QuantiBRITE PE',
    vendor: 'BD Biosciences',
    standardKind: 'pe-molecules',
    captureHost: null,
    populations: ['Low', 'Medium low', 'Medium high', 'High'],
    assignedLabel: 'PE / bead',
    note: 'Beads are pre-conjugated and report PE molecules bound. Specify the conjugate F/P ratio to convert to antibodies bound; 1:1 conjugates require no correction.',
  },
  {
    id: 'custom',
    name: 'Custom / other standard',
    vendor: '',
    standardKind: 'abc',
    captureHost: null,
    populations: ['Standard 1', 'Standard 2', 'Standard 3', 'Standard 4'],
    assignedLabel: 'Assigned',
    note: 'Any calibrator with certified values. Select the chemistry matching the quantity the beads certify.',
  },
]

let counter = 0
export function nextId(prefix: string): string {
  counter += 1
  return `${prefix}-${counter}`
}

/** A kit's own name for the population that carries no antibody. */
const BLANK_POPULATION = /^blank$/i

export function standardsForKit(kit: BeadKit): BeadStandard[] {
  return kit.populations.map((label) => ({
    id: nextId('bead'),
    label,
    mfi: null,
    assigned: null,
    // A blank population carries no certified value by definition, so it cannot
    // be in the fit. It started ticked on a fresh sheet while starting unticked
    // in the worked example, which is the wrong way round for the reader with
    // less to go on.
    //
    // This reads a label, which the field checks deliberately never do. The
    // difference is whose label: this one comes from the kit definition in this
    // file at the moment the rows are built, not from a text input. Renaming
    // the row afterwards leaves inclusion exactly as the reader set it.
    included: !BLANK_POPULATION.test(label),
  }))
}

/**
 * Name for a population added after the kit's own rows, whether by the add
 * button or by a paste running past the end of the table.
 *
 * A kit names its populations and the reader can rename them, so an added row
 * continues the naming already in the table rather than introducing a second
 * one beside it. Quantum Simply Cellular ran Blank, Population 1 to 4 and then
 * offered "Standard 6", which appears in the residual strip and the CSV as
 * though a different kind of row had been added.
 *
 * The count is per stem, not per table: an unnumbered row such as Blank is not
 * a numbered population and does not advance the number.
 */
export function nextStandardLabel(standards: { label: string }[]): string {
  const numbered = /^(.*\S)\s+(\d+)$/
  const parsed = standards
    .map((s) => numbered.exec(s.label.trim()))
    .filter((m): m is RegExpExecArray => m !== null)

  // The last numbered row decides the stem, so a table renamed part way through
  // continues from what the reader last called a row rather than from the kit.
  const stem = parsed.length > 0 ? parsed[parsed.length - 1][1] : null
  if (stem === null) return `Population ${standards.length + 1}`

  const highest = parsed
    .filter((m) => m[1] === stem)
    .reduce((max, m) => Math.max(max, Number(m[2])), 0)
  return `${stem} ${highest + 1}`
}
