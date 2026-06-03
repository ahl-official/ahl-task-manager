import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/utils/auth';
import { adminGetTask, serializeTask } from '@/lib/firebase/tasks';
import {
  adminCompleteChecklistTask,
  adminGetChecklistTasksForUser,
  getCategoryLabel,
  isRecurringCategory,
} from '@/lib/firebase/checklist';
import { adminIncrementScore, adminLog } from '@/lib/firebase/scores';
import type { TaskCategory } from '@/types';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category') ?? undefined;
  if (category && !isRecurringCategory(category)) {
    return NextResponse.json({ success: false, error: 'Invalid checklist category' }, { status: 400 });
  }

  const rows = await adminGetChecklistTasksForUser(session.uid, category as TaskCategory | undefined);
  return NextResponse.json({
    success: true,
    data: rows.map(row => ({
      task: serializeTask(row.task),
      periodKey: row.periodKey,
      completed: row.completed,
      label: getCategoryLabel(row.task.category),
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  try {
    const { taskId } = await req.json();
    if (!taskId) throw new Error('Task id is required');

    const task = await adminGetTask(taskId);
    if (!task) return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 });

    const completion = await adminCompleteChecklistTask(task, session.uid);
    await adminIncrementScore(session.uid, 'tasksCompleted');
    await adminIncrementScore(session.uid, 'onTimeCount');
    await adminLog('TASK_DONE', `${getCategoryLabel(task.category)} checklist completed by ${session.name}`, {
      taskId: task.taskId,
      uid: session.uid,
      meta: { periodKey: completion.periodKey, checklistCompletionId: completion.id },
    });

    return NextResponse.json({ success: true, data: completion }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message ?? 'Failed to complete checklist task' }, { status: 400 });
  }
}
