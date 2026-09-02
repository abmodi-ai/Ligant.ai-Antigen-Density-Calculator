/**
 * Quality flags shared by every bench tool.
 *
 * A flag states what is wrong and, wherever possible, what to do about it.
 * Diagnosis without a remedy leaves a user stuck at the moment they most need
 * help, which matters especially for students.
 */

export type FlagLevel = 'warning' | 'critical'

export interface Flag {
  level: FlagLevel
  message: string
  /** What the user should do. Omitted only when no action is available. */
  remedy?: string
}
