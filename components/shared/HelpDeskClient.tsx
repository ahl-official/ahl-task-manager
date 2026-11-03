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
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  User,
  Users,
  Zap,
  BookOpen,
  Send,
  MessageSquare,
  FileSpreadsheet,
} from 'lucide-react';
import type { SessionUser } from '@/types';

interface Props {
  session?: SessionUser | null;
}

type TabType = 'admin' | 'member';

export default function HelpDeskClient({ session }: Props) {
  const role = session?.role || 'member';
  const isActualAdmin = role === 'admin';
  const isLeader = role === 'leader';
  const userName = session?.name || 'Team Member';
  const department = session?.department || '';

  // Mode: Default to admin if user is admin, else member
  const [activeTab, setActiveTab] = useState<TabType>(isActualAdmin ? 'admin' : 'member');
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketMessage, setTicketMessage] = useState('');
  const [ticketCategory, setTicketCategory] = useState('Task Issue');
  const [ticketPriority, setTicketPriority] = useState('Medium');
  const [ticketSent, setTicketSent] = useState(false);

  // ---------------------------------------------------------
  // ADMIN-LEVEL HELP DESK DATA
  // ---------------------------------------------------------
  const adminQuickSteps = [
    {
      step: '1',
      title: 'Global Task & Team Oversight',
      desc: 'Audit all departmental queues, verify cross-functional task delegations, and monitor overall company productivity.',
      icon: Users,
      color: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    },
    {
      step: '2',
      title: 'Approve Revisions & Extend Deadlines',
      desc: 'Review submitted extension requests under Revisions. Approved dates recalculate MIS score impact and notify staff instantly.',
      icon: RefreshCw,
      color: 'bg-amber-50 text-amber-700 border-amber-200',
    },
    {
      step: '3',
      title: 'Instant 1-Click Verification 🔔',
      desc: 'Only Admins have the top-right Notification Bell. Click it to review and approve all completed task submissions across all teams in 1 click.',
      icon: Bell,
      color: 'bg-purple-50 text-purple-700 border-purple-200',
    },
  ];

  const adminFeatures = [
    {
      title: 'Top Header Verification Bell',
      icon: Bell,
      badge: 'Admin Exclusive',
      badgeColor: 'bg-purple-50 text-purple-700 border-purple-200',
      desc: 'The global notification bell surfaces all completed tasks across all departments waiting for sign-off. You can approve or reject in real time without searching each person’s queue.',
    },
    {
      title: 'Date Revision Decision Engine',
      icon: Zap,
      badge: 'Deadline Control',
      badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
      desc: 'Review delayed task requests. Approving an extension reschedules the task, recalculates on-time scores, and sends automated WhatsApp confirmation.',
    },
    {
      title: 'Department & User Administration',
      icon: Users,
      badge: 'Permissions',
      badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
      desc: 'Manage user credentials, assign team leaders, update departments, and designate who checks whose work across salon and office branches.',
    },
    {
      title: 'Recurring Templates & Checklists',
      icon: ListChecks,
      badge: 'Automations',
      badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      desc: 'Create, update, and manage Daily, Weekly, and Monthly recurring task templates. Cloudflare D1 materializes checklist periods automatically.',
    },
    {
      title: 'Task Handover / Shift Audit',
      icon: ArrowRightLeft,
      badge: 'Audit Trail',
      badgeColor: 'bg-brand-50 text-brand-700 border-brand-200',
      desc: 'Review task reassignments, re-delegations, and historical notes between team members to avoid dropped responsibilities.',
    },
    {
      title: 'MIS Score & Performance Master',
      icon: FileSpreadsheet,
      badge: 'Weekly Sync',
      badgeColor: 'bg-rose-50 text-rose-700 border-rose-200',
      desc: 'Weekly on-time calculation engine with automatic Google Sheets syncing, Salon Monday off rules, and performance tracking.',
    },
  ];

  const adminFaqs = [
    {
      q: 'Where do I find all tasks waiting for verification?',
      a: 'As an Administrator, click the Bell icon 🔔 in the top-right header. It opens a modal listing all completed tasks waiting for approval across all teams. You can verify them individually or all at once.',
    },
    {
      q: 'How do I approve or reject an extension / revised date request?',
      a: 'Navigate to "Revisions" in your left sidebar. You will see all pending delay requests with proposed dates and reasons. Click "Approve" to extend the deadline without penalizing their on-time score, or "Reject" with notes.',
    },
    {
      q: 'How do I add a new recurring task for a staff member?',
      a: 'Go to "Create Task" or "Checklist", select "Recurring Task", define whether it is Daily, Weekly, or Monthly, select the assignee, and set the target time. It automatically generates scheduled checklist slots.',
    },
    {
      q: 'Why did salon members not get daily checklist tasks on Monday?',
      a: 'In AHL policy, Monday is the weekly off for Salon Daily doers. Daily checklist tasks for salon members are suppressed on Mondays and do not count against their planned score. Office staff daily tasks continue as normal.',
    },
    {
      q: 'How do I change the designated checker for an existing task?',
      a: 'Open any task details in the task table. Click the edit pencil next to the Checker field and select a new reviewer.',
    },
  ];

  // ---------------------------------------------------------
  // MEMBER-LEVEL HELP DESK DATA
  // ---------------------------------------------------------
  const memberQuickSteps = [
    {
      step: '1',
      title: 'Check Your Morning Queue',
      desc: 'Open "My Tasks" and "Checklist" every morning to see what needs to be delivered today and check your target deadlines.',
      icon: Clock3,
      color: 'bg-blue-50 text-brand-700 border-blue-200',
    },
    {
      step: '2',
      title: 'Complete Work on Time',
      desc: 'Deliver your task and click "Complete" before the deadline. If finishing a past task, mark it complete — it will be recorded as Completed (Late).',
      icon: CheckCircle2,
      color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    },
    {
      step: '3',
      title: 'Checker Verification',
      desc: isLeader
        ? 'Open your task queue, filter status by "Completed", open tasks you check and click "Verify Task" to approve.'
        : 'Your designated checker reviews your submitted task and approves it to lock in your score.',
      icon: ShieldCheck,
      color: 'bg-purple-50 text-purple-700 border-purple-200',
    },
  ];

  const memberFeatures = [
    {
      title: 'Request Revised Date (Before Deadline)',
      icon: Zap,
      badge: 'Score Protection',
      badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
      desc: 'If work will take longer, click "+ Request Revised Date" inside the task before it expires. Enter your new date and reason. While in "Revision Requested" state, it prevents overdue score penalties.',
    },
    {
      title: 'Daily & Weekly Checklists',
      icon: ListChecks,
      badge: 'Routines',
      badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
      desc: 'Open the Checklist tab to tick off your routine tasks. Use "Show my tasks" to focus on your own responsibilities.',
    },
    {
      title: 'Completing Past Tasks (Late)',
      icon: CheckCircle2,
      badge: 'Updated Policy',
      badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      desc: 'Past due tasks are never locked. You can still complete them; the system will record them as Completed (Late) so your work is documented.',
    },
    {
      title: 'Shift Task to Colleague',
      icon: ArrowRightLeft,
      badge: 'Handover',
      badgeColor: 'bg-brand-50 text-brand-700 border-brand-200',
      desc: 'Need a colleague to take over? Open the task and click "Shift Task". Select the teammate and state the handover reason.',
    },
    {
      title: 'My MIS Score',
      icon: FileSpreadsheet,
      badge: 'Weekly Tracking',
      badgeColor: 'bg-rose-50 text-rose-700 border-rose-200',
      desc: 'Check "My Score" in the sidebar to review your planned vs done tasks and your on-time delivery percentage.',
    },
    {
      title: 'Install on Phone / Pin to Home Screen',
      icon: Smartphone,
      badge: 'Fast Access',
      badgeColor: 'bg-purple-50 text-purple-700 border-purple-200',
      desc: 'Open the app in Chrome or Safari on your phone. Tap ⋮ or Share and tap "Add to Home screen". Your session stays active for 30 days.',
    },
  ];

  const memberFaqs = [
    {
      q: 'Why do I not see a Notification Bell 🔔 at the top?',
      a: 'The top-right notification bell is exclusive to System Administrators for global company-wide approvals. As a team member or leader, you review and verify tasks directly from your task list by filtering for "Completed".',
    },
    {
      q: 'Where do I verify tasks if I am assigned as a checker?',
      a: 'Go to "My Tasks", set the status filter to "Completed". Open any task where your name is the checker, review the submitted work, and click "Verify Task".',
    },
    {
      q: 'What should I do if my task is going to be delayed?',
      a: 'Always request an extension before the due date passes! Open the task, click "+ Request Revised Date", provide the new date and explanation, and submit. This prevents overdue penalties on your weekly MIS score.',
    },
    {
      q: 'How do I see only my own checklist tasks?',
      a: 'On the Checklist page, click the "Show my tasks" button at the top right to filter only items assigned to you.',
    },
    {
      q: 'Can I complete a task from a past date?',
      a: 'Yes. Past tasks are not locked. You can click "Mark Complete (Late)" and it will be recorded as completed.',
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

  const handleSendTicket = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketSubject.trim() || !ticketMessage.trim()) return;
    // Format WhatsApp message to support or admin
    const adminPhone = '919967716945';
    const text = encodeURIComponent(
      `*AHL Help Desk Issue Report*\n\n` +
      `*From:* ${userName} (${role.toUpperCase()})\n` +
      `*Department:* ${department || 'General'}\n` +
      `*Level View:* ${activeTab === 'admin' ? 'Admin Level' : 'Member Level'}\n` +
      `*Category:* ${ticketCategory}\n` +
      `*Priority:* ${ticketPriority}\n` +
      `*Subject:* ${ticketSubject}\n\n` +
      `*Details:*\n${ticketMessage}`
    );
    window.open(`https://wa.me/${adminPhone}?text=${text}`, '_blank');
    setTicketSent(true);
    setTimeout(() => setTicketSent(false), 5000);
  };

  const currentSteps = activeTab === 'admin' ? adminQuickSteps : memberQuickSteps;
  const currentFeatures = activeTab === 'admin' ? adminFeatures : memberFeatures;
  const currentFaqs = activeTab === 'admin' ? adminFaqs : memberFaqs;

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-6xl mx-auto">
      {/* Top Banner Personalized to Logged-in User */}
      <div className="rounded-2xl bg-gradient-to-r from-brand-900 via-brand-800 to-indigo-950 p-5 sm:p-6 text-white shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-0.5 text-xs font-medium text-brand-200 backdrop-blur-sm mb-2">
              <Sparkles size={13} className="text-amber-300" />
              <span>
                {activeTab === 'admin'
                  ? 'Administrator & Management Help Desk'
                  : `Team Member & Staff Help Desk • ${department || 'General'}`}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
              {activeTab === 'admin'
                ? 'AHL Help Desk — Admin Level'
                : `AHL Help Desk — Member Level, ${userName}`}
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-gray-200 max-w-2xl">
              {activeTab === 'admin'
                ? 'Comprehensive guide for administrators covering notification bell sign-offs, date extension decisions, user management, and recurring templates.'
                : 'Step-by-step instructions for team members to manage daily tasks, checklists, deadline extensions, and complete work on time.'}
            </p>
          </div>

          <div className="shrink-0 rounded-xl bg-white/10 p-3 backdrop-blur-sm border border-white/15 text-xs space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-white">
              <User size={13} className="text-brand-300" />
              <span>{userName}</span>
            </div>
            <p className="text-[11px] text-brand-200 capitalize">
              Account: <strong className="text-white">{role}</strong>
              {department && ` • ${department}`}
            </p>
            {isActualAdmin && (
              <span className="inline-block mt-1 text-[10px] font-semibold bg-amber-400 text-amber-950 px-2 py-0.5 rounded-md">
                Admin Privileges Active
              </span>
            )}
          </div>
        </div>

        {/* Level Switcher Tab — Allows switching, defaults to user's real level */}
        <div className="mt-5 pt-4 border-t border-white/15 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 bg-black/25 p-1 rounded-xl backdrop-blur-md border border-white/10">
            <button
              type="button"
              onClick={() => {
                setActiveTab('member');
                setExpandedFaq(null);
              }}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'member'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-300 hover:text-white'
              }`}
            >
              <User size={13} />
              <span>Member Level Help Desk</span>
              {!isActualAdmin && (
                <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-brand-100 text-brand-800 font-bold">Your Role</span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('admin');
                setExpandedFaq(null);
              }}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'admin'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-300 hover:text-white'
              }`}
            >
              <ShieldCheck size={13} />
              <span>Admin Level Help Desk</span>
              {isActualAdmin && (
                <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-amber-200 text-amber-950 font-bold">Your Role</span>
              )}
            </button>
          </div>

          <p className="text-[11px] text-brand-200">
            Current View: <strong className="text-white">{activeTab === 'admin' ? 'Admin Level' : 'Member Level'}</strong>
          </p>
        </div>
      </div>

      {/* Admin Bell Clarification Notice */}
      {activeTab === 'member' && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/80 p-3.5 text-xs text-blue-900 flex items-start gap-2.5">
          <HelpCircle size={16} className="text-blue-600 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong className="font-semibold">Notice regarding task verification:</strong> The top-right notification bell icon 🔔 is exclusive to System Administrators. As a team member or leader, you review and verify tasks directly within your task queue by filtering for <strong>"Completed"</strong> and opening the task to click <strong>"Verify Task"</strong>.
          </p>
        </div>
      )}

      {/* 3-Step Workflow */}
      <section className="card p-5 border border-gray-200">
        <div className="mb-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-brand-700">
            {activeTab === 'admin' ? '3-Step Administrative Management Cycle' : '3-Step Daily Member Routine'}
          </h2>
          <p className="text-xs text-gray-500">
            {activeTab === 'admin'
              ? 'Recommended daily operational cycle for administrators'
              : 'Follow this simple cycle every working day to keep your score at 100%'}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {currentSteps.map(item => {
            const Icon = item.icon;
            return (
              <div
                key={item.step}
                className="rounded-xl border border-gray-100 bg-gray-50/60 p-4 transition-all hover:bg-white hover:border-gray-200 hover:shadow-xs"
              >
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

      {/* Feature Guide Grid */}
      <section>
        <div className="mb-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-900">
            {activeTab === 'admin' ? 'Administrator Features & Controls' : 'Member Features & Score Rules'}
          </h2>
          <p className="text-xs text-gray-500">
            {activeTab === 'admin'
              ? 'Tools, capabilities, and system rules available to managers and admins'
              : 'Important guidelines for managing and completing your assigned responsibilities'}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {currentFeatures.map(item => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="card p-4 border border-gray-200 flex flex-col justify-between hover:border-brand-300 hover:shadow-xs transition-all"
              >
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
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-900">Task Lifecycle & Status Badges</h2>
          <p className="text-xs text-gray-500">How tasks progress from assignment to verified completion</p>
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

      {/* Frequently Asked Questions */}
      <section className="card p-5 border border-gray-200">
        <div className="mb-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-900">
            {activeTab === 'admin' ? 'Administrator FAQ' : 'Member FAQ'}
          </h2>
          <p className="text-xs text-gray-500">Quick answers to common questions</p>
        </div>

        <div className="divide-y divide-gray-100">
          {currentFaqs.map((faq, index) => {
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

      {/* Interactive Support / Help Desk Ticket Submission */}
      <section className="card p-5 border border-brand-200 bg-gradient-to-br from-white to-brand-50/40">
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 rounded-xl bg-brand-600 text-white shadow-xs">
            <MessageSquare size={18} />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900">Need Further Assistance?</h2>
            <p className="text-xs text-gray-500">
              Submit an issue directly to the AHL Administration & Tech Support via WhatsApp
            </p>
          </div>
        </div>

        <form onSubmit={handleSendTicket} className="space-y-3 max-w-2xl">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-medium text-gray-700">Issue Category</span>
              <select
                value={ticketCategory}
                onChange={e => setTicketCategory(e.target.value)}
                className="input w-full py-1.5 text-xs"
              >
                <option value="Task Issue">Task / Checklist Issue</option>
                <option value="Deadline Revision">Deadline / Revision Extension</option>
                <option value="Score Discrepancy">MIS Score Discrepancy</option>
                <option value="Account / Login">Login / User Access</option>
                <option value="System Bug">System Bug / Error</option>
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-xs font-medium text-gray-700">Priority Level</span>
              <select
                value={ticketPriority}
                onChange={e => setTicketPriority(e.target.value)}
                className="input w-full py-1.5 text-xs"
              >
                <option value="Normal">Normal</option>
                <option value="Medium">Medium</option>
                <option value="Urgent">Urgent (Immediate blocker)</option>
              </select>
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-gray-700">Subject</span>
            <input
              type="text"
              placeholder="Short description of the issue or question..."
              value={ticketSubject}
              onChange={e => setTicketSubject(e.target.value)}
              required
              className="input w-full py-2 text-xs"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-gray-700">Message / Details</span>
            <textarea
              placeholder="Explain the task ID, date, or problem you are encountering..."
              value={ticketMessage}
              onChange={e => setTicketMessage(e.target.value)}
              required
              rows={3}
              className="input w-full py-2 text-xs resize-none"
            />
          </label>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              className="btn-primary py-2 px-4 text-xs flex items-center gap-1.5 shadow-xs"
            >
              <Send size={13} />
              <span>Send to Support Desk</span>
            </button>
            {ticketSent && (
              <span className="text-xs font-medium text-emerald-600 flex items-center gap-1">
                <CheckCircle2 size={14} /> WhatsApp prompt opened!
              </span>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}
