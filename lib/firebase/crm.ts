import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from './admin';
import { cfApi, hasCloudflareApi } from '@/lib/cloudflare/api';
import { timestamp } from '@/lib/cloudflare/timestamp';

const COL = 'crmLeads';

export type CrmStage = 'New' | 'Contacted' | 'Qualified' | 'Proposal' | 'Won' | 'Lost';

export interface CrmLead {
  id: string;
  companyName: string;
  contactName: string;
  phone: string;
  email: string | null;
  source: string;
  stage: CrmStage;
  ownerUid: string;
  ownerName: string;
  notes: string | null;
  nextFollowUp: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CreateCrmLeadInput {
  companyName: string;
  contactName: string;
  phone: string;
  email?: string;
  source: string;
  stage?: CrmStage;
  ownerUid: string;
  ownerName: string;
  notes?: string;
  nextFollowUp?: string;
}

export async function adminCreateCrmLead(input: CreateCrmLeadInput): Promise<CrmLead> {
  if (hasCloudflareApi()) {
    return hydrateCrmLead(await cfApi('/crm', {
      method: 'POST',
      body: JSON.stringify(input),
    }));
  }

  const ref = adminDb.collection(COL).doc();
  const now = Timestamp.now();
  const lead: CrmLead = {
    id: ref.id,
    companyName: input.companyName.trim(),
    contactName: input.contactName.trim(),
    phone: input.phone.replace(/\D/g, ''),
    email: input.email?.trim() || null,
    source: input.source.trim() || 'Manual',
    stage: input.stage ?? 'New',
    ownerUid: input.ownerUid,
    ownerName: input.ownerName,
    notes: input.notes?.trim() || null,
    nextFollowUp: input.nextFollowUp ? Timestamp.fromDate(new Date(input.nextFollowUp)) : null,
    createdAt: now,
    updatedAt: now,
  };

  await ref.set(lead);
  return lead;
}

export async function adminGetCrmLeads(): Promise<CrmLead[]> {
  if (hasCloudflareApi()) {
    const leads = await cfApi<any[]>('/crm');
    return leads.map(hydrateCrmLead);
  }

  const snap = await adminDb.collection(COL).orderBy('updatedAt', 'desc').get();
  return snap.docs.map(d => d.data() as CrmLead);
}

export async function adminUpdateCrmLead(id: string, data: Partial<CrmLead>): Promise<void> {
  await adminDb.collection(COL).doc(id).update({
    ...data,
    updatedAt: Timestamp.now(),
  });
}

function hydrateCrmLead(row: any): CrmLead {
  return {
    ...row,
    nextFollowUp: timestamp(row.nextFollowUp),
    createdAt: timestamp(row.createdAt)! as Timestamp,
    updatedAt: timestamp(row.updatedAt)! as Timestamp,
  };
}

export function serializeCrmLead(lead: CrmLead) {
  return {
    ...lead,
    nextFollowUp: lead.nextFollowUp?.toDate().toISOString() ?? null,
    createdAt: lead.createdAt.toDate().toISOString(),
    updatedAt: lead.updatedAt.toDate().toISOString(),
  };
}
