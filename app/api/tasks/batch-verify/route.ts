import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/utils/auth';
import { cfApi, hasCloudflareApi } from '@/lib/cloudflare/api';
import { cfTask } from '@/lib/cloudflare/models';
import { adminLog } from '@/lib/firebase/scores';
import { serializeTask } from '@/lib/firebase/tasks';
import { updateTaskInReadCache } from '@/lib/firebase/readCache';
import type { TaskSerialized } from '@/types';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const taskIds: string[] = Array.isArray(body.taskIds) ? body.taskIds.filter(Boolean) : [];

  if (taskIds.length === 0) {
    return NextResponse.json({ success: false, error: 'No task IDs provided' }, { status: 400 });
  }

  if (taskIds.length > 100) {
    return NextResponse.json({ success: false, error: 'Maximum 100 tasks can be verified at once' }, { status: 400 });
  }

  try {
    if (!hasCloudflareApi()) {
      return NextResponse.json({ success: false, error: 'Database API not configured' }, { status: 503 });
    }

    // Call Cloudflare Worker batch verify in 1 atomic request
    const cfRes = await cfApi<{
      verifiedIds: string[];
      count: number;
      tasks: any[];
    }>('/tasks/batch-verify', {
      method: 'POST',
      body: JSON.stringify({
        taskIds,
        actorUid: session.uid,
        actorRole: session.role,
      }),
    });

    const verifiedIds = cfRes?.verifiedIds || [];
    const rawTasks = cfRes?.tasks || [];
    const verifiedTasks: TaskSerialized[] = rawTasks
      .map(cfTask)
      .filter((t): t is NonNullable<typeof t> => t !== null)
      .map(t => {
        updateTaskInReadCache(t.taskId, t);
        return serializeTask(t);
      });

    // Fire-and-forget background logging (do NOT block the HTTP response).
    // Verify is an internal/admin bookkeeping step, not an assignee-facing event — no WhatsApp send here.
    void adminLog('TASK_VERIFIED', `${session.name} verified ${verifiedIds.length} tasks in batch`, {
      uid: session.uid,
      meta: {
        verifiedCount: verifiedIds.length,
        taskIds: verifiedIds,
      },
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      data: {
        verifiedIds,
        count: verifiedIds.length,
        tasks: verifiedTasks,
      },
    });
  } catch (err: any) {
    console.error('Batch verify error:', err);
    return NextResponse.json({ success: false, error: err.message || 'Failed to batch verify tasks' }, { status: 500 });
  }
}
