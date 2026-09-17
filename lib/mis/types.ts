import type { MisBucket } from '@/lib/mis/sheetFormula';

export interface MisParameterRow {
  id: string;
  label: string;
  section: string;
  group: 'checklist' | 'delegation' | 'fms';
  planned: number;
  done: number;
  onTime: number;
  gapPercent: number | null;
}

export interface MisPersonScore {
  uid: string | null;
  name: string;
  department: string;
  waNumber: string;
  checklist: MisBucket;
  delegation: MisBucket;
  fms: MisBucket;
  /** Office Daily / Salon Daily / Weekly & Monthly (+ delegation / FMS totals). */
  parameters?: MisParameterRow[];
  planned: number;
  done: number;
  onTime: number;
  /** G4-style gap percent (0 = all planned done). */
  gapPercent: number | null;
  /** G4 as decimal for MIS Data parity (−0.12). */
  gapDecimal: number | null;
  /** G5-style on-time gap percent. */
  onTimeGapPercent: number | null;
  weekKey: string;
  weekStart: string;
  weekEnd: string;
}

export interface MisWeeklySnapshot extends MisPersonScore {
  id: string;
  weekNumber: number;
  monthName: string;
  year: number;
  combinedWeek: string;
  createdAt: string;
  updatedAt: string;
}

export interface MisArchiveRow {
  id: string;
  timestamp: string;
  name: string;
  uid: string | null;
  h4: number | null;
  h5: number | null;
  weekKey: string;
  weekStart: string;
  weekEnd: string;
}

export interface MisMonthlyPersonReport {
  uid: string | null;
  name: string;
  department: string;
  waNumber: string;
  w1: number | null;
  w2: number | null;
  w3: number | null;
  w4: number | null;
  w5: number | null;
  ms: number | null;
  monthKey: string;
  monthName: string;
}
