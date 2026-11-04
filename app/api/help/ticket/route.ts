import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/utils/auth';
import { sendWhatsApp } from '@/lib/waha';

const SUPPORT_ADMIN_PHONE = '919967716945';

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { category, priority, subject, message } = body;

    if (!subject || !message) {
      return NextResponse.json({ error: 'Subject and message are required' }, { status: 400 });
    }

    const userName = session.name || 'Unknown User';
    const userRole = (session.role || 'member').toUpperCase();
    const department = session.department || 'General';

    const waText =
      `*AHL Help Desk Ticket*\n\n` +
      `*From:* ${userName} (${userRole})\n` +
      `*Department:* ${department}\n` +
      `*Category:* ${category || 'General'}\n` +
      `*Priority:* ${priority || 'Medium'}\n` +
      `*Subject:* ${subject}\n\n` +
      `*Details:*\n${message}\n\n` +
      `_Sent from AHL Task Manager Help Desk_`;

    let waResult = null;
    try {
      waResult = await sendWhatsApp(SUPPORT_ADMIN_PHONE, waText, undefined, { bypassDisable: true });
    } catch (err) {
      console.error('[HelpDesk API] WAHA send error:', err);
    }

    return NextResponse.json({
      success: true,
      deliveredToWhatsApp: Boolean(waResult?.ok),
      chatId: waResult?.chatId,
    });
  } catch (error: any) {
    console.error('[HelpDesk API] Ticket submission failed:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to submit help desk ticket' },
      { status: 500 }
    );
  }
}

