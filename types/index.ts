export interface FirestoreTimestamp {
  toDate(): Date;
  toMillis(): number;
}

// ─── User ───────────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'leader' | 'member' | 'intern';

export interface AHLUser {
  uid: string;
  name: string;
  waNumber: string;       // full digits e.g. "919876543210"
  waNumberLast10: string; // last 10 digits
  role: UserRole;
  department: string;
  isActive: boolean;
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
}

// ─── Task ───────────────────────────────────────────────────────────────────

export type TaskCategory = 'Daily' | 'Checklist' | 'Weekly' | 'Delegation' | 'FMS';
export type TaskPriority = 'High' | 'Medium' | 'Low';
export type TaskStatus =
  | 'Pending Accept'
  | 'In Progress'
  | 'Delay Requested'
  | 'Overdue'
  | 'Completed'
  | 'Verified';

export type RevisionStatus = 'none' | 'requested' | 'accepted' | 'rejected';

export interface Task {
  taskId: string;
  description: string;
  assignedTo: string;       // uid
  assignedToName: string;
  assignedToWa: string;
  createdBy: string;        // uid
  createdByName: string;
  handoffUid: string;
  handoffName: string;
  handoffWa: string;
  category: TaskCategory;
  priority: TaskPriority;
  status: TaskStatus;
  department: string;
  startDate: FirestoreTimestamp;
  endDate: FirestoreTimestamp;
  delayedDate: FirestoreTimestamp | null;
  delayReason: string | null;
  revisionStatus: RevisionStatus;
  notes: string | null;
  acceptedAt: FirestoreTimestamp | null;
  completedAt: FirestoreTimestamp | null;
  verifiedAt: FirestoreTimestamp | null;
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
}

// Serialized version for client components (Timestamps → ISO strings)
export interface TaskSerialized extends Omit<Task,
  'startDate' | 'endDate' | 'delayedDate' | 'acceptedAt' |
  'completedAt' | 'verifiedAt' | 'createdAt' | 'updatedAt'
> {
  startDate: string;
  endDate: string;
  delayedDate: string | null;
  acceptedAt: string | null;
  completedAt: string | null;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskInput {
  description: string;
  assignedTo: string;   // uid
  category: TaskCategory;
  priority: TaskPriority;
  startDate: string;    // ISO
  endDate: string;      // ISO
  handoffUid: string;
  notes?: string;
  department: string;
}

// ─── Revision ───────────────────────────────────────────────────────────────

export type RevisionDecision = 'pending' | 'approved' | 'rejected';

export interface RevisionLog {
  id: string;
  taskId: string;
  requestedBy: string;
  requestedByName: string;
  requestedDate: FirestoreTimestamp;
  reason: string;
  status: RevisionDecision;
  decidedBy: string | null;
  decidedByName: string | null;
  decidedAt: FirestoreTimestamp | null;
  createdAt: FirestoreTimestamp;
}

export interface RevisionLogSerialized extends Omit<RevisionLog,
  'requestedDate' | 'decidedAt' | 'createdAt'
> {
  requestedDate: string;
  decidedAt: string | null;
  createdAt: string;
}

// ─── Score ──────────────────────────────────────────────────────────────────

export interface UserScore {
  uid: string;
  name: string;
  department: string;
  waNumber: string;
  tasksAssigned: number;
  tasksCompleted: number;
  onTimeCount: number;
  lateCount: number;
  monthlyScore: number;
  lastUpdated: FirestoreTimestamp;
}

// ─── Log ────────────────────────────────────────────────────────────────────

export type LogType =
  | 'TASK_CREATED'
  | 'TASK_ACCEPTED'
  | 'TASK_DONE'
  | 'TASK_VERIFIED'
  | 'SEND_WA'
  | 'INBOUND_WA'
  | 'WEBHOOK_RAW'
  | 'WEBHOOK_ERROR'
  | 'REVISION_REQUESTED_PORTAL'
  | 'REVISION_DECIDED_PORTAL'
  | 'REMINDER'
  | 'SCORE_UPDATE';

export interface AppLog {
  id: string;
  type: LogType;
  taskId: string | null;
  uid: string | null;
  message: string;
  meta: Record<string, unknown>;
  createdAt: FirestoreTimestamp;
}

// ─── Config ─────────────────────────────────────────────────────────────────

export interface AppConfig {
  wahaUrl: string;
  wahaSession: string;
  wahaApiKey: string;
  coordinatorWa: string;
  portalUrl: string;
  updatedAt: FirestoreTimestamp;
}

// ─── API responses ──────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// ─── Auth session (stored in cookie) ────────────────────────────────────────

export interface SessionUser {
  uid: string;
  name: string;
  role: UserRole;
  department: string;
  waNumber: string;
}
