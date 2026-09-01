import { numberFact, type GuidanceEntry, type ToolContext } from '../types'

/**
 * Facts published by the antigen density tool:
 *   slope, intercept, r2, beadCount, minBeadMfi, maxBeadMfi,
 *   standardKind ('abc' | 'pe-molecules'), backgroundMode, valency,
 *   confidenceLevel, sampleCount, hasCriticalFlag
 */
export const ANTIGEN_DENSITY_GUIDANCE: GuidanceEntry[] = [
  // ---------------------------------------------------------------------
  // Definitions. A reader who has never run this assay asks what a thing is
  // and why it is there before asking which option to choose, and these are
  // placed first so a panel opens on the answer to the first question.
  // ---------------------------------------------------------------------
  {
    id: 'ad.beads.what',
    anchor: 'ad.bead-kit',
    kind: 'definition',
    title: 'What is a bead kit, and why is one needed?',
    body: [
      {
        kind: 'p',
        text: 'A cytometer does not measure molecules. It measures how much light a cell emitted, and reports it in arbitrary units that depend on the detector voltage, the optical configuration and the instrument itself. The same cells read on a different machine, or on the same machine at a different voltage, give a different number.',
      },
      {
        kind: 'p',
        text: 'A bead kit, also called a bead standard, is a set of microspheres carrying a *certified* number of binding sites, or of fluorophore molecules, per bead. Run alongside the cells under identical settings, they give several points where the arbitrary units and the real quantity are both known. Fitting those points produces the conversion this tool applies to the sample.',
      },
      {
        kind: 'p',
        text: 'That is the whole reason the standard exists: without it, an MFI is a number that cannot be compared with anybody else\u2019s, including your own from last month.',
      },
      {
        kind: 'note',
        text: 'Because the conversion is only valid at the settings the beads were read under, beads and cells must be acquired in the same session. Nothing in the output can tell you if they were not.',
      },
    ],
  },
  {
    id: 'ad.mfi.what',
    anchor: 'ad.mfi',
    kind: 'definition',
    title: 'What is MFI?',
    body: [
      {
        kind: 'p',
        text: 'Median fluorescence intensity: the middle brightness of a gated population, in the detector\u2019s arbitrary units. It summarises how much antibody the average cell in that gate carried, in a form the calibration can convert.',
      },
      {
        kind: 'p',
        text: 'It is a property of a *population*, not of a cell. One MFI describes the gate you drew, so where the gate includes debris, doublets or dead cells, the number describes those too.',
      },
      {
        kind: 'note',
        text: 'The units mean nothing on their own. An MFI of 8,900 is not larger than an MFI of 400 on another instrument in any meaningful sense, which is what the bead standard exists to fix.',
      },
    ],
  },
  {
    id: 'ad.assigned.what',
    anchor: 'ad.assigned',
    kind: 'definition',
    title: 'What is an assigned value?',
    body: [
      {
        kind: 'p',
        text: 'The quantity the manufacturer certifies for one bead population: how many antibody molecules that population can bind, or how many fluorophore molecules it carries. It is the known half of each calibration point, paired with the MFI you measure.',
      },
      {
        kind: 'p',
        text: 'Assigned values are determined per manufacturing lot and vary between lots of the same product, which is why they arrive on the vial or its certificate of analysis rather than in a catalogue.',
      },
    ],
  },
  {
    id: 'ad.lot.why',
    anchor: 'ad.lot',
    kind: 'definition',
    title: 'Why record the bead lot?',
    body: [
      {
        kind: 'p',
        text: 'Because it is the only defence against the one failure this tool cannot detect. Assigned values are certified per manufacturing lot and differ between lots of the same product. A fit built from the wrong lot\u2019s certificate is a straight line through consistent numbers: the slope is near one, the residuals are small, and every check here is satisfied. The result is wrong by whatever the two lots differ by, and nothing in the arithmetic can see it.',
      },
      {
        kind: 'p',
        text: 'Nothing computes from what you type here. It is a label, carried into the exported figure and into the settings block of the exported CSV, so that a density and the provenance of the ruler that produced it stay together. Where it is left empty the export says so rather than leaving a blank.',
      },
      {
        kind: 'note',
        text: 'The lot is on the vial and on the certificate of analysis that shipped with it. Transcribe both the lot and its assigned values from the same document, at the same time.',
      },
    ],
  },
  {
    id: 'ad.control.what',
    anchor: 'ad.control',
    kind: 'definition',
    title: 'What is the control channel for?',
    body: [
      {
        kind: 'p',
        text: 'Not all of a stained cell\u2019s signal comes from antibody bound to the target. Cells emit light of their own, and antibody sticks to surfaces it was not raised against. The control measures that floor, on cells treated the same way but without the specific binding you are trying to quantify.',
      },
      {
        kind: 'p',
        text: 'Subtracting it is what turns a measurement of *total* signal into a measurement of *specific* signal. Where the floor is a large share of the total, most of the reported result is the difference between two similar numbers, which the tool says on the result card.',
      },
    ],
  },
  {
    id: 'ad.background.why',
    anchor: 'ad.background',
    kind: 'definition',
    title: 'Why is background subtracted at all?',
    body: [
      {
        kind: 'p',
        text: 'Because the quantity of interest is antibody bound to the target, and the stained tube contains that plus autofluorescence plus non-specific binding. Reporting the stained tube alone attributes all three to the antigen.',
      },
      {
        kind: 'p',
        text: 'The subtraction can be done before converting to density or after, and the two are not the same operation unless the log-log slope is exactly one. Which to use is a separate question, answered under the background setting itself.',
      },
      {
        kind: 'note',
        text: 'Subtraction removes a floor. It cannot remove a signal that scales with the cells, so it does not correct for dead cells binding antibody non-specifically.',
      },
    ],
  },
  {
    id: 'ad.valency.what',
    anchor: 'ad.valency',
    kind: 'definition',
    title: 'What is binding valency, and why does it change the answer?',
    body: [
      {
        kind: 'p',
        text: 'How many antigen sites one antibody molecule occupies. A whole IgG has two binding arms and can bridge two sites at once; a Fab fragment or an scFv has one and binds one.',
      },
      {
        kind: 'p',
        text: 'The calibration counts *antibody molecules bound*, so where the detection antibody binds with both arms, the number of antigen sites can be up to twice the number of antibodies. That is why the result is reported as a range rather than a single figure, and why the range is labelled as inferred: the tool has not measured how many arms were engaged, and neither have you.',
      },
      {
        kind: 'note',
        text: 'The range bounds the sites that were engaged, and it bounds them from below. An epitope that was masked, already occupied, or internalised binds nothing and is counted nowhere, so the total antigen on the cell can exceed the top of the range by any amount. Twice the measured value is not a ceiling on antigen.',
      },
    ],
  },
  {
    id: 'ad.curve.what',
    anchor: 'ad.curve',
    kind: 'definition',
    title: 'What is a standard curve?',
    body: [
      {
        kind: 'p',
        text: 'The fitted relationship between what was measured and what is known. Each bead population supplies one point: an MFI you acquired and an assigned value the manufacturer certified. A line through those points, fitted in log-log space, is the rule used to read an unknown sample.',
      },
      {
        kind: 'p',
        text: 'Everything the tool reports about the curve is about how much that rule can be trusted. The slope says whether the detector responded proportionally, R squared says how close the points sit to the line, the residuals say which population is responsible for any departure, and the calibrated range says where the rule applies at all.',
      },
      {
        kind: 'note',
        text: 'A sample outside the bead range is not converted by the curve but extrapolated beyond it, which is a different and much weaker claim.',
      },
    ],
  },
  {
    id: 'ad.result.what',
    anchor: 'ad.result',
    kind: 'definition',
    title: 'What is antibody binding capacity?',
    body: [
      {
        kind: 'p',
        text: 'ABC is the number of antibody molecules a cell binds when every accessible site is occupied. It is what a calibrated flow measurement can actually establish, and it is the figure reported here.',
      },
      {
        kind: 'p',
        text: 'It is *not* antigen copy number, and the difference is not pedantry. An epitope may be hidden by glycosylation or by a binding partner, an antibody may bridge two sites, a conjugate may perform differently from the one used to certify the beads, and antigen may be internalised during staining. Each of those separates molecules bound from molecules present.',
      },
      {
        kind: 'note',
        text: 'Report it as ABC and state the antibody, the clone and the control used. A reader can then judge how far it sits from copy number for your system.',
      },
    ],
  },
  {
    id: 'ad.saturation.what',
    anchor: 'ad.saturation',
    kind: 'definition',
    title: 'What does titrating to saturation mean?',
    body: [
      {
        kind: 'p',
        text: 'Staining the same cells with a series of antibody concentrations and finding the point beyond which the signal stops rising. Past that point every accessible site is occupied, and adding more antibody adds only background.',
      },
      {
        kind: 'p',
        text: 'Capacity is only measured when the sites are full. Below saturation the measurement reports how much antibody was supplied rather than how much the surface could hold, which is why an unconfirmed titration makes every value a lower bound.',
      },
      {
        kind: 'note',
        text: 'Saturation must be established on the beads as well as the cells. Their surface densities differ by orders of magnitude, so a concentration that saturates one need not saturate the other.',
      },
    ],
  },

  {
    id: 'ad.host.why',
    anchor: 'ad.host',
    title: 'Why does the antibody host species matter?',
    body: [
      {
        kind: 'p',
        text: 'Capture beads work by binding one host\u2019s immunoglobulin. Quantum Simply Cellular anti-Mouse beads capture mouse IgG; the anti-Human kit captures human and humanised IgG. Their assigned values are certified for that pairing.',
      },
      {
        kind: 'p',
        text: 'The reason this is worth declaring is not that a mismatched stain gives no signal. Anti-immunoglobulin reagents cross-react across related hosts to an *uncertified* degree, so mismatched beads can still produce an ordered, well-fitting series while binding a fraction of the antibody their certificate assumes. The curve looks healthy and every value derived from it is wrong.',
      },
      {
        kind: 'note',
        text: 'This is a declaration, not a measurement. Nothing in the numbers reveals a host mismatch, which is why the tool has to ask.',
      },
      {
        kind: 'list',
        items: [
          'Pre-conjugated standards such as QuantiBRITE PE carry no capture antibody, so they impose no constraint on the host and the check does not apply.',
          'The related error no selector can catch is staining beads and cells with different lots or different concentrations of the same antibody. Use one preparation for both.',
        ],
      },
    ],
  },
  {
    id: 'ad.saturation.why',
    anchor: 'ad.saturation',
    title: 'Was the stain titrated to saturation?',
    body: [
      {
        kind: 'p',
        text: 'Antibody binding capacity is the number of antibody molecules the surface can bind, which is only measured when every available site is occupied. Sub-saturating antibody is the commonest way this measurement goes wrong at the bench.',
      },
      {
        kind: 'p',
        text: 'It fails in one direction. An under-titrated stain *undercounts*, so a result obtained without confirmed saturation is a lower bound rather than an estimate that might fall either side.',
      },
      {
        kind: 'list',
        items: [
          'Titrate on the cells and on the beads. Saturating on one does not establish saturation on the other, since the surface densities differ by orders of magnitude.',
          'A titration curve that has plateaued is the evidence. Using the vendor\u2019s recommended volume is not.',
          'Leaving this unconfirmed does not block anything. The tool reports the values and states that they are lower bounds, in the interface and in the export.',
        ],
      },
    ],
  },
  {
    id: 'ad.kit.which',
    anchor: 'ad.bead-kit',
    title: 'Which kit do I have?',
    body: [
      {
        kind: 'p',
        text: 'The two chemistries certify different quantities, which is why the choice changes the arithmetic rather than just the label.',
      },
      {
        kind: 'list',
        items: [
          'Quantum Simply Cellular and equivalents certify an antibody binding capacity. You stain the beads with your own antibody, so the calibration is independent of the fluorophore and no F/P correction applies.',
          'QuantiBRITE PE and equivalents arrive pre-conjugated and certify PE molecules per bead. Converting to antibodies bound needs the fluorophore to protein ratio of your conjugate.',
        ],
      },
      {
        kind: 'note',
        text: 'If the vial says you must stain the beads yourself, it is an ABC kit.',
      },
    ],
  },
  {
    id: 'ad.assigned.where',
    anchor: 'ad.assigned',
    title: 'Where do I find the assigned values?',
    body: [
      {
        kind: 'p',
        text: 'On the vial label or the lot certificate of analysis that shipped with the kit. They are specific to the lot, not to the product, so a value copied from a paper or an old notebook will be wrong.',
      },
      {
        kind: 'p',
        text: 'Enter one value per bead population, in the same order as the peaks you gated. The blank population carries no certified value and is excluded from the fit.',
      },
      {
        kind: 'note',
        text: 'No assigned values are stored in this tool, precisely because they change between lots.',
      },
    ],
  },
  {
    id: 'ad.mfi.statistic',
    anchor: 'ad.mfi',
    title: 'Which fluorescence statistic should I use?',
    body: [
      {
        kind: 'p',
        text: 'This is the single most common source of error in the method. Cytometry software will offer mean, median and geometric mean, and they disagree on the skewed distributions flow data produces.',
      },
      {
        kind: 'list',
        items: [
          'Use the median, or the geometric mean if your laboratory has standardised on it. Both are robust to the long upper tail.',
          'Do not use the arithmetic mean. A handful of bright events drags it upward and inflates the density.',
          'Whichever you choose, use the same statistic for the beads, the sample and the control. Mixing them invalidates the calibration.',
        ],
      },
      {
        kind: 'note',
        text: 'Beads and cells must also be acquired in the same session at the same detector voltages. A voltage change between runs invalidates the curve.',
      },
    ],
  },
  {
    id: 'ad.control.which',
    anchor: 'ad.control',
    title: 'Isotype, FMO, or unstained?',
    body: [
      {
        kind: 'p',
        text: 'The control defines what counts as background, so the choice moves the result. State which you used when you report the number.',
      },
      {
        kind: 'list',
        items: [
          'Fluorescence minus one is the usual choice for density work. It captures spillover from the other detectors in the panel, which is what actually inflates a dim signal.',
          'An isotype control captures non-specific binding of the antibody class. It is informative but is not a substitute for an FMO in a multi-colour panel.',
          'Unstained cells capture autofluorescence only, and will under-correct in most panels.',
        ],
      },
    ],
  },
  {
    id: 'ad.background.mode',
    anchor: 'ad.background',
    title: 'Subtract in density or MFI space?',
    body: [
      {
        kind: 'p',
        text: 'The calibration is a power law, so subtracting before and after converting are not the same operation unless the log-log slope is exactly one. Both modes are defensible and neither is a correction of the other.',
      },
      {
        kind: 'list',
        items: [
          'Density space converts the stained and control channels separately, then subtracts. Preferred where the log-log slope departs from unity, since the mapping from MFI to ABC is then non-proportional and subtracting first distorts it.',
          'MFI space subtracts first, then converts once. This reflects the physical fact that autofluorescence and non-specific binding add in fluorescence units, because photons add. That is a real argument, not merely an older convention.',
        ],
      },
      {
        kind: 'p',
        text: 'The two agree closely where the slope is near unity and the background is small, and diverge where it is not. Where they differ by more than about a tenth for a given sample, the tool says so on the result card: that divergence is itself information about how much the choice matters for your data. Whichever you use, *state which mode* when reporting the value.',
      },
    ],
  },
  {
    id: 'ad.valency.which',
    anchor: 'ad.valency',
    title: 'Is my detection antibody bivalent?',
    body: [
      {
        kind: 'p',
        text: 'A whole IgG has two binding arms. Where the antigen is dense enough for both to engage, one antibody occupies two epitopes, so the measured binding capacity understates the number of antigen sites.',
      },
      {
        kind: 'list',
        items: [
          'Whole IgG: antigen sites lie between the measured value and twice it. The tool reports that range rather than pretending to a single figure.',
          'A Fab, F(ab*)2 arm, or a monovalent scFv binds one epitope, so sites and binding capacity coincide.',
        ],
      },
      {
        kind: 'note',
        text: 'The reagent datasheet states the format. If it says IgG with no further qualification, it is bivalent.',
      },
    ],
  },
  {
    id: 'ad.curve.straight',
    anchor: 'ad.curve',
    title: 'Is my standard curve actually a straight line?',
    body: [
      {
        kind: 'p',
        text: 'The calibration assumes the relationship between log MFI and log assigned value is a straight line. A standard that bends biases every value converted through it, and the bias changes sign across the range: too high at one end, too low at the other.',
      },
      {
        kind: 'p',
        text: 'Neither of the two figures you would reach for reveals it. A symmetric bend leaves the *overall slope at unity*, because the departures at the two ends cancel, and leaves *R squared high*, because most of a gentle parabola over this range is line. A curve whose local slope runs from 1.16 at the low end to 0.84 at the high end fits with slope 1.00 and R squared 0.998.',
      },
      {
        kind: 'p',
        text: 'So the tool tests a quadratic term directly, and reports the bend as the drift in local slope across the range, which is the form you can act on. The usual cause is detector non-linearity at one end of the scale.',
      },
      {
        kind: 'note',
        text: 'The test needs six populations. Below that it is not reported, because it has no power to report anything: at five populations the smallest bend it could distinguish from noise is a slope drift of about 0.44, and at four about 1.38. Absence of the test is not evidence the standard is straight.',
      },
    ],
  },
  {
    id: 'ad.curve.slope',
    anchor: 'ad.curve',
    title: 'Reading the standard curve',
    body: [
      {
        kind: 'p',
        text: 'The fit is a straight line in log-log space. Two numbers tell you whether it is trustworthy.',
      },
      {
        kind: 'list',
        items: [
          'The slope should sit near one. That is what a linear detector response looks like.',
          'R squared should exceed about 0.98. Below that, look for a saturated or off-scale bead population before doing anything else.',
        ],
      },
    ],
  },
  {
    id: 'ad.curve.slope-off',
    anchor: 'ad.curve',
    priority: 10,
    when: (c: ToolContext) => {
      const slope = numberFact(c, 'slope')
      return slope !== null && Math.abs(slope - 1) > 0.15
    },
    title: 'Your slope is some way from one',
    body: [
      {
        kind: 'p',
        text: 'A log-log slope well away from unity usually means the detector is not responding linearly across the range you used, rather than that the beads are wrong.',
      },
      {
        kind: 'list',
        items: [
          'Check whether the brightest bead population is saturating the detector. Lower the voltage and re-acquire if so.',
          'Confirm compensation was applied consistently to beads and cells.',
          'Check that each bead population was gated on the correct peak, and that none were transposed.',
        ],
      },
    ],
  },
  {
    id: 'ad.result.meaning',
    anchor: 'ad.result',
    title: 'What does this number mean?',
    body: [
      {
        kind: 'p',
        text: 'It is the number of antibody molecules bound per cell, which is the closest practical measure of how much antigen a CAR will encounter.',
      },
      {
        kind: 'p',
        text: 'It is not the antigen copy number. Epitope accessibility, binding valency, conjugate performance and antigen internalisation all sit between the two, and each of them loses you signal rather than gaining it.',
      },
      {
        kind: 'note',
        text: 'The density bands are order of magnitude reading aids drawn from the published threshold literature. They are not validated cutoffs, and the real threshold belongs to your construct.',
      },
    ],
  },
]
