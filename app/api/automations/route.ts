import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/utils/auth';
import {
  adminCreateAutomation,
  adminGetAutomations,
  adminToggleAutomation,
  serializeAutomation,
} from '@/lib/firebase/automations';

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  const rules = await adminGetAutomations();
  return NextResponse.json({ success: true, data: rules.map(serializeAutomation) });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const rule = await adminCreateAutomation({
      ...body,
      createdBy: session.uid,
      createdByName: session.name,
    });

    return NextResponse.json({ success: true, data: serializeAutomation(rule) }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message ?? 'Failed to create automation' }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { id, isActive } = await req.json();
    await adminToggleAutomation(id, Boolean(isActive));
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message ?? 'Failed to update automation' }, { status: 400 });
  }
}
