import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from './admin';
import { cfApi, hasCloudflareApi } from '@/lib/cloudflare/api';
import { timestamp } from '@/lib/cloudflare/timestamp';

const COL = 'automations';

export type AutomationTrigger = 'Lead Created' | 'Follow-up Due' | 'Task Overdue' | 'Task Completed';
export type AutomationAction = 'Send WhatsApp' | 'Create Task' | 'Notify Admin';

export interface AutomationRule {
  id: string;
  name: string;
  trigger: AutomationTrigger;
  action: AutomationAction;
  target: string;
  messageTemplate: string;
  isActive: boolean;
  createdBy: string;
  createdByName: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CreateAutomationInput {
  name: string;
  trigger: AutomationTrigger;
  action: AutomationAction;
  target: string;
  messageTemplate: string;
  isActive?: boolean;
  createdBy: string;
  createdByName: string;
}

export async function adminCreateAutomation(input: CreateAutomationInput): Promise<AutomationRule> {
  if (hasCloudflareApi()) {
    return hydrateAutomation(await cfApi('/automations', {
      method: 'POST',
      body: JSON.stringify(input),
    }));
  }

  const ref = adminDb.collection(COL).doc();
  const now = Timestamp.now();
  const rule: AutomationRule = {
    id: ref.id,
    name: input.name.trim(),
    trigger: input.trigger,
    action: input.action,
    target: input.target.trim(),
    messageTemplate: input.messageTemplate.trim(),
    isActive: input.isActive ?? true,
    createdBy: input.createdBy,
    createdByName: input.createdByName,
    createdAt: now,
    updatedAt: now,
  };

  await ref.set(rule);
  return rule;
}

export async function adminGetAutomations(): Promise<AutomationRule[]> {
  if (hasCloudflareApi()) {
    const rules = await cfApi<any[]>('/automations');
    return rules.map(hydrateAutomation);
  }

  const snap = await adminDb.collection(COL).orderBy('createdAt', 'desc').get();
  return snap.docs.map(d => d.data() as AutomationRule);
}

export async function adminToggleAutomation(id: string, isActive: boolean): Promise<void> {
  if (hasCloudflareApi()) {
    await cfApi('/automations', {
      method: 'PATCH',
      body: JSON.stringify({ id, isActive }),
    });
    return;
  }

  await adminDb.collection(COL).doc(id).update({
    isActive,
    updatedAt: Timestamp.now(),
  });
}

function hydrateAutomation(row: any): AutomationRule {
  return {
    ...row,
    createdAt: timestamp(row.createdAt)! as Timestamp,
    updatedAt: timestamp(row.updatedAt)! as Timestamp,
  };
}

export function serializeAutomation(rule: AutomationRule) {
  return {
    ...rule,
    createdAt: rule.createdAt.toDate().toISOString(),
    updatedAt: rule.updatedAt.toDate().toISOString(),
  };
}
