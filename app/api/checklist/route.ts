import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/utils/auth';
import {
  completeChecklistSheetTask,
  findChecklistSheetUser,
  getChecklistSheetData,
  hasChecklistSheets,
  linkChecklistSheetUser,
  updateChecklistSheetTask,
  type ChecklistSheetCategory,
} from '@/lib/google/sheets';

const CATEGORIES: ChecklistSheetCategory[] = ['Daily', 'Weekly', 'Monthly'];

function isChecklistCategory(value: string | null): value is ChecklistSheetCategory {
  return CATEGORIES.includes(value as ChecklistSheetCategory);
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category') ?? 'Daily';
  if (!isChecklistCategory(category)) {
    return NextResponse.json({ success: false, error: 'Invalid checklist category' }, { status: 400 });
  }
  if (!hasChecklistSheets()) {
    return NextResponse.json({ success: false, error: 'Checklist Google Sheet is not configured' }, { status: 503 });
  }

  const data = await getChecklistSheetData(category);
  const elevated = session.role === 'admin' || session.role === 'leader';
  const sheetUser = elevated ? null : findChecklistSheetUser(data.users, session);
  if (!elevated && !sheetUser) {
    return NextResponse.json({
      success: false,
      error: `No checklist profile is linked to ${session.name}. Ask an admin to verify your name or WhatsApp number in the Users sheet.`,
    }, { status: 404 });
  }
  if (sheetUser && !sheetUser.portalUserId) {
    await linkChecklistSheetUser(sheetUser, session.uid);
  }

  const rows = data.tasks.filter(row => row.active && (elevated || row.userId === sheetUser?.userId));
  return NextResponse.json({
    success: true,
    data: rows.map(row => ({
      id: `${category}:${row.rowNumber}:${row.taskId}:${row.periodKey}`,
      taskId: row.taskId,
      userId: row.userId,
      userName: row.userName,
      department: row.department,
      description: row.task,
      category,
      periodKey: row.periodKey,
      periodStart: row.periodStart || null,
      periodEnd: row.periodEnd || null,
      dueDate: row.dueDate || null,
      completed: row.completed,
      completedAt: row.completedAt || null,
      status: row.completed ? 'Completed' : row.dead ? 'Dead' : 'Pending',
      dead: row.dead,
      deadAt: row.deadAt || null,
      remark: row.remark,
      remarkBy: row.remarkBy,
      label: `${category} Task`,
      canComplete: Boolean(sheetUser && row.userId === sheetUser.userId),
      canManage: elevated || Boolean(sheetUser && row.userId === sheetUser.userId),
    })),
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  try {
    const { taskId, category, periodKey, action = 'complete', remark = '' } = await req.json();
    if (!taskId || !periodKey || !isChecklistCategory(category)) {
      throw new Error('Task id, category, and period are required');
    }
    if (!hasChecklistSheets()) throw new Error('Checklist Google Sheet is not configured');
    if (action === 'complete') {
      const completion = await completeChecklistSheetTask({ taskId, category, periodKey, session });
      return NextResponse.json({ success: true, data: completion }, { status: 201 });
    }
    if (!['dead', 'remark', 'revive'].includes(action)) throw new Error('Invalid checklist action');
    const updated = await updateChecklistSheetTask({ taskId, category, periodKey, action, remark, session });
    return NextResponse.json({ success: true, data: updated });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message ?? 'Failed to complete checklist task' }, { status: 400 });
  }
}
