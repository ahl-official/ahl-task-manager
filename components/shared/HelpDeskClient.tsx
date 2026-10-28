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
  ShieldCheck,
  Smartphone,
  Sparkles,
  User,
  Users,
  Zap,
} from 'lucide-react';
import type { SessionUser } from '@/types';

interface Props {
  session?: SessionUser | null;
}

export default function HelpDeskClient({ session }: Props) {
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  const role = session?.role || 'member';
  const isAdmin = role === 'admin';
  const isLeader = role === 'leader';
  const userName = session?.name || 'Team Member';
  const department = session?.department || '';

  // 3-Step Daily Workflow tailored to role
  const quickSteps = isAdmin
    ? [
        {
          step: '1',
          title: 'Daily Oversight & Assignment',
          desc: 'Monitor company-wide task queues, review departmental checklists, and delegate new delegation tasks.',
          icon: Clock3,
          color: 'bg-blue-50 text-brand-700 border-blue-200',
        },
        {
          step: '2',
          title: 'Manage Extensions & Revisions',
          desc: 'Review date revision requests under Revisions and approve or reject proposed deadlines with reasons.',
          icon: RefreshCw,
          color: 'bg-amber-50 text-amber-700 border-amber-200',
        },
        {
          step: '3',
          title: 'Verify via Notification Bell 🔔',
          desc: 'Only Admins have the top-right Bell icon. Click it to review and approve all completed submissions across all teams with 1 click.',
          icon: Bell,
          color: 'bg-purple-50 text-purple-700 border-purple-200',
        },
      ]
    : [
        {
          step: '1',
          title: 'Check Morning Queue',
          desc: 'Open "My Tasks" or your "Checklist" every morning to review your daily tasks, checklists, and target due dates.',
          icon: Clock3,
          color: 'bg-blue-50 text-brand-700 border-blue-200',
        },
        {
          step: '2',
          title: 'Work & Complete on Time',
          desc: 'Deliver your work and click "Complete" on or before the deadline to lock in your 100% weekly MIS score.',
          icon: CheckCircle2,
          color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        },
        {
          step: '3',
          title: 'Verification & Sign-off',
          desc: isLeader
            ? 'Open your task queue, filter by "Completed", open the task you check and click "Verify Task" to approve.'
            : 'Your designated checker reviews your completed work directly in their task queue to verify and lock in your score.',
          icon: ShieldCheck,
          color: 'bg-purple-50 text-purple-700 border-purple-200',
        },
      ];

  // Key Features & Updates tailored to role
  const updates = isAdmin
    ? [
        {
          title: 'Verification Bell (Admin Only)',
          icon: Bell,
          badge: 'Top Header',
          badgeColor: 'bg-purple-50 text-purple-700 border-purple-200',
          desc: 'The global notification bell at the top right is exclusive to Administrators. It surfaces all completed tasks across all departments waiting for verification in real time.',
        },
        {
          title: 'Date Revision Decisions',
          icon: Zap,
          badge: 'Extensions',
          badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
          desc: 'Review and decide on date extension requests submitted by assignees. Approved dates update the task and automatically send WhatsApp confirmations.',
        },
        {
          title: 'Department & User Control',
          icon: Users,
          badge: 'Admin',
          badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
          desc: 'Manage departments, edit checkers on tasks, assign leaders, and maintain organizational scoring metrics.',
        },
        {
          title: 'Mobile App / Pin to Phone',
          icon: Smartphone,
          badge: 'Quick Access',
          badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          desc: 'Open the portal in Chrome or Safari on your phone, tap the menu (⋮ / Share) and select "Add to Home screen". Your login stays active for 30 days.',
        },
        {
          title: 'Checklist & Housekeeping Routines',
          icon: ListChecks,
          badge: 'Active',
          badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
          desc: 'Automated daily and weekly checklists for Housekeeping, Salon, and Office. 1-click tick-off saves instantly.',
        },
        {
          title: 'Task Handover / Shift Audit',
          icon: ArrowRightLeft,
          badge: 'Audit Trail',
          badgeColor: 'bg-brand-50 text-brand-700 border-brand-200',
          desc: 'Full visibility into all shifted tasks, reassigned assignees, and historical notes across teams.',
        },
      ]
    : [
        {
          title: 'Date Revision Requests',
          icon: Zap,
          badge: 'Deadline Extension',
          badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
          desc: 'If delayed, click "+ Request Revised Date" inside the task before the deadline. It stays in "Revision Requested" state until approved, protecting your MIS score.',
        },
        {
          title: isLeader ? 'Task Verification Queue' : 'Checker Verification',
          icon: ShieldCheck,
          badge: isLeader ? 'Checker Duty' : 'Sign-Off',
          badgeColor: 'bg-purple-50 text-purple-700 border-purple-200',
          desc: isLeader
            ? 'Filter your task list by "Completed" to find submissions where you are the designated checker. Open the task and click "Verify Task".'
            : 'When you click "Complete", your designated checker receives a notification and reviews your work directly from their task queue.',
        },
        {
          title: 'Mobile App / Pin to Phone',
          icon: Smartphone,
          badge: 'Home Screen',
          badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          desc: 'On your phone (Chrome or Safari), tap ⋮ or Share and tap "Add to Home screen". You stay logged in for 30 days with instant 1-tap access.',
        },
        {
          title: 'Daily & Weekly Checklists',
          icon: ListChecks,
          badge: 'Routines',
          badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
          desc: 'Tick off daily duties (Housekeeping, Salon, Office) directly on the Checklist tab. Each tick saves immediately to your record.',
        },
        {
          title: 'Shift Task to Teammate',
          icon: ArrowRightLeft,
          badge: 'Handover',
          badgeColor: 'bg-brand-50 text-brand-700 border-brand-200',
          desc: 'Need to pass a task to a colleague? Click "Shift Task" in task details. It transfers cleanly with complete history and checker tracking.',
        },
        {
          title: 'MIS Score & On-Time Performance',
          icon: CheckCircle2,
          badge: 'Scoring',
          badgeColor: 'bg-rose-50 text-rose-700 border-rose-200',
          desc: 'Completing tasks on or before the due date maintains your 100% score. Request extensions before due dates to prevent overdue penalties.',
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

  // Tailored FAQs based on role
  const faqs = isAdmin
    ? [
        {
          q: 'Where do I find tasks that need my verification?',
          a: 'As an Administrator, click the Bell icon 🔔 at the top right of your screen. It opens a quick-review popup of all completed tasks across all departments waiting for verification in real time.',
        },
        {
          q: 'How do date revision requests work?',
          a: 'When an assignee requests a date revision, it updates the task to "Revision Requested" and appears under Revisions in your sidebar. You can review their proposed date and reason, then Approve or Reject with 1 click.',
        },
        {
          q: 'How do I edit or assign a checker for a task?',
          a: 'Open any task in the task list. Next to the Checker field, click the pencil edit icon to assign any active team member as the checker.',
        },
        {
          q: 'How do I add this app to my phone home screen?',
          a: 'On Android (Chrome): Tap the 3 dots ⋮ in the top right and tap "Install app" or "Add to Home screen". On iPhone (Safari): Tap the Share button at the bottom and tap "Add to Home Screen". Your login will stay saved for 30 days.',
        },
      ]
    : [
        {
          q: 'Who has the notification bell?',
          a: 'Only System Administrators have the top-right global notification bell. As a team member or checker, you verify and manage tasks directly from your task list (filter by "Completed" to find tasks waiting for your check).',
        },
        {
          q: 'Where do I verify tasks if I am the checker?',
          a: 'Open your task list and filter the status by "Completed". Open any task where you are listed as the checker, review the completed work, and click the "Verify Task" button.',
        },
        {
          q: 'What if I cannot complete a task on time?',
          a: 'Open the task before the deadline passes and click "+ Request Revised Date". Enter your proposed new date and a short reason, then click Submit. The task will stay in "Revision Requested" state until your checker reviews it, protecting your MIS score from overdue penalties.',
        },
        {
          q: 'How do I see only my tasks?',
          a: 'Click "My Tasks" in the sidebar, or use the "Show my tasks" filter button to view only tasks assigned to you.',
        },
        {
          q: 'How do I add this app to my phone home screen?',
          a: 'On Android (Chrome): Tap the 3 dots ⋮ in the top right and tap "Install app" or "Add to Home screen". On iPhone (Safari): Tap the Share button at the bottom and tap "Add to Home Screen". Your login will stay saved for 30 days.',
        },
      ];

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-6xl mx-auto">
      {/* Top Banner Personalized to Logged-in User */}
      <div className="rounded-2xl bg-gradient-to-r from-brand-900 via-brand-800 to-indigo-950 p-5 sm:p-6 text-white shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-0.5 text-xs font-medium text-brand-200 backdrop-blur-sm mb-2">
              <Sparkles size={13} className="text-amber-300" />
              <span>
                {isAdmin
                  ? 'Administrator Help & Control Guide'
                  : isLeader
                  ? `Department Lead Guide • ${department}`
                  : `Team Member Portal Guide • ${department || 'General'}`}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
              {isAdmin
                ? 'AHL Task Manager — Admin Guide'
                : `How to Use AHL Task Manager, ${userName}`}
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-gray-200 max-w-2xl">
              {isAdmin
                ? 'Complete administrative guide for organizational oversight, global notification bell verification, date extensions, and checklists.'
                : 'Personalized guide for your daily queue, checklists, on-time task delivery, date revisions, and task verification.'}
            </p>
          </div>

          <div className="shrink-0 rounded-xl bg-white/10 p-3 backdrop-blur-sm border border-white/15 text-xs space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-white">
              <User size={13} className="text-brand-300" />
              <span>{userName}</span>
            </div>
            <p className="text-[11px] text-brand-200 capitalize">
              Role: <strong className="text-white">{role}</strong>
              {department && ` • ${department}`}
            </p>
            {isAdmin && (
              <span className="inline-block mt-1 text-[10px] font-semibold bg-amber-400 text-amber-950 px-2 py-0.5 rounded-md">
                🔔 Bell Verification Enabled
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Admin Bell Clarification Banner for Non-Admins */}
      {!isAdmin && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/80 p-3.5 text-xs text-blue-900 flex items-start gap-2.5">
          <HelpCircle size={16} className="text-blue-600 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong className="font-semibold">Notice regarding task verification:</strong> The top-right notification bell icon 🔔 is exclusive to System Administrators. As a team member or checker, you review and verify tasks directly within your task queue by filtering for <strong>"Completed"</strong> and opening the task to click <strong>"Verify Task"</strong>.
          </p>
        </div>
      )}

      {/* 3-Step Daily Workflow */}
      <section className="card p-5 border border-gray-200">
        <div className="mb-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-brand-700">3-Step Daily Workflow</h2>
          <p className="text-xs text-gray-500">
            {isAdmin ? 'Recommended administrative management cycle' : 'Follow this simple cycle every working day'}
          </p>
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
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-900">
            {isAdmin ? 'Administrative Features & Tools' : 'Key Features & Workflow Guide'}
          </h2>
          <p className="text-xs text-gray-500">Important tools tailored for your role</p>
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
          <p className="text-xs text-gray-500">Answers tailored for your role</p>
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
