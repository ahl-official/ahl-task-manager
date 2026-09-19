import React from 'react';
import { cn } from '@/lib/utils';

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-gray-200/80',
        className
      )}
      {...props}
    />
  );
}

export function ScoreFilterBarSkeleton() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Search Input Skeleton */}
      <div className="relative min-w-[220px] flex-1 basis-[240px]">
        <Skeleton className="h-10 w-full rounded-lg" />
      </div>

      {/* Week Selector / Date skeletons */}
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-9.5 w-9.5 rounded-lg" />
        <Skeleton className="h-10 w-44 rounded-lg" />
        <Skeleton className="h-10 w-36 rounded-lg" />
        <Skeleton className="h-9.5 w-9.5 rounded-lg" />
        <Skeleton className="h-5 w-24 rounded" />
      </div>
    </div>
  );
}

export function ScoresDepartmentGridSkeleton() {
  return (
    <div className="space-y-5">
      <ScoreFilterBarSkeleton />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card min-h-[190px] p-5">
            {/* Top row: Dept icon, name, dept MIS */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-xl" />
                <div className="space-y-1.5">
                  <Skeleton className="h-5 w-28 rounded" />
                  <Skeleton className="h-3.5 w-20 rounded" />
                </div>
              </div>
              <div className="flex flex-col items-end space-y-1">
                <Skeleton className="h-7 w-16 rounded" />
                <Skeleton className="h-3 w-12 rounded" />
              </div>
            </div>

            {/* Bottom row: 5 metric boxes (Total, Pending, Active, Done, Late) */}
            <div className="mt-5 grid grid-cols-5 gap-2">
              {Array.from({ length: 5 }).map((_, j) => (
                <div key={j} className="rounded-lg bg-gray-50 px-2 py-2 text-center flex flex-col items-center space-y-1">
                  <Skeleton className="h-4 w-6 rounded" />
                  <Skeleton className="h-3 w-8 rounded" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ScoresListSkeleton() {
  return (
    <div className="space-y-4">
      <ScoreFilterBarSkeleton />
      <Skeleton className="h-4 w-72 rounded" />

      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card border p-4 space-y-3">
            <div className="flex items-center gap-4">
              <Skeleton className="h-5 w-8 rounded" />
              <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-4 w-32 rounded" />
                <Skeleton className="h-3 w-24 rounded" />
              </div>
              <div className="hidden items-center gap-5 md:flex">
                <Skeleton className="h-8 w-16 rounded-lg" />
                <Skeleton className="h-8 w-16 rounded-lg" />
                <Skeleton className="h-8 w-16 rounded-lg" />
                <Skeleton className="h-8 w-16 rounded-lg" />
              </div>
              <div className="flex flex-col items-end space-y-1">
                <Skeleton className="h-6 w-14 rounded" />
                <Skeleton className="h-3 w-12 rounded" />
              </div>
            </div>
            <Skeleton className="h-1.5 w-full rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ScoresMemberProfileSkeleton() {
  return (
    <div className="max-w-xl space-y-5 p-6">
      <div className="pr-14 space-y-1">
        <Skeleton className="h-7 w-32 rounded" />
        <Skeleton className="h-4 w-48 rounded" />
      </div>

      {/* Main Score Card Skeleton */}
      <div className="card p-6 text-center bg-gradient-to-br from-brand-50 to-white flex flex-col items-center space-y-3">
        <Skeleton className="h-16 w-16 rounded-2xl" />
        <Skeleton className="h-12 w-28 rounded-lg" />
        <Skeleton className="h-4 w-20 rounded" />
        <Skeleton className="h-3 w-36 rounded" />

        <div className="mt-2 w-full rounded-xl bg-white/80 p-4 flex flex-col items-center space-y-2">
          <Skeleton className="h-7 w-20 rounded" />
          <Skeleton className="h-3.5 w-52 rounded" />
          <Skeleton className="h-3 w-40 rounded" />
        </div>

        <Skeleton className="mt-2 h-2.5 w-full rounded-full" />
      </div>

      {/* Weekly History Card Skeleton */}
      <div className="card p-4 space-y-3">
        <Skeleton className="h-4 w-32 rounded" />
        <Skeleton className="h-3 w-56 rounded" />
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg border border-gray-100 p-3">
              <div className="space-y-1">
                <Skeleton className="h-4 w-20 rounded" />
                <Skeleton className="h-3 w-36 rounded" />
              </div>
              <Skeleton className="h-5 w-12 rounded" />
            </div>
          ))}
        </div>
      </div>

      {/* Stats Grid Skeleton */}
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-4 flex items-center gap-3 border-0 bg-gray-50">
            <Skeleton className="h-6 w-6 rounded" />
            <div className="space-y-1">
              <Skeleton className="h-5 w-10 rounded" />
              <Skeleton className="h-3 w-16 rounded" />
            </div>
          </div>
        ))}
      </div>

      {/* Task Summary Card Skeleton */}
      <div className="card p-4 space-y-3">
        <Skeleton className="h-4 w-36 rounded" />
        <div className="space-y-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Skeleton className="h-2 w-2 rounded-full" />
                <Skeleton className="h-3.5 w-24 rounded" />
              </div>
              <Skeleton className="h-4 w-6 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function MisReportMasterSkeleton() {
  return (
    <div className="min-h-[280px] space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <Skeleton className="h-4 w-24 rounded" />
          <Skeleton className="h-4 w-40 rounded" />
        </div>
        <Skeleton className="h-10 w-32 rounded-xl" />
      </div>

      <div className="space-y-4">
        {/* Master Table Skeleton */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="bg-gray-50 p-3 border-b border-gray-200">
            <Skeleton className="h-5 w-32 rounded" />
          </div>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-4 gap-3">
              <Skeleton className="h-12 w-full rounded" />
              <Skeleton className="h-12 w-full rounded" />
              <Skeleton className="h-12 w-full rounded" />
              <Skeleton className="h-12 w-full rounded" />
            </div>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-4 py-2 border-t border-gray-100">
                <Skeleton className="h-4 w-36 rounded" />
                <Skeleton className="h-4 w-24 rounded" />
                <Skeleton className="h-4 w-20 rounded" />
                <Skeleton className="h-4 w-16 rounded" />
              </div>
            ))}
          </div>
        </div>

        {/* Parameter Table Skeleton */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="bg-gray-50 p-3 border-b border-gray-200">
            <Skeleton className="h-4 w-28 rounded" />
          </div>
          <div className="p-4 space-y-2.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-4 py-2 border-b border-gray-50 last:border-0">
                <Skeleton className="h-4 w-44 rounded" />
                <Skeleton className="h-4 w-20 rounded" />
                <Skeleton className="h-4 w-12 rounded" />
                <Skeleton className="h-4 w-12 rounded" />
                <Skeleton className="h-4 w-12 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function TasksListSkeleton() {
  return (
    <div className="p-6 space-y-6">
      {/* Header Skeleton */}
      <div className="flex flex-wrap items-start justify-between gap-4 pr-14">
        <div className="space-y-1">
          <Skeleton className="h-7 w-36 rounded" />
          <Skeleton className="h-4 w-52 rounded" />
        </div>
        <Skeleton className="h-10 w-32 rounded-xl" />
      </div>

      {/* KPI Stats Grid Skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-4 space-y-1 border-0 bg-gray-50">
            <Skeleton className="h-7 w-12 rounded" />
            <Skeleton className="h-3.5 w-16 rounded" />
          </div>
        ))}
      </div>

      {/* Search & Tabs Skeleton */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-10 w-72 rounded-xl" />
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-20 rounded-lg" />
          ))}
        </div>
      </div>

      {/* Task List Items Skeleton */}
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <Skeleton className="h-3 w-3 shrink-0 rounded-full" />
              <div className="space-y-1.5 min-w-0 flex-1">
                <Skeleton className="h-4 w-3/4 rounded" />
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-16 rounded" />
                  <Skeleton className="h-4 w-20 rounded" />
                  <Skeleton className="h-4 w-28 rounded" />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <Skeleton className="h-7 w-20 rounded-lg" />
              <Skeleton className="h-8 w-8 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChecklistSkeleton() {
  return (
    <div className="p-6 space-y-6">
      {/* Category Tabs Skeleton */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-2">
          <Skeleton className="h-10 w-24 rounded-xl" />
          <Skeleton className="h-10 w-28 rounded-xl" />
          <Skeleton className="h-10 w-28 rounded-xl" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-36 rounded-xl" />
          <Skeleton className="h-10 w-36 rounded-xl" />
        </div>
      </div>

      {/* Checklist Task Table/Cards Skeleton */}
      <div className="space-y-3">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="card p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <Skeleton className="h-6 w-6 shrink-0 rounded-full" />
              <div className="space-y-1.5 min-w-0 flex-1">
                <Skeleton className="h-4 w-4/5 rounded" />
                <div className="flex items-center gap-2">
                  <Skeleton className="h-3.5 w-20 rounded" />
                  <Skeleton className="h-3.5 w-24 rounded" />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <Skeleton className="h-8 w-24 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AdminDashboardSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <div className="pr-14 space-y-1">
        <Skeleton className="h-7 w-48 rounded" />
        <Skeleton className="h-4 w-64 rounded" />
      </div>

      {/* Top 4 KPI metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-5 space-y-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-20 rounded" />
              <Skeleton className="h-8 w-8 rounded-xl" />
            </div>
            <Skeleton className="h-8 w-16 rounded" />
            <Skeleton className="h-3 w-28 rounded" />
          </div>
        ))}
      </div>

      {/* 2-column content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card p-5 space-y-4">
          <Skeleton className="h-5 w-32 rounded" />
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div className="space-y-1 flex-1">
                  <Skeleton className="h-4 w-2/3 rounded" />
                  <Skeleton className="h-3 w-1/3 rounded" />
                </div>
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5 space-y-4">
          <Skeleton className="h-5 w-28 rounded" />
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="space-y-1 flex-1">
                  <Skeleton className="h-4 w-24 rounded" />
                  <Skeleton className="h-3 w-16 rounded" />
                </div>
                <Skeleton className="h-5 w-10 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function UsersSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 pr-14">
        <div className="space-y-1">
          <Skeleton className="h-7 w-32 rounded" />
          <Skeleton className="h-4 w-48 rounded" />
        </div>
        <Skeleton className="h-10 w-28 rounded-xl" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card p-5 space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="space-y-1.5 flex-1">
                <Skeleton className="h-4 w-28 rounded" />
                <Skeleton className="h-3 w-20 rounded" />
              </div>
              <Skeleton className="h-6 w-14 rounded-full" />
            </div>
            <div className="space-y-1.5 pt-2 border-t border-gray-100">
              <Skeleton className="h-3.5 w-36 rounded" />
              <Skeleton className="h-3.5 w-28 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CalendarSkeleton() {
  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between pr-14">
        <Skeleton className="h-7 w-36 rounded" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <Skeleton className="h-9 w-28 rounded-lg" />
          <Skeleton className="h-9 w-9 rounded-lg" />
        </div>
      </div>

      <div className="card p-4">
        <div className="grid grid-cols-7 gap-2 mb-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-full rounded text-center" />
          ))}
        </div>
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="min-h-[90px] rounded-xl border border-gray-100 p-2 space-y-1.5 bg-gray-50/50">
              <Skeleton className="h-4 w-6 rounded" />
              {i % 3 === 0 && <Skeleton className="h-4 w-full rounded" />}
              {i % 5 === 0 && <Skeleton className="h-4 w-3/4 rounded" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function RevisionsSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <div className="pr-14 space-y-1">
        <Skeleton className="h-7 w-40 rounded" />
        <Skeleton className="h-4 w-60 rounded" />
      </div>

      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="card p-5 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1.5 flex-1">
                <Skeleton className="h-5 w-2/3 rounded" />
                <Skeleton className="h-3.5 w-1/3 rounded" />
              </div>
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
            <div className="flex items-center gap-4 pt-2 border-t border-gray-100">
              <Skeleton className="h-4 w-36 rounded" />
              <Skeleton className="h-4 w-36 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CreateTaskSkeleton() {
  return (
    <div className="max-w-2xl p-6 space-y-6">
      <div className="pr-14 space-y-1">
        <Skeleton className="h-7 w-36 rounded" />
        <Skeleton className="h-4 w-52 rounded" />
      </div>

      <div className="card p-6 space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-28 rounded" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-24 rounded" />
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-24 rounded" />
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-20 rounded" />
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-20 rounded" />
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>
        </div>
        <Skeleton className="h-11 w-full rounded-xl" />
      </div>
    </div>
  );
}
