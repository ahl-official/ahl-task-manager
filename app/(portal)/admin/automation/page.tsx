import AutomationClient from '@/components/admin/AutomationClient';
import { adminGetAutomations, serializeAutomation } from '@/lib/firebase/automations';

export default async function AdminAutomationPage() {
  const rules = await adminGetAutomations();

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Automation</h1>
        <p className="text-sm text-gray-500 mt-0.5">{rules.length} CRM and task workflow rules</p>
      </div>
      <AutomationClient rules={rules.map(serializeAutomation)} />
    </div>
  );
}
