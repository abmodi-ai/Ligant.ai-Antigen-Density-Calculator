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

export function standardsForKit(kit: BeadKit): BeadStandard[] {
  return kit.populations.map((label) => ({
    id: nextId('bead'),
    label,
    mfi: null,
    assigned: null,
    included: true,
  }))
}
