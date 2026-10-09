'use client';

import { useState } from 'react';
import {
  ArrowRightLeft,
  Bell,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  Clock3,
  HelpCircle,
  ListChecks,
  RefreshCw,
  Smartphone,
  Sparkles,
  Zap,
} from 'lucide-react';

const quickSteps = [
  {
    step: '1',
    title: 'Check Daily Queue',
    desc: 'Open "My Tasks" or "Checklist" every morning to see your assigned tasks and due dates.',
    icon: Clock3,
    color: 'bg-blue-50 text-brand-700 border-blue-200',
  },
  {
    step: '2',
    title: 'Work & Complete',
    desc: 'Perform the task and click "Complete" on or before the due date to protect your MIS score.',
    icon: CheckCircle2,
    color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  {
    step: '3',
    title: 'Verify via Bell 🔔',
    desc: 'Checkers and Admins click the top Bell icon to review and verify completed work with 1 click.',
    icon: Bell,
    color: 'bg-purple-50 text-purple-700 border-purple-200',
  },
];

const updates = [
  {
    title: 'Mobile App / Pin to Phone',
    icon: Smartphone,
    badge: 'New',
    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    desc: 'Open the portal in Chrome or Safari on your phone, tap the menu (⋮ / Share) and select "Add to Home screen". Your login session now stays active for 30 days.',
  },
  {
    title: 'Verification Bell (Top Right)',
    icon: Bell,
    badge: 'Top Header',
    badgeColor: 'bg-brand-50 text-brand-700 border-brand-200',
    desc: 'The notification bell sits at the top right. Checkers see all completed submissions waiting for verification in real time.',
  },
  {
    title: 'Quick Sync & My Tasks Filter',
    icon: RefreshCw,
    badge: 'Updated',
    badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
    desc: 'Use "Show my tasks" to view only your tasks, or click "Sync Tasks" beside the bell to refresh the latest 1,000 tasks instantly.',
  },
  {
    title: 'Checklist & Housekeeping Routines',
    icon: ListChecks,
    badge: 'Active',
    badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
    desc: 'Daily and weekly recurring duties for all teams, including Housekeeping, Salon, and Office. 1-click tick-off saves instantly.',
  },
  {
    title: 'Shift Task to Teammate',
    icon: ArrowRightLeft,
    badge: 'Handover',
    badgeColor: 'bg-purple-50 text-purple-700 border-purple-200',
    desc: 'Need to pass a task to a colleague? Click "Shift Task" inside task details. It transfers cleanly with complete history.',
  },
  {
    title: 'Date Extensions & MIS Score',
    icon: Zap,
    badge: 'Scoring',
    badgeColor: 'bg-rose-50 text-rose-700 border-rose-200',
    desc: 'If delayed, click "+ Request Revised Date" before deadline. Approved extensions prevent overdue penalties on your weekly score.',
  },
];

const statuses = [
  { name: 'Pending Accept', desc: 'New task assigned — open and accept it.', badge: 'bg-yellow-50 text-yellow-800 border-yellow-200' },
  { name: 'In Progress', desc: 'Accepted and actively being worked on.', badge: 'bg-blue-50 text-blue-800 border-blue-200' },
  { name: 'Completed', desc: 'Delivered by assignee — waiting for checker review.', badge: 'bg-purple-50 text-purple-800 border-purple-200' },
  { name: 'Verified', desc: 'Approved by checker/admin — score locked in 100%.', badge: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  { name: 'Delay Requested', desc: 'Revised date submitted — awaiting approval.', badge: 'bg-orange-50 text-orange-800 border-orange-200' },
  { name: 'Overdue', desc: 'Due date has passed without completion.', badge: 'bg-red-50 text-red-800 border-red-200' },
];

const faqs = [
  {
    q: 'How do I add this app to my phone home screen?',
    a: 'On Android (Chrome): Tap the 3 dots ⋮ in the top right and tap "Install app" or "Add to Home screen". On iPhone (Safari): Tap the Share button at the bottom and tap "Add to Home Screen". Your login will stay saved for 30 days.',
  },
  {
    q: 'Where do I find tasks that need my verification?',
    a: 'Click the Bell icon 🔔 at the top right of the page. It opens a popup list of all completed tasks waiting for your verification.',
  },
  {
    q: 'What if I cannot complete a task on time?',
    a: 'Open the task before the deadline passes and click "+ Request Revised Date". Choose your new date and provide a short reason so your checker can approve it without score penalty.',
  },
  {
    q: 'How do I see only my tasks when on the All Tasks page?',
    a: 'Click the "Show my tasks" button at the top header (beside the bell). Click it again anytime to switch back to viewing all tasks.',
  },
];

export default function PortalHelpPage() {
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-6xl mx-auto">
      {/* Top Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-brand-900 via-brand-800 to-indigo-950 p-5 sm:p-6 text-white shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-0.5 text-xs font-medium text-brand-200 backdrop-blur-sm mb-2">
              <Sparkles size={13} className="text-amber-300" />
              <span>Latest Portal Guide</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">How to Use AHL Task Manager</h1>
            <p className="mt-1 text-xs sm:text-sm text-gray-200 max-w-2xl">
              Simple guide to daily workflows, mobile installation, checklists, verification, and scoring.
            </p>
          </div>
        </div>
      </div>

      {/* 3-Step Daily Workflow */}
      <section className="card p-5 border border-gray-200">
        <div className="mb-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-brand-700">3-Step Daily Workflow</h2>
          <p className="text-xs text-gray-500">Follow this simple cycle every working day</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {quickSteps.map(item => {
            const Icon = item.icon;
            return (
              <div key={item.step} className="rounded-xl border border-gray-100 bg-gray-50/60 p-4 transition-all hover:bg-white hover:border-gray-200 hover:shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
                    {item.step}
                  </span>
                  <div className={`p-1.5 rounded-lg border ${item.color}`}>
                    <Icon size={16} />
                  </div>
                </div>
                <h3 className="text-sm font-semibold text-gray-900">{item.title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-gray-600">{item.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Feature & Updates Grid */}
      <section>
        <div className="mb-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-900">Key Features & Updates</h2>
          <p className="text-xs text-gray-500">Everything you need to know in short summary</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {updates.map(item => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="card p-4 border border-gray-200 flex flex-col justify-between hover:border-brand-300 hover:shadow-xs transition-all">
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                        <Icon size={16} />
                      </div>
                      <h3 className="text-xs sm:text-sm font-bold text-gray-900">{item.title}</h3>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${item.badgeColor} shrink-0`}>
                      {item.badge}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed text-gray-600">{item.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Task Status Guide */}
      <section className="card p-5 border border-gray-200">
        <div className="mb-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-900">Task Status Guide</h2>
          <p className="text-xs text-gray-500">What each task status badge means</p>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {statuses.map(status => (
            <div key={status.name} className="flex items-start gap-2.5 rounded-lg border border-gray-100 bg-gray-50/50 p-3">
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border shrink-0 ${status.badge}`}>
                {status.name}
              </span>
              <p className="text-xs text-gray-600 leading-tight">{status.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Quick FAQ Accordion */}
      <section className="card p-5 border border-gray-200">
        <div className="mb-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-900">Frequently Asked Questions</h2>
          <p className="text-xs text-gray-500">Short answers to common questions</p>
        </div>

        <div className="divide-y divide-gray-100">
          {faqs.map((faq, index) => {
            const isExpanded = expandedFaq === index;
            return (
              <div key={faq.q} className="py-3">
                <button
                  type="button"
                  onClick={() => setExpandedFaq(isExpanded ? null : index)}
                  className="flex w-full items-center justify-between text-left text-xs sm:text-sm font-semibold text-gray-900 hover:text-brand-700 transition-colors"
                >
                  <span className="pr-3">{faq.q}</span>
                  <ChevronDown
                    size={16}
                    className={`shrink-0 text-gray-400 transition-transform duration-200 ${
                      isExpanded ? 'rotate-180 text-brand-600' : ''
                    }`}
                  />
                </button>
                {isExpanded && (
                  <div className="mt-2 rounded-lg bg-gray-50 p-3 text-xs leading-relaxed text-gray-600 border border-gray-100">
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
