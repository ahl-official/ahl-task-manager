import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from './admin';

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
  const snap = await adminDb.collection(COL).orderBy('createdAt', 'desc').get();
  return snap.docs.map(d => d.data() as AutomationRule);
}

export async function adminToggleAutomation(id: string, isActive: boolean): Promise<void> {
  await adminDb.collection(COL).doc(id).update({
    isActive,
    updatedAt: Timestamp.now(),
  });
}

export function serializeAutomation(rule: AutomationRule) {
  return {
    ...rule,
    createdAt: rule.createdAt.toDate().toISOString(),
    updatedAt: rule.updatedAt.toDate().toISOString(),
  };
}
