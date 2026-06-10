import {
  BarChart2,
  CheckCircle2,
  CheckSquare,
  Clock3,
  HelpCircle,
  ListChecks,
  PlayCircle,
  PlusCircle,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';

const sections = [
  {
    title: 'My Tasks',
    icon: CheckSquare,
    points: [
      'Shows tasks assigned to you.',
      'Use status and priority filters to find work quickly.',
      'Open a task to accept it, mark it complete, request a revision, or review details.',
    ],
  },
  {
    title: 'Checklist',
    icon: ListChecks,
    points: [
      'Shows repeated daily, weekly, and monthly work.',
      'Complete checklist items only after the work is actually done.',
      'Completed checklist tasks contribute to your activity tracking.',
    ],
  },
  {
    title: 'Create Task',
    icon: PlusCircle,
    points: [
      'Delegate work to eligible team members.',
      'Add clear notes, deadline, priority, and checker details before submitting.',
      'Use the notes field for context that helps the assignee complete the task without follow-up.',
    ],
  },
  {
    title: 'Revisions',
    icon: RefreshCw,
    points: [
      'Request a revised deadline when a task cannot be completed on time.',
      'Give a short, honest reason for the delay.',
      'Revision requests remain pending until the checker or admin reviews them.',
    ],
  },
  {
    title: 'My Score',
    icon: BarChart2,
    points: [
      'Shows your MIS/task performance.',
      'Scores depend on assigned work, completed work, and on-time completion.',
      'Use the score page to understand where your task discipline can improve.',
    ],
  },
];

const statuses = [
  {
    name: 'Pending Accept',
    description: 'The task has been assigned but not accepted yet.',
    color: 'bg-yellow-50 text-yellow-700 ring-yellow-100',
  },
  {
    name: 'In Progress',
    description: 'The task has been accepted and is actively being worked on.',
    color: 'bg-blue-50 text-blue-700 ring-blue-100',
  },
  {
    name: 'Completed',
    description: 'The assignee has marked the task as done.',
    color: 'bg-green-50 text-green-700 ring-green-100',
  },
  {
    name: 'Verified',
    description: 'The checker has reviewed and confirmed the completed task.',
    color: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  },
  {
    name: 'Delay Requested',
    description: 'A revised date has been requested and is waiting for review.',
    color: 'bg-orange-50 text-orange-700 ring-orange-100',
  },
  {
    name: 'Overdue',
    description: 'The due date has passed and the task still needs action.',
    color: 'bg-red-50 text-red-700 ring-red-100',
  },
];

const quickRules = [
  'Accept new tasks before starting work.',
  'Keep notes short, specific, and action-focused.',
  'Mark tasks complete only when the work is finished.',
  'Request a revision before the deadline whenever possible.',
  'Check your dashboard daily to avoid missed work.',
];

export default function PortalHelpPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-brand-700">
            <HelpCircle size={17} />
            Portal Help
          </div>
          <h1 className="mt-2 text-2xl font-semibold text-gray-900">AHL Task Manager Guide</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500">
            Use this page as a quick reference for tasks, checklists, revisions, scores, and the expected workflow inside the portal.
          </p>
        </div>

        <div className="card max-w-sm border-0 bg-brand-50 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-brand-700">
              <ShieldCheck size={20} />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Daily habit</p>
              <p className="text-xs leading-5 text-gray-500">Open the portal once every day and clear pending actions first.</p>
            </div>
          </div>
        </div>
      </div>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="card overflow-hidden">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="text-base font-semibold text-gray-900">Training Video</h2>
            <p className="mt-0.5 text-xs text-gray-400">Add the walkthrough video here later.</p>
          </div>
          <div className="flex aspect-video items-center justify-center bg-gray-950 text-white">
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/10">
                <PlayCircle size={34} />
              </div>
              <p className="mt-4 text-sm font-semibold">Video placeholder</p>
              <p className="mt-1 text-xs text-gray-300">Training walkthrough will appear here</p>
            </div>
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2">
            <Clock3 size={18} className="text-brand-600" />
            <h2 className="text-base font-semibold text-gray-900">Quick Rules</h2>
          </div>
          <div className="mt-4 space-y-3">
            {quickRules.map((rule, index) => (
              <div key={rule} className="flex gap-3">
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
                  {index + 1}
                </div>
                <p className="text-sm leading-6 text-gray-600">{rule}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold text-gray-900">Portal Sections</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sections.map(({ title, icon: Icon, points }) => (
            <article key={title} className="card p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                  <Icon size={19} />
                </div>
                <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
              </div>
              <ul className="mt-4 space-y-2">
                {points.map(point => (
                  <li key={point} className="flex gap-2 text-sm leading-6 text-gray-600">
                    <CheckCircle2 size={15} className="mt-1 shrink-0 text-green-600" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-base font-semibold text-gray-900">Task Status Guide</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {statuses.map(status => (
            <div key={status.name} className="rounded-xl border border-gray-100 p-4">
              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${status.color}`}>
                {status.name}
              </span>
              <p className="mt-3 text-sm leading-6 text-gray-600">{status.description}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
