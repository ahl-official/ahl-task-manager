import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/utils/auth';
import { adminCreateCrmLead, adminGetCrmLeads, serializeCrmLead } from '@/lib/firebase/crm';
import { adminGetUserByUid } from '@/lib/firebase/users';

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  const leads = await adminGetCrmLeads();
  return NextResponse.json({ success: true, data: leads.map(serializeCrmLead) });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const owner = await adminGetUserByUid(body.ownerUid);
    if (!owner) throw new Error('Selected owner was not found');

    const lead = await adminCreateCrmLead({
      ...body,
      ownerUid: owner.uid,
      ownerName: owner.name,
    });

    return NextResponse.json({ success: true, data: serializeCrmLead(lead) }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message ?? 'Failed to create lead' }, { status: 400 });
  }
}
