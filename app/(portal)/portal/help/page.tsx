'use client';

import { useState } from 'react';
import {
  ArrowRightLeft,
  BarChart2,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  Clock3,
  HelpCircle,
  Info,
  ListChecks,
  PlayCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react';

interface FeatureCard {
  id: string;
  title: string;
  icon: typeof CheckSquare;
  badge: string;
  badgeColor: string;
  summary: string;
  steps: string[];
  tips?: string;
}

const features: FeatureCard[] = [
  {
    id: 'my-tasks',
    title: 'My Tasks & Workflows',
    icon: CheckSquare,
    badge: 'Core Workflow',
    badgeColor: 'bg-blue-50 text-blue-700 ring-blue-200',
    summary: 'Manage your active daily task queue, accept timelines, and complete deliverables.',
    steps: [
      'View tasks assigned directly to you under the "My Tasks" dashboard tab.',
      'Accept new tasks with planned start and due dates before commencing work.',
      'Mark tasks "Complete" immediately after finishing to lock in your on-time score.',
      'Review pending checker feedback if a task is returned for rework.',
    ],
    tips: 'Pro-tip: Accepting tasks early helps checkers plan their verification schedule.',
  },
  {
    id: 'shift-tasks',
    title: 'Task Shifting & Handovers',
    icon: ArrowRightLeft,
    badge: 'New Feature',
    badgeColor: 'bg-purple-50 text-purple-700 ring-purple-200',
    summary: 'Transfer active tasks to a teammate in your department with complete lineage and audit trail.',
    steps: [
      'Open the task modal and click the "Shift Task" button at the bottom.',
      'Select a teammate in your department and provide a clear handover reason.',
      'The original task is locked as "Shifted" and a new child task is assigned to your teammate.',
      'Original start/due dates are preserved; the new assignee can request a revision if needed.',
      'Safety rule: A task can only be shifted once (max 1 shift) to maintain accountability.',
    ],
    tips: 'Lineage notes and handover history are permanently visible on both parent and child tasks.',
  },
  {
    id: 'checklist-search',
    title: 'Checklist & Live Search',
    icon: ListChecks,
    badge: 'Updated',
    badgeColor: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    summary: 'Execute routine daily, weekly, and monthly recurring duties with live search filtering.',
    steps: [
      'Filter recurring duties by Daily, Weekly, or Monthly periodicity.',
      'Use the top search bar to find checklists by Task ID, assignee, description, department, or remarks.',
      'Instant 0ms tick-off updates your period completion progress bars immediately.',
      'Clear search instantly with the "✕" button to view your full checklist list.',
    ],
    tips: 'Checklist tasks reset automatically at the start of each period.',
  },
  {
    id: 'role-hierarchy',
    title: 'Role & Hierarchy Rules',
    icon: Users,
    badge: 'Guide',
    badgeColor: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
    summary: 'Clear guidelines on task assignment, checkers, and department permissions.',
    steps: [
      'Interns: Create tasks for themselves and select a Department Member as the Checker.',
      'Members: Create tasks for themselves or assign tasks to Interns within their department.',
      'Checkers: Inspect submitted work and verify completions on their "Handoff / To Check" tab.',
      'Leaders & Admins: Assign tasks across all departments, reassign, and manage approvals.',
    ],
    tips: 'Interns cannot assign work to Members, but Members can act as Checkers for Interns.',
  },
  {
    id: 'date-revisions',
    title: 'Date Revisions & Extensions',
    icon: RefreshCw,
    badge: 'Workflow',
    badgeColor: 'bg-amber-50 text-amber-700 ring-amber-200',
    summary: 'Request official timeline extensions before deadlines to protect your MIS performance.',
    steps: [
      'If you foresee a delay, click "+ Request Revised Date" inside the task details.',
      'Select the new proposed due date and write a transparent explanation for the extension.',
      'Your Checker or Admin receives the request and can approve or reject with 1 click.',
      'For shifted tasks, approving the child revision automatically syncs the parent task timeline.',
    ],
    tips: 'Always submit revisions before the task becomes Overdue for faster checker approval.',
  },
  {
    id: 'mis-scores',
    title: 'MIS Performance Scores',
    icon: BarChart2,
    badge: 'MIS Scoring',
    badgeColor: 'bg-rose-50 text-rose-700 ring-rose-200',
    summary: 'Track your live performance metrics, weekly scores, and completion ratings.',
    steps: [
      'Live score is calculated dynamically based on on-time completions vs overdue tasks.',
      'Your live score badge is always visible in the top portal navigation bar.',
      'Visit the Scores page to compare "Current Week Score" vs "Last Week Score".',
      'For shifted tasks, the MIS score counts for both the parent and child tasks in their weekly delegation metrics.',
    ],
    tips: 'Completing tasks on or before the due date guarantees a maximum 100% score contribution.',
  },
];

const statuses = [
  {
    name: 'Pending Accept',
    description: 'Task is assigned. The assignee needs to accept and set timeline dates.',
    color: 'bg-yellow-50 text-yellow-700 ring-yellow-200',
    badgeDot: 'bg-yellow-500',
  },
  {
    name: 'In Progress',
    description: 'Task is accepted and actively being worked on by the assignee.',
    color: 'bg-blue-50 text-blue-700 ring-blue-200',
    badgeDot: 'bg-blue-500',
  },
  {
    name: 'Delay Requested',
    description: 'A revised due date was submitted and is currently awaiting checker approval.',
    color: 'bg-orange-50 text-orange-700 ring-orange-200',
    badgeDot: 'bg-orange-500',
  },
  {
    name: 'Overdue',
    description: 'The due date has passed. Immediate completion or date revision is required.',
    color: 'bg-red-50 text-red-700 ring-red-200',
    badgeDot: 'bg-red-500',
  },
  {
    name: 'Completed',
    description: 'Work is delivered. Ready for review and verification by the Checker or Admin.',
    color: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    badgeDot: 'bg-emerald-500',
  },
  {
    name: 'Verified',
    description: 'Checker has inspected and confirmed task completion. MIS score is locked in.',
    color: 'bg-green-50 text-green-700 ring-green-200',
    badgeDot: 'bg-green-600',
  },
  {
    name: 'Shifted',
    description: 'Task was handed over to a teammate; linked to the new active child task.',
    color: 'bg-purple-50 text-purple-700 ring-purple-200',
    badgeDot: 'bg-purple-500',
  },
  {
    name: 'Dead',
    description: 'Task is blocked or cancelled. Can be revived anytime by the creator or admin.',
    color: 'bg-gray-100 text-gray-700 ring-gray-200',
    badgeDot: 'bg-gray-400',
  },
];

const faqs = [
  {
    q: 'Why do I see my teammate’s tasks on my dashboard?',
    a: 'If you are a Member or Checker, tasks where you are designated as the "Checker" (handoffUid) appear in your "Handoff / To Check" tab and search results so you can verify them upon completion. Your personal actionable queue is always on the "My Tasks" tab.',
  },
  {
    q: 'Can an Intern assign a task to a Member?',
    a: 'Interns cannot assign work directly to Members. However, when an Intern creates a task for themselves, they can designate a Member in their department as the "Checker". The system allows this because the Intern is the Assignee and the Member is the Verifier.',
  },
  {
    q: 'What happens to start & due dates when a task is shifted?',
    a: 'When you shift a task, the original timeline dates are carried forward to the new child task. If the new assignee requires additional time, they can simply use the "+ Request Revised Date" feature to submit a new proposed deadline.',
  },
  {
    q: 'Can a task be shifted more than once?',
    a: 'No. To ensure clear accountability and avoid endless handovers, each task can only be shifted once. A shifted child task cannot be shifted again.',
  },
  {
    q: 'How do date revisions work for shifted tasks?',
    a: 'Only the active child task needs a revision request. When a checker or admin approves the child task’s revision, both the child and the parent tasks are automatically synchronized with the new dates.',
  },
  {
    q: 'How is MIS score counted when a shifted task is completed?',
    a: 'When a shifted task is completed and verified, the MIS score is counted for both the parent task and the child task in their respective weekly delegation metrics.',
  },
];

const quickRules = [
  { text: 'Accept new tasks promptly and confirm realistic start & due dates.', icon: Clock3 },
  { text: 'Submit date revisions before deadlines pass to protect your score.', icon: RefreshCw },
  { text: 'Use Shift Task when handing over responsibilities to a department peer.', icon: ArrowRightLeft },
  { text: 'Mark tasks Complete immediately upon delivery for fast checker verification.', icon: CheckCircle2 },
  { text: 'Use the Checklist search bar to quickly find recurring periodic duties.', icon: Search },
];

export default function PortalHelpPage() {
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  return (
    <div className="space-y-8 p-6 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between rounded-2xl bg-gradient-to-r from-brand-900 via-brand-800 to-indigo-950 p-6 text-white shadow-md">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur-sm text-brand-200">
            <Sparkles size={14} className="text-amber-400" />
            <span>Updated with Latest Features & Workflows</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">AHL Task Manager Help Center</h1>
          <p className="max-w-2xl text-sm leading-6 text-gray-200">
            Your comprehensive guide to task workflows, shift handovers, checklist search, date revisions, role permissions, and MIS performance scores.
          </p>
        </div>

        <div className="flex items-center gap-3 rounded-xl bg-white/10 p-3.5 backdrop-blur-md ring-1 ring-white/15 max-w-sm">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-brand-800 shadow-sm">
            <ShieldCheck size={20} />
          </div>
          <div>
            <p className="text-xs font-bold text-white">Daily Best Practice</p>
            <p className="text-[11px] leading-4 text-gray-200">Open your dashboard daily and clear Pending & In Progress actions.</p>
          </div>
        </div>
      </div>

      {/* Video & Daily Best Practices Grid */}
      <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="card overflow-hidden border border-gray-200 shadow-sm flex flex-col justify-between">
          <div className="border-b border-gray-100 px-5 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PlayCircle size={18} className="text-brand-600" />
                <h2 className="text-base font-semibold text-gray-900">Training & Walkthrough</h2>
              </div>
              <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700 ring-1 ring-brand-200">
                Portal Video
              </span>
            </div>
            <p className="mt-0.5 text-xs text-gray-500">Quick video walkthrough of the portal and key features.</p>
          </div>
          <div className="flex aspect-video items-center justify-center bg-gray-950 text-white">
            <div className="text-center p-6">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/10 transition-transform hover:scale-105 cursor-pointer shadow-lg">
                <PlayCircle size={36} className="text-white" />
              </div>
              <p className="mt-4 text-sm font-semibold tracking-wide">Video Walkthrough</p>
              <p className="mt-1 text-xs text-gray-400">Portal demonstration and training video</p>
            </div>
          </div>
        </div>

        <div className="card p-5 border border-gray-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap size={18} className="text-amber-600" />
                <h2 className="text-base font-semibold text-gray-900">Daily Best Practices</h2>
              </div>
              <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200">
                Quick Tips
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-500">Essential habits to maintain a 100% on-time performance score.</p>

            <div className="mt-4 space-y-3">
              {quickRules.map((rule) => {
                const RuleIcon = rule.icon;
                return (
                  <div key={rule.text} className="flex items-start gap-3 rounded-lg bg-gray-50 p-2.5 transition-colors hover:bg-gray-100/70">
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-100 text-brand-700">
                      <RuleIcon size={14} />
                    </div>
                    <p className="text-xs leading-5 text-gray-700">{rule.text}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-brand-50/70 border border-brand-100 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-brand-900">
              <ShieldCheck size={16} className="text-brand-700" />
              Checker Tip:
            </div>
            <p className="mt-1 text-[11px] leading-4 text-brand-800">
              Checkers should verify completed tasks on the &ldquo;Handoff / To Check&rdquo; tab promptly so teammate scores reflect immediately.
            </p>
          </div>
        </div>
      </section>

      {/* Feature Knowledge Cards */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Feature Modules & Guides</h2>
            <p className="text-xs text-gray-500">Step-by-step instructions for all features</p>
          </div>
          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
            {features.length} Reference Guides
          </span>
        </div>

        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {features.map(item => {
            const Icon = item.icon;
            return (
              <article
                key={item.id}
                className="card flex flex-col justify-between border border-gray-200 p-5 shadow-sm transition-all hover:border-brand-300 hover:shadow-md"
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-100">
                        <Icon size={20} />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-gray-900 leading-tight">{item.title}</h3>
                      </div>
                    </div>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${item.badgeColor}`}>
                      {item.badge}
                    </span>
                  </div>

                  <p className="mt-3 text-xs leading-5 text-gray-600 font-medium">{item.summary}</p>

                  {/* Step list */}
                  <ul className="mt-4 space-y-2 border-t border-gray-100 pt-3">
                    {item.steps.map((step, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-xs leading-5 text-gray-600">
                        <CheckCircle2 size={14} className="mt-1 shrink-0 text-emerald-600" />
                        <span>{step}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {item.tips && (
                  <div className="mt-4 rounded-lg bg-gray-50 p-2.5 text-[11px] leading-4 text-gray-600 border border-gray-100 flex items-start gap-1.5">
                    <Info size={14} className="mt-0.5 shrink-0 text-brand-600" />
                    <span>{item.tips}</span>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      {/* Task Status Badges Guide */}
      <section className="card p-6 border border-gray-200 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-900">Task Statuses Explained</h2>
            <p className="mt-0.5 text-xs text-gray-500">Understand the meaning and next required action for every badge</p>
          </div>
          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
            {statuses.length} Statuses
          </span>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {statuses.map(status => (
            <div
              key={status.name}
              className="rounded-xl border border-gray-100 bg-gray-50/60 p-3.5 transition-all hover:bg-white hover:border-gray-300 hover:shadow-sm"
            >
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${status.badgeDot}`} />
                <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ${status.color}`}>
                  {status.name}
                </span>
              </div>
              <p className="mt-2 text-xs leading-5 text-gray-600">{status.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Interactive FAQ Accordion */}
      <section className="card p-6 border border-gray-200 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-900">Frequently Asked Questions</h2>
            <p className="mt-0.5 text-xs text-gray-500">Quick answers to common questions about tasks, checkers, shifts, and scoring</p>
          </div>
          <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">
            {faqs.length} FAQs
          </span>
        </div>

        <div className="mt-4 divide-y divide-gray-100">
          {faqs.map((faq, index) => {
            const isExpanded = expandedFaq === index;
            return (
              <div key={faq.q} className="py-3.5">
                <button
                  onClick={() => setExpandedFaq(isExpanded ? null : index)}
                  className="flex w-full items-center justify-between text-left text-sm font-semibold text-gray-900 hover:text-brand-700 transition-colors"
                >
                  <span className="pr-4">{faq.q}</span>
                  <ChevronDown
                    size={18}
                    className={`shrink-0 text-gray-400 transition-transform duration-200 ${
                      isExpanded ? 'rotate-180 text-brand-600' : ''
                    }`}
                  />
                </button>
                {isExpanded && (
                  <div className="mt-2.5 rounded-lg bg-gray-50 p-3.5 text-xs leading-6 text-gray-700 border border-gray-100">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
