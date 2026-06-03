import CrmClient from '@/components/admin/CrmClient';
import { adminGetCrmLeads, serializeCrmLead } from '@/lib/firebase/crm';
import { adminGetAllUsers } from '@/lib/firebase/users';

export default async function AdminCrmPage() {
  const [leads, users] = await Promise.all([
    adminGetCrmLeads(),
    adminGetAllUsers(),
  ]);

  const activeUsers = users.filter(u => u.isActive).map(u => ({
    uid: u.uid,
    name: u.name,
    department: u.department,
  }));

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">CRM</h1>
        <p className="text-sm text-gray-500 mt-0.5">{leads.length} leads and customer opportunities</p>
      </div>
      <CrmClient leads={leads.map(serializeCrmLead)} users={activeUsers} />
    </div>
  );
}
