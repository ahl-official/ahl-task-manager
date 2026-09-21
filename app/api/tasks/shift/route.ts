import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/utils/auth';
import { adminGetTask, generateTaskId, serializeTask } from '@/lib/firebase/tasks';
import { adminGetUserByUid } from '@/lib/firebase/users';
import { adminDb } from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import { sendWhatsApp, msgTaskAssigned } from '@/lib/waha';
import { adminLog } from '@/lib/firebase/scores';
import { cfApi, hasCloudflareApi } from '@/lib/cloudflare/api';
import { cfTask } from '@/lib/cloudflare/models';
import type { Task } from '@/types';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  try {
    const { taskId, targetUid, shiftNote = '' } = await req.json();

    if (!taskId || !targetUid) {
      return NextResponse.json({ success: false, error: 'Task ID and target user are required' }, { status: 400 });
    }

    if (session.role === 'intern') {
      return NextResponse.json({ success: false, error: 'Interns cannot shift tasks' }, { status: 403 });
    }

    const task = await adminGetTask(taskId);
    if (!task) {
      return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 });
    }

    if (task.status === 'Completed' || task.status === 'Verified' || task.status === 'Dead') {
      return NextResponse.json({ success: false, error: 'Completed, verified, or dead tasks cannot be shifted' }, { status: 400 });
    }

    const taskCategory = (task.category || '').toLowerCase();
    if (taskCategory !== 'one time' && taskCategory !== 'delegation' && taskCategory !== 'one-time') {
      return NextResponse.json({ success: false, error: 'Only One Time tasks can be shifted. Recurring tasks cannot be shifted.' }, { status: 400 });
    }

    if (task.isShifted || task.childTaskId || task.status.startsWith('Shifted')) {
      return NextResponse.json({ success: false, error: 'This task has already been shifted (maximum 1 shift allowed)' }, { status: 400 });
    }

    if (session.role !== 'admin' && task.assignedTo !== session.uid) {
      return NextResponse.json({ success: false, error: 'You can only shift tasks assigned to you' }, { status: 403 });
    }

    const targetUser = await adminGetUserByUid(targetUid);
    if (!targetUser || !targetUser.isActive) {
      return NextResponse.json({ success: false, error: 'Target user not found or inactive' }, { status: 400 });
    }

    if (targetUser.uid === task.assignedTo) {
      return NextResponse.json({ success: false, error: 'Cannot shift task to the current assignee' }, { status: 400 });
    }

    // Role check for members
    if (session.role === 'member') {
      const myDept = (session.department || '').trim().toLowerCase();
      const targetDept = (targetUser.department || '').trim().toLowerCase();
      if (myDept !== targetDept) {
        return NextResponse.json({ success: false, error: 'Members can only shift tasks within their own department' }, { status: 403 });
      }
    }

    const childTaskId = await generateTaskId();
    const cleanNote = String(shiftNote).trim();

    const parentNotes = task.notes
      ? `${task.notes}\n\n[Shifted by ${session.name} to ${childTaskId}]: ${cleanNote || 'Task shifted'}`
      : `[Shifted by ${session.name} to ${childTaskId}]: ${cleanNote || 'Task shifted'}`;

    const childNotes = task.notes
      ? `${task.notes}\n\n[Shifted by ${session.name} from ${task.taskId} to ${childTaskId}]: ${cleanNote || 'Task shifted'}`
      : `[Shifted by ${session.name} from ${task.taskId} to ${childTaskId}]: ${cleanNote || 'Task shifted'}`;

    const childStatus = (task.startDate && task.endDate) ? 'In Progress' : 'Pending Accept';

    if (hasCloudflareApi()) {
      const toIso = (val: unknown) => {
        if (!val) return null;
        if (typeof val === 'string') return val;
        if (typeof val === 'object' && val && typeof (val as any).toDate === 'function') {
          return (val as any).toDate().toISOString();
        }
        return String(val);
      };

      const nowIso = new Date().toISOString();

      // 1. Create child task in Cloudflare
      const childTask = cfTask(await cfApi('/tasks', {
        method: 'POST',
        body: JSON.stringify({
          taskId: childTaskId,
          description: task.description,
          assignedTo: targetUser.uid,
          assignedToName: targetUser.name,
          assignedToWa: targetUser.waNumber || '',
          creatorUid: session.uid,
          creatorFallback: { uid: session.uid, name: session.name, waNumber: session.waNumber || '' },
          createdBy: session.uid,
          createdByName: session.name,
          handoffUid: task.handoffUid || session.uid,
          handoffName: task.handoffName || session.name,
          handoffWa: task.handoffWa || '',
          category: task.category || 'One Time',
          priority: task.priority || 'Medium',
          status: childStatus,
          department: targetUser.department || task.department || '',
          startDate: toIso(task.startDate),
          endDate: toIso(task.endDate),
          delayedDate: toIso(task.delayedDate),
          delayReason: task.delayReason || null,
          revisionStatus: 'none',
          notes: childNotes,
          acceptedAt: childStatus === 'In Progress' ? nowIso : null,
          skipAcceptance: childStatus === 'In Progress',
          isShifted: true,
          parentTaskId: task.taskId,
          shiftedByUid: session.uid,
          shiftedByName: session.name,
          shiftedNote: cleanNote || null,
          shiftedAt: nowIso,
        }),
      }))!;

      // 2. Update parent task in Cloudflare
      const updatedParent = cfTask(await cfApi(`/tasks/${encodeURIComponent(task.taskId)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: `Shifted (${childStatus})`,
          notes: parentNotes,
        }),
      }));

      await adminLog('TASK_SHIFTED', `Task ${task.taskId} shifted to ${targetUser.name} (${childTaskId}) by ${session.name}`, {
        taskId: task.taskId,
        uid: session.uid,
        meta: { childTaskId, targetUid: targetUser.uid },
      }).catch(() => {});

      if (targetUser.waNumber) {
        const dueText = task.endDate ? (toIso(task.endDate)?.slice(0, 10) || 'Pending') : 'Pending';
        await sendWhatsApp(
          targetUser.waNumber,
          msgTaskAssigned({
            taskId: childTaskId,
            description: task.description,
            priority: task.priority,
            endDate: dueText,
            createdByName: session.name,
            datesRequired: !task.endDate,
            acceptanceRequired: childStatus === 'Pending Accept',
          }),
          childTaskId,
        ).catch(() => {});
      }

      return NextResponse.json({
        success: true,
        data: {
          parentTask: updatedParent ? serializeTask(updatedParent) : null,
          childTask: serializeTask(childTask),
        },
      });
    }

    const now = Timestamp.now();
    const childTaskData: Task = {
      taskId: childTaskId,
      description: task.description,
      assignedTo: targetUser.uid,
      assignedToName: targetUser.name,
      assignedToWa: targetUser.waNumber || '',
      createdBy: session.uid,
      createdByName: session.name,
      handoffUid: task.handoffUid,
      handoffName: task.handoffName,
      handoffWa: task.handoffWa || '',
      category: task.category,
      priority: task.priority,
      status: childStatus,
      department: targetUser.department || task.department,
      startDate: task.startDate,
      endDate: task.endDate,
      delayedDate: task.delayedDate,
      delayReason: task.delayReason,
      revisionStatus: 'none',
      notes: childNotes,
      acceptedAt: childStatus === 'In Progress' ? now : null,
      completedAt: null,
      verifiedAt: null,
      createdAt: now,
      updatedAt: now,
      isShifted: true,
      parentTaskId: task.taskId,
      shiftedByUid: session.uid,
      shiftedByName: session.name,
      shiftedNote: cleanNote || undefined,
      shiftedAt: now,
    };

    // Save child task and update parent task
    const batch = adminDb.batch();
    const childRef = adminDb.collection('tasks').doc(childTaskId);
    const parentRef = adminDb.collection('tasks').doc(task.taskId);

    batch.set(childRef, childTaskData);
    batch.update(parentRef, {
      status: `Shifted (${childStatus})`,
      childTaskId,
      shiftedToUid: targetUser.uid,
      shiftedToName: targetUser.name,
      shiftedNote: cleanNote || null,
      shiftedAt: now,
      updatedAt: now,
    });

    await batch.commit();

    await adminLog('TASK_SHIFTED', `Task ${task.taskId} shifted to ${targetUser.name} (${childTaskId}) by ${session.name}`, {
      taskId: task.taskId,
      uid: session.uid,
      meta: { childTaskId, targetUid: targetUser.uid },
    });

    // Send WhatsApp notification to target user
    if (targetUser.waNumber) {
      const dueText = task.endDate ? (typeof (task.endDate as any).toDate === 'function' ? (task.endDate as any).toDate().toISOString().slice(0, 10) : String(task.endDate)) : 'Pending';
      await sendWhatsApp(
        targetUser.waNumber,
        msgTaskAssigned({
          taskId: childTaskId,
          description: task.description,
          priority: task.priority,
          endDate: dueText,
          createdByName: session.name,
          datesRequired: !task.endDate,
          acceptanceRequired: childStatus === 'Pending Accept',
        }),
        childTaskId,
      ).catch(() => {});
    }

    const updatedParent = await adminGetTask(task.taskId);
    return NextResponse.json({
      success: true,
      data: {
        parentTask: updatedParent ? serializeTask(updatedParent) : null,
        childTask: serializeTask(childTaskData),
      },
    });
  } catch (err: any) {
    console.error('POST /api/tasks/shift error', err);
    return NextResponse.json({ success: false, error: err.message || 'Failed to shift task' }, { status: 500 });
  }
}
