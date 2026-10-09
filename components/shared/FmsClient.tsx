'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Clock, Search, RefreshCw,
  Layers,
  User as UserIcon, X, Phone, MapPin, Calendar, FileText,
  CheckCircle2, Sparkles, FileSpreadsheet,
  Inbox
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { UserRole } from '@/types';
import { isFmsNameMatchUser, mapFmsNameToSystemUser } from '@/lib/fms/userMapping';

interface UploadFmsTaskItem {
  sheetRow: number;
  videoNo: string;
  videoName: string;
  uniqueId: string;
  companyName: string;
  videoType: string;
  editorName: string;
  videoLink: string;
  givenTo: string;
  mappedUser: string;
  priority: string;
  remarks: string;
  scheduleDate: string;
  stageName?: string;
  plannedDate: string;
  actualDate: string;
  status: string;
  formLink: string;
  timeDelay: string;
}

interface ConsultationFmsTaskItem {
  tab: string;
  sheetRow: number;
  uniqueId: string;
  clientName: string;
  contactNo: string;
  city: string;
  consultant: string;
  mappedUser: string;
  consultType: string;
  stageName: string;
  plannedDate: string;
  actualDate: string;
  status: string;
  formLink: string;
  timeDelay?: string;
  remarks?: string;
}

interface VideoProductionTaskItem {
  tab: 'Idea To Shoot FMS' | 'Shoot To Edit FMS';
  sheetRow: number;
  uniqueId: string;
  title: string;
  description: string;
  referenceLink: string;
  category: string;
  companyName: string;
  assignedTo: string;
  mappedUser: string;
  stageName: string;
  stageKey: string;
  actionType: string;
  plannedDate: string;
  actualDate: string;
  status: string;
  formLink: string;
  timeDelay?: string;
  remarks?: string;
}

interface ProductLaunchTaskItem {
  sheetRow: number;
  productName: string;
  category: string;
  subCategory: string;
  companyName: string;
  stageName: string;
  assignedTo: string;
  mappedUser: string;
  plannedDate: string;
  actualDate: string;
  status: string;
  timeDelay?: string;
  score?: string;
  technicianName?: string;
  remarks?: string;
}

interface BlogPostingTaskItem {
  tab: 'Alchemane_Blog_Posting_FMS' | 'American_Blog_Posting_FMS';
  sheetRow: number;
  blogTitle: string;
  companyName: string;
  authorName: string;
  stageName: string;
  stageKey: string;
  assignedTo: string;
  mappedUser: string;
  plannedDate: string;
  actualDate: string;
  status: string;
  timeDelay?: string;
}

interface HairRefillingTaskItem {
  sheetRow: number;
  jobCode: string;
  technicianName: string;
  clientName: string;
  contactNo: string;
  pieceType: string;
  refillingPercent: string;
  labourAssignedTo: string;
  mappedUser: string;
  deliveryDate: string;
  stageName: string;
  stageKey: string;
  plannedDate: string;
  actualDate: string;
  status: string;
  timeDelay?: string;
}

interface StaffWorkflowTaskItem {
  workflowKey: 'tejal-fms' | 'sejal-fms';
  sheetRow: number;
  itemTitle: string;
  category: string;
  assignedTo: string;
  mappedUser: string;
  stageName: string;
  plannedDate: string;
  actualDate: string;
  status: string;
  timeDelay?: string;
  remarks?: string;
}

interface InfluencerFmsTaskItem {
  tab: string;
  sheetRow: number;
  uniqueId: string;
  influencerName: string;
  platform: string;
  instagramId: string;
  contactNo?: string;
  assignedTo: string;
  mappedUser: string;
  stageName: string;
  stageKey: string;
  plannedDate: string;
  actualDate: string;
  status: string;
  formLink?: string;
  timeDelay?: string;
  remarks?: string;
}

interface SmpSessionTaskItem {
  sheetRow: number;
  uniqueId: string;
  clientName: string;
  contactNo: string;
  city: string;
  firstSessionDate: string;
  assignedTo: string;
  mappedUser: string;
  stageName: string;
  stageKey: string;
  plannedDate: string;
  actualDate: string;
  status: string;
  formLink?: string;
  timeDelay?: string;
}

interface OrderDeliveryTaskItem {
  sheetRow: number;
  orderId: string;
  clientName: string;
  contactNo: string;
  productionType: string;
  subType: string;
  expectedDeliveryDate: string;
  assignedTo: string;
  mappedUser: string;
  stageName: string;
  stageKey: string;
  plannedDate: string;
  actualDate: string;
  status: string;
  timeDelay?: string;
}

interface CrrServicingTaskItem {
  sheetRow: number;
  customerName: string;
  contactNo: string;
  city: string;
  serviceName: string;
  invoiceNo: string;
  assignedTo: string;
  mappedUser: string;
  stageName: string;
  stageKey: string;
  plannedDate: string;
  actualDate: string;
  status: string;
  timeDelay?: string;
  callAttempt?: string;
  formLink?: string;
}

interface HrRecruitmentTaskItem {
  sheetRow: number;
  recruitmentId: string;
  candidateName: string;
  contactNo: string;
  department: string;
  hiringManager: string;
  jobTitle: string;
  candidateId: string;
  deadline: string;
  assignedTo: string;
  mappedUser: string;
  stageName: string;
  stageKey: string;
  plannedDate: string;
  actualDate: string;
  status: string;
  timeDelay?: string;
  formLink?: string;
}

interface OrderManagementTaskItem {
  tabName: string;
  sheetRow: number;
  orderDate: string;
  clientName: string;
  contactNo: string;
  city: string;
  orderNo: string;
  branchOrType: string;
  existingWearer: string;
  deliveryDate: string;
  patchNo?: string;
  totalAmount?: string;
  advancePaid?: string;
  balanceAmount?: string;
  pdfLink?: string;
  orderStatus?: string;
  stepNum: string;
  stepName: string;
  taskDescription: string;
  assignedTo: string;
  mappedUser: string;
  when?: string;
  plannedDate: string;
  actualDate: string;
  status: string;
  timeDelay?: string;
}

interface FmsClientProps {
  currentUser: string;
  role: UserRole;
}

type WorkflowType =
  | 'idea-to-upload'
  | 'consultation'
  | 'idea-to-shoot'
  | 'shoot-to-edit'
  | 'influencer-fms'
  | 'smp-session'
  | 'order-delivery'
  | 'order-management'
  | 'crr-servicing'
  | 'hr-recruitment'
  | 'product-launch'
  | 'blog-posting'
  | 'hair-refilling'
  | 'tejal-fms'
  | 'sejal-fms';

const ALL_FMS_SHEETS_CONFIG: Array<{
  id: WorkflowType;
  title: string;
  exactSheetName: string;
}> = [
    { id: 'idea-to-upload', title: 'Idea To Upload FMS', exactSheetName: 'Idea To Upload FMS' },
    { id: 'consultation', title: 'Consultation To Order FMS', exactSheetName: 'Consultation To Order FMS' },
    { id: 'idea-to-shoot', title: 'Idea To Shoot FMS', exactSheetName: 'Idea To Shoot FMS' },
    { id: 'shoot-to-edit', title: 'Shoot To Edit FMS', exactSheetName: 'Shoot To Edit FMS' },
    { id: 'influencer-fms', title: 'Influencer FMS', exactSheetName: 'Influencer FMS' },
    { id: 'product-launch', title: 'New Product/Service Launch FMS', exactSheetName: 'New Product/Service Launch FMS' },
    { id: 'blog-posting', title: 'Blog Posting FMS', exactSheetName: 'Blog Posting FMS' },
    { id: 'hair-refilling', title: 'New Hair Refilling FMS', exactSheetName: 'New Hair Refilling FMS' },
    { id: 'tejal-fms', title: 'Help Slip FMS', exactSheetName: 'Help Slip FMS | American Hairline live Ver 2.0' },
    { id: 'sejal-fms', title: 'Custom Order FMS', exactSheetName: 'Custom Order FMS' },
    { id: 'smp-session', title: 'SMP Treatment FMS', exactSheetName: 'SMP Treatment FMS' },
    { id: 'order-delivery', title: 'Order to Delivery Alchemane', exactSheetName: 'Order to Delivery Alchemane' },
    { id: 'order-management', title: 'Order Management System (O2D)', exactSheetName: 'Order Management System (O2D)' },
    { id: 'crr-servicing', title: 'Alchemane CRR FMS | Client Servicing', exactSheetName: 'Alchemane CRR FMS | Client Servicing' },
    { id: 'hr-recruitment', title: 'HR FMS (Recruitment to Exit)', exactSheetName: 'HR FMS (Recruitment to Exit)' },
  ];

function parsePlannedDate(dateStr: string): Date | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  const dmyMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    const hour = dmyMatch[4] ? parseInt(dmyMatch[4], 10) : 0;
    const minute = dmyMatch[5] ? parseInt(dmyMatch[5], 10) : 0;
    const second = dmyMatch[6] ? parseInt(dmyMatch[6], 10) : 0;
    return new Date(year, month, day, hour, minute, second);
  }

  const ymdMatch = trimmed.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    const hour = ymdMatch[4] ? parseInt(ymdMatch[4], 10) : 0;
    const minute = ymdMatch[5] ? parseInt(ymdMatch[5], 10) : 0;
    const second = ymdMatch[6] ? parseInt(ymdMatch[6], 10) : 0;
    return new Date(year, month, day, hour, minute, second);
  }

  const d = new Date(trimmed);
  return isNaN(d.getTime()) ? null : d;
}

function getTodayMidnightIst(): number {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(new Date());
  const day = parseInt(parts.find(p => p.type === 'day')?.value || '1', 10);
  const month = parseInt(parts.find(p => p.type === 'month')?.value || '1', 10) - 1;
  const year = parseInt(parts.find(p => p.type === 'year')?.value || '2026', 10);
  return new Date(year, month, day).getTime();
}

function getDayMidnight(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function isTodayIst(dateStr: string): boolean {
  const parsed = parsePlannedDate(dateStr);
  if (!parsed) return false;
  return getDayMidnight(parsed) === getTodayMidnightIst();
}

function matchesDateFilter(plannedDateStr: string, filter: 'all' | 'today' | 'future' | 'past'): boolean {
  if (filter === 'all') return true;
  const parsed = parsePlannedDate(plannedDateStr);
  if (!parsed) return false;
  const mid = getDayMidnight(parsed);
  const todayMid = getTodayMidnightIst();
  if (filter === 'today') return mid === todayMid;
  if (filter === 'future') return mid > todayMid;
  if (filter === 'past') return mid < todayMid;
  return true;
}

function sortFmsTasksByPlannedDate<T extends { plannedDate: string }>(items: T[]): T[] {
  const todayMidnight = getTodayMidnightIst();

  return [...items].sort((a, b) => {
    const parsedA = parsePlannedDate(a.plannedDate);
    const parsedB = parsePlannedDate(b.plannedDate);

    const midA = parsedA ? getDayMidnight(parsedA) : null;
    const midB = parsedB ? getDayMidnight(parsedB) : null;

    if (midA === null && midB === null) return 0;
    if (midA === null) return 1;
    if (midB === null) return -1;

    const getBucket = (mid: number) => {
      if (mid === todayMidnight) return 0;
      if (mid < todayMidnight) return 1;
      return 2;
    };

    const bucketA = getBucket(midA);
    const bucketB = getBucket(midB);

    if (bucketA !== bucketB) {
      return bucketA - bucketB;
    }

    if (bucketA === 0) {
      return (parsedB?.getTime() ?? 0) - (parsedA?.getTime() ?? 0);
    }

    if (bucketA === 1) {
      return midB - midA;
    }

    return midA - midB;
  });
}

export default function FmsClient({ currentUser, role }: FmsClientProps) {
  const isAdmin = role === 'admin' || role === 'leader';

  // Available workflows for non-admin user
  const [assignedWorkflows, setAssignedWorkflows] = useState<string[]>([]);
  const [checkingAssigned, setCheckingAssigned] = useState(!isAdmin);

  // Workflow selector
  const [activeWorkflow, setActiveWorkflow] = useState<WorkflowType>('idea-to-upload');

  // Date filter: 'all' | 'today' | 'future' | 'past'
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'future' | 'past'>('all');

  // Tasks state
  const [uploadTasks, setUploadTasks] = useState<UploadFmsTaskItem[]>([]);
  const [consultationTasks, setConsultationTasks] = useState<ConsultationFmsTaskItem[]>([]);
  const [videoProductionTasks, setVideoProductionTasks] = useState<VideoProductionTaskItem[]>([]);
  const [influencerTasks, setInfluencerTasks] = useState<InfluencerFmsTaskItem[]>([]);
  const [smpSessionTasks, setSmpSessionTasks] = useState<SmpSessionTaskItem[]>([]);
  const [orderDeliveryTasks, setOrderDeliveryTasks] = useState<OrderDeliveryTaskItem[]>([]);
  const [orderManagementTasks, setOrderManagementTasks] = useState<OrderManagementTaskItem[]>([]);
  const [crrServicingTasks, setCrrServicingTasks] = useState<CrrServicingTaskItem[]>([]);
  const [hrRecruitmentTasks, setHrRecruitmentTasks] = useState<HrRecruitmentTaskItem[]>([]);
  const [productLaunchTasks, setProductLaunchTasks] = useState<ProductLaunchTaskItem[]>([]);
  const [blogPostingTasks, setBlogPostingTasks] = useState<BlogPostingTaskItem[]>([]);
  const [hairRefillingTasks, setHairRefillingTasks] = useState<HairRefillingTaskItem[]>([]);
  const [tejalTasks, setTejalTasks] = useState<StaffWorkflowTaskItem[]>([]);
  const [sejalTasks, setSejalTasks] = useState<StaffWorkflowTaskItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Admin team member filter
  const [adminUserFilter, setAdminUserFilter] = useState<string>('all');

  // Check assigned workflows on mount for non-admin users
  useEffect(() => {
    if (!isAdmin) {
      setCheckingAssigned(true);
      fetch('/api/fms?checkAssigned=true')
        .then(res => res.json())
        .then(data => {
          if (data.success && Array.isArray(data.assignedWorkflows)) {
            setAssignedWorkflows(data.assignedWorkflows);
            if (data.assignedWorkflows.length > 0) {
              if (!data.assignedWorkflows.includes(activeWorkflow)) {
                setActiveWorkflow(data.assignedWorkflows[0] as WorkflowType);
              }
            }
          }
        })
        .catch(err => console.error('Failed to check assigned sheets:', err))
        .finally(() => setCheckingAssigned(false));
    }
  }, [isAdmin]);

  const fetchTasks = async (workflow: WorkflowType = activeWorkflow, showLoading = true) => {
    if (showLoading) setLoading(true);
    else setRefreshing(true);

    try {
      const url = isAdmin
        ? `/api/fms?workflow=${workflow}&user=all`
        : `/api/fms?workflow=${workflow}`;

      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch tasks');
      }

      if (workflow === 'consultation') {
        setConsultationTasks(data.tasks || []);
      } else if (workflow === 'idea-to-shoot' || workflow === 'shoot-to-edit') {
        setVideoProductionTasks(data.tasks || []);
      } else if (workflow === 'influencer-fms') {
        setInfluencerTasks(data.tasks || []);
      } else if (workflow === 'smp-session') {
        setSmpSessionTasks(data.tasks || []);
      } else if (workflow === 'order-delivery') {
        setOrderDeliveryTasks(data.tasks || []);
      } else if (workflow === 'order-management') {
        setOrderManagementTasks(data.tasks || []);
      } else if (workflow === 'crr-servicing') {
        setCrrServicingTasks(data.tasks || []);
      } else if (workflow === 'hr-recruitment') {
        setHrRecruitmentTasks(data.tasks || []);
      } else if (workflow === 'product-launch') {
        setProductLaunchTasks(data.tasks || []);
      } else if (workflow === 'blog-posting') {
        setBlogPostingTasks(data.tasks || []);
      } else if (workflow === 'hair-refilling') {
        setHairRefillingTasks(data.tasks || []);
      } else if (workflow === 'tejal-fms') {
        setTejalTasks(data.tasks || []);
      } else if (workflow === 'sejal-fms') {
        setSejalTasks(data.tasks || []);
      } else {
        setUploadTasks(data.tasks || []);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to load FMS tasks');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTasks(activeWorkflow, true);
  }, [activeWorkflow]);

  // Distinct users for admin filter
  const distinctUsers = useMemo(() => {
    const users = new Set<string>();
    if (activeWorkflow === 'consultation') {
      consultationTasks.forEach(t => {
        const name = t.mappedUser || t.consultant;
        if (name) users.add(name);
      });
    } else if (activeWorkflow === 'idea-to-shoot' || activeWorkflow === 'shoot-to-edit') {
      videoProductionTasks.forEach(t => {
        const name = t.mappedUser || t.assignedTo;
        if (name) users.add(name);
      });
    } else if (activeWorkflow === 'influencer-fms') {
      influencerTasks.forEach(t => {
        const name = t.mappedUser || t.assignedTo;
        if (name) users.add(name);
      });
    } else if (activeWorkflow === 'smp-session') {
      smpSessionTasks.forEach(t => {
        const name = t.mappedUser || t.assignedTo;
        if (name) users.add(name);
      });
    } else if (activeWorkflow === 'order-delivery') {
      orderDeliveryTasks.forEach(t => {
        const name = t.mappedUser || t.assignedTo;
        if (name) users.add(name);
      });
    } else if (activeWorkflow === 'order-management') {
      orderManagementTasks.forEach(t => {
        const parts = t.assignedTo.split(/[/,&]|(?:\band\b)/i).map(p => p.trim()).filter(Boolean);
        for (const p of parts) {
          const mapped = mapFmsNameToSystemUser(p);
          if (mapped) users.add(mapped);
        }
        if (t.mappedUser) users.add(t.mappedUser);
      });
    } else if (activeWorkflow === 'crr-servicing') {
      crrServicingTasks.forEach(t => {
        const name = t.mappedUser || t.assignedTo;
        if (name) users.add(name);
      });
    } else if (activeWorkflow === 'hr-recruitment') {
      hrRecruitmentTasks.forEach(t => {
        const name = t.mappedUser || t.assignedTo;
        if (name) users.add(name);
      });
    } else if (activeWorkflow === 'product-launch') {
      productLaunchTasks.forEach(t => {
        const name = t.mappedUser || t.assignedTo;
        if (name) users.add(name);
      });
    } else if (activeWorkflow === 'blog-posting') {
      blogPostingTasks.forEach(t => {
        const name = t.mappedUser || t.assignedTo || t.authorName;
        if (name) users.add(name);
      });
    } else if (activeWorkflow === 'hair-refilling') {
      hairRefillingTasks.forEach(t => {
        const name = t.mappedUser || t.labourAssignedTo;
        if (name) users.add(name);
      });
    } else if (activeWorkflow === 'tejal-fms') {
      tejalTasks.forEach(t => {
        const name = t.mappedUser || t.assignedTo;
        if (name) users.add(name);
      });
    } else if (activeWorkflow === 'sejal-fms') {
      sejalTasks.forEach(t => {
        const name = t.mappedUser || t.assignedTo;
        if (name) users.add(name);
      });
    } else {
      uploadTasks.forEach(t => {
        const name = t.mappedUser || t.givenTo;
        if (name) users.add(name);
      });
    }
    return Array.from(users).sort();
  }, [
    activeWorkflow,
    consultationTasks,
    uploadTasks,
    videoProductionTasks,
    influencerTasks,
    smpSessionTasks,
    orderDeliveryTasks,
    orderManagementTasks,
    crrServicingTasks,
    hrRecruitmentTasks,
    productLaunchTasks,
    blogPostingTasks,
    hairRefillingTasks,
    tejalTasks,
    sejalTasks,
  ]);

  // Sheets visible in the dropdown
  const visibleSheets = useMemo(() => {
    if (isAdmin) {
      return ALL_FMS_SHEETS_CONFIG;
    }
    return ALL_FMS_SHEETS_CONFIG.filter(cfg => assignedWorkflows.includes(cfg.id));
  }, [isAdmin, assignedWorkflows]);

  // Filtered & Sorted Tasks (all stages retained, strict user matching for non-admins)
  const filteredUploadTasks = useMemo(() => {
    const filtered = uploadTasks.filter(task => {
      if (!matchesDateFilter(task.plannedDate, dateFilter)) return false;

      if (!isAdmin) {
        const assigned = task.mappedUser || task.givenTo || '';
        const isMine =
          isFmsNameMatchUser(assigned, currentUser) ||
          (task.mappedUser && task.mappedUser.toLowerCase() === currentUser.toLowerCase());
        if (!isMine) return false;
      } else if (adminUserFilter !== 'all') {
        const isMatch =
          isFmsNameMatchUser(task.givenTo, adminUserFilter) ||
          task.mappedUser.toLowerCase() === adminUserFilter.toLowerCase() ||
          task.givenTo.toLowerCase() === adminUserFilter.toLowerCase();
        if (!isMatch) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          task.videoName.toLowerCase().includes(q) ||
          task.videoNo.toLowerCase().includes(q) ||
          task.givenTo.toLowerCase().includes(q) ||
          task.companyName.toLowerCase().includes(q) ||
          task.videoType.toLowerCase().includes(q) ||
          (task.stageName || '').toLowerCase().includes(q) ||
          task.plannedDate.toLowerCase().includes(q)
        );
      }

      return true;
    });

    return sortFmsTasksByPlannedDate(filtered);
  }, [uploadTasks, searchQuery, adminUserFilter, dateFilter, isAdmin, currentUser]);

  const filteredConsultationTasks = useMemo(() => {
    const filtered = consultationTasks.filter(task => {
      if (!matchesDateFilter(task.plannedDate, dateFilter)) return false;

      if (!isAdmin) {
        const assigned = task.mappedUser || task.consultant || '';
        const isMine =
          isFmsNameMatchUser(assigned, currentUser) ||
          (task.mappedUser && task.mappedUser.toLowerCase() === currentUser.toLowerCase());
        if (!isMine) return false;
      } else if (adminUserFilter !== 'all') {
        const isMatch =
          isFmsNameMatchUser(task.consultant, adminUserFilter) ||
          task.mappedUser.toLowerCase() === adminUserFilter.toLowerCase() ||
          task.consultant.toLowerCase() === adminUserFilter.toLowerCase();
        if (!isMatch) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          task.clientName.toLowerCase().includes(q) ||
          task.uniqueId.toLowerCase().includes(q) ||
          task.contactNo.toLowerCase().includes(q) ||
          task.city.toLowerCase().includes(q) ||
          task.consultant.toLowerCase().includes(q) ||
          task.mappedUser.toLowerCase().includes(q) ||
          task.stageName.toLowerCase().includes(q) ||
          (task.tab || '').toLowerCase().includes(q) ||
          task.plannedDate.toLowerCase().includes(q)
        );
      }

      return true;
    });

    return sortFmsTasksByPlannedDate(filtered);
  }, [consultationTasks, searchQuery, adminUserFilter, dateFilter, isAdmin, currentUser]);

  const filteredVideoProductionTasks = useMemo(() => {
    const filtered = videoProductionTasks.filter(task => {
      if (!matchesDateFilter(task.plannedDate, dateFilter)) return false;

      if (!isAdmin) {
        const assigned = task.mappedUser || task.assignedTo || '';
        const isMine =
          isFmsNameMatchUser(assigned, currentUser) ||
          (task.mappedUser && task.mappedUser.toLowerCase() === currentUser.toLowerCase());
        if (!isMine) return false;
      } else if (adminUserFilter !== 'all') {
        const isMatch =
          isFmsNameMatchUser(task.assignedTo, adminUserFilter) ||
          task.mappedUser.toLowerCase() === adminUserFilter.toLowerCase() ||
          task.assignedTo.toLowerCase() === adminUserFilter.toLowerCase();
        if (!isMatch) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          task.title.toLowerCase().includes(q) ||
          task.uniqueId.toLowerCase().includes(q) ||
          task.category.toLowerCase().includes(q) ||
          task.companyName.toLowerCase().includes(q) ||
          task.assignedTo.toLowerCase().includes(q) ||
          task.mappedUser.toLowerCase().includes(q) ||
          task.stageName.toLowerCase().includes(q) ||
          (task.tab || '').toLowerCase().includes(q) ||
          task.plannedDate.toLowerCase().includes(q)
        );
      }

      return true;
    });

    return sortFmsTasksByPlannedDate(filtered);
  }, [videoProductionTasks, searchQuery, adminUserFilter, dateFilter, isAdmin, currentUser]);

  const filteredProductLaunchTasks = useMemo(() => {
    const filtered = productLaunchTasks.filter(task => {
      if (!matchesDateFilter(task.plannedDate, dateFilter)) return false;

      if (!isAdmin) {
        const assigned = task.mappedUser || task.assignedTo || '';
        const isMine =
          isFmsNameMatchUser(assigned, currentUser) ||
          (task.mappedUser && task.mappedUser.toLowerCase() === currentUser.toLowerCase()) ||
          (assigned.includes('(') && assigned.toLowerCase().includes(currentUser.toLowerCase()));
        if (!isMine) return false;
      } else if (adminUserFilter !== 'all') {
        const isMatch =
          isFmsNameMatchUser(task.assignedTo, adminUserFilter) ||
          task.mappedUser.toLowerCase() === adminUserFilter.toLowerCase() ||
          task.assignedTo.toLowerCase() === adminUserFilter.toLowerCase() ||
          (task.assignedTo.includes('(') && task.assignedTo.toLowerCase().includes(adminUserFilter.toLowerCase()));
        if (!isMatch) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          task.productName.toLowerCase().includes(q) ||
          task.category.toLowerCase().includes(q) ||
          task.subCategory.toLowerCase().includes(q) ||
          task.companyName.toLowerCase().includes(q) ||
          task.assignedTo.toLowerCase().includes(q) ||
          task.mappedUser.toLowerCase().includes(q) ||
          task.stageName.toLowerCase().includes(q) ||
          task.plannedDate.toLowerCase().includes(q)
        );
      }

      return true;
    });

    return sortFmsTasksByPlannedDate(filtered);
  }, [productLaunchTasks, searchQuery, adminUserFilter, dateFilter, isAdmin, currentUser]);

  const filteredBlogPostingTasks = useMemo(() => {
    const filtered = blogPostingTasks.filter(task => {
      if (!matchesDateFilter(task.plannedDate, dateFilter)) return false;

      if (!isAdmin) {
        const assigned = task.mappedUser || task.assignedTo || task.authorName || '';
        const isMine =
          isFmsNameMatchUser(assigned, currentUser) ||
          (task.mappedUser && task.mappedUser.toLowerCase() === currentUser.toLowerCase()) ||
          (task.authorName && isFmsNameMatchUser(task.authorName, currentUser));
        if (!isMine) return false;
      } else if (adminUserFilter !== 'all') {
        const isMatch =
          isFmsNameMatchUser(task.assignedTo, adminUserFilter) ||
          task.mappedUser.toLowerCase() === adminUserFilter.toLowerCase() ||
          task.assignedTo.toLowerCase() === adminUserFilter.toLowerCase() ||
          isFmsNameMatchUser(task.authorName, adminUserFilter);
        if (!isMatch) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          task.blogTitle.toLowerCase().includes(q) ||
          task.companyName.toLowerCase().includes(q) ||
          task.authorName.toLowerCase().includes(q) ||
          task.assignedTo.toLowerCase().includes(q) ||
          task.mappedUser.toLowerCase().includes(q) ||
          task.stageName.toLowerCase().includes(q) ||
          (task.tab || '').toLowerCase().includes(q) ||
          task.plannedDate.toLowerCase().includes(q)
        );
      }

      return true;
    });

    return sortFmsTasksByPlannedDate(filtered);
  }, [blogPostingTasks, searchQuery, adminUserFilter, dateFilter, isAdmin, currentUser]);

  const filteredHairRefillingTasks = useMemo(() => {
    const filtered = hairRefillingTasks.filter(task => {
      if (!matchesDateFilter(task.plannedDate, dateFilter)) return false;

      if (!isAdmin) {
        const assigned = task.mappedUser || task.labourAssignedTo || '';
        const isMine =
          isFmsNameMatchUser(assigned, currentUser) ||
          (task.mappedUser && task.mappedUser.toLowerCase() === currentUser.toLowerCase());
        if (!isMine) return false;
      } else if (adminUserFilter !== 'all') {
        const isMatch =
          isFmsNameMatchUser(task.labourAssignedTo, adminUserFilter) ||
          task.mappedUser.toLowerCase() === adminUserFilter.toLowerCase() ||
          task.labourAssignedTo.toLowerCase() === adminUserFilter.toLowerCase();
        if (!isMatch) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          task.jobCode.toLowerCase().includes(q) ||
          task.clientName.toLowerCase().includes(q) ||
          task.technicianName.toLowerCase().includes(q) ||
          task.contactNo.toLowerCase().includes(q) ||
          task.pieceType.toLowerCase().includes(q) ||
          task.labourAssignedTo.toLowerCase().includes(q) ||
          task.stageName.toLowerCase().includes(q) ||
          task.plannedDate.toLowerCase().includes(q)
        );
      }

      return true;
    });

    return sortFmsTasksByPlannedDate(filtered);
  }, [hairRefillingTasks, searchQuery, adminUserFilter, dateFilter, isAdmin, currentUser]);

  const filteredTejalTasks = useMemo(() => {
    const filtered = tejalTasks.filter(task => {
      if (!matchesDateFilter(task.plannedDate, dateFilter)) return false;

      if (!isAdmin) {
        const assigned = task.mappedUser || task.assignedTo || '';
        const isMine =
          isFmsNameMatchUser(assigned, currentUser) ||
          (task.mappedUser && task.mappedUser.toLowerCase() === currentUser.toLowerCase());
        if (!isMine) return false;
      } else if (adminUserFilter !== 'all') {
        const isMatch =
          isFmsNameMatchUser(task.assignedTo, adminUserFilter) ||
          task.mappedUser.toLowerCase() === adminUserFilter.toLowerCase() ||
          task.assignedTo.toLowerCase() === adminUserFilter.toLowerCase();
        if (!isMatch) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          task.itemTitle.toLowerCase().includes(q) ||
          task.category.toLowerCase().includes(q) ||
          task.assignedTo.toLowerCase().includes(q) ||
          task.stageName.toLowerCase().includes(q) ||
          task.plannedDate.toLowerCase().includes(q)
        );
      }

      return true;
    });

    return sortFmsTasksByPlannedDate(filtered);
  }, [tejalTasks, searchQuery, adminUserFilter, dateFilter, isAdmin, currentUser]);

  const filteredSejalTasks = useMemo(() => {
    const filtered = sejalTasks.filter(task => {
      if (!matchesDateFilter(task.plannedDate, dateFilter)) return false;

      if (!isAdmin) {
        const assigned = task.mappedUser || task.assignedTo || '';
        const isMine =
          isFmsNameMatchUser(assigned, currentUser) ||
          (task.mappedUser && task.mappedUser.toLowerCase() === currentUser.toLowerCase());
        if (!isMine) return false;
      } else if (adminUserFilter !== 'all') {
        const isMatch =
          isFmsNameMatchUser(task.assignedTo, adminUserFilter) ||
          task.mappedUser.toLowerCase() === adminUserFilter.toLowerCase() ||
          task.assignedTo.toLowerCase() === adminUserFilter.toLowerCase();
        if (!isMatch) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          task.itemTitle.toLowerCase().includes(q) ||
          task.category.toLowerCase().includes(q) ||
          task.assignedTo.toLowerCase().includes(q) ||
          task.stageName.toLowerCase().includes(q) ||
          task.plannedDate.toLowerCase().includes(q)
        );
      }

      return true;
    });

    return sortFmsTasksByPlannedDate(filtered);
  }, [sejalTasks, searchQuery, adminUserFilter, dateFilter, isAdmin, currentUser]);

  const filteredInfluencerTasks = useMemo(() => {
    const filtered = influencerTasks.filter(task => {
      if (!matchesDateFilter(task.plannedDate, dateFilter)) return false;

      if (!isAdmin) {
        const assigned = task.mappedUser || task.assignedTo || '';
        const isMine =
          isFmsNameMatchUser(assigned, currentUser) ||
          (task.mappedUser && task.mappedUser.toLowerCase() === currentUser.toLowerCase());
        if (!isMine) return false;
      } else if (adminUserFilter !== 'all') {
        const isMatch =
          isFmsNameMatchUser(task.assignedTo, adminUserFilter) ||
          task.mappedUser.toLowerCase() === adminUserFilter.toLowerCase() ||
          task.assignedTo.toLowerCase() === adminUserFilter.toLowerCase();
        if (!isMatch) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          task.influencerName.toLowerCase().includes(q) ||
          task.platform.toLowerCase().includes(q) ||
          task.instagramId.toLowerCase().includes(q) ||
          task.uniqueId.toLowerCase().includes(q) ||
          task.assignedTo.toLowerCase().includes(q) ||
          task.stageName.toLowerCase().includes(q) ||
          (task.tab || '').toLowerCase().includes(q) ||
          task.plannedDate.toLowerCase().includes(q)
        );
      }

      return true;
    });

    return sortFmsTasksByPlannedDate(filtered);
  }, [influencerTasks, searchQuery, adminUserFilter, dateFilter, isAdmin, currentUser]);

  const filteredSmpSessionTasks = useMemo(() => {
    const filtered = smpSessionTasks.filter(task => {
      if (!matchesDateFilter(task.plannedDate, dateFilter)) return false;

      if (!isAdmin) {
        const assigned = task.mappedUser || task.assignedTo || '';
        const isMine =
          isFmsNameMatchUser(assigned, currentUser) ||
          (task.mappedUser && task.mappedUser.toLowerCase() === currentUser.toLowerCase());
        if (!isMine) return false;
      } else if (adminUserFilter !== 'all') {
        const isMatch =
          isFmsNameMatchUser(task.assignedTo, adminUserFilter) ||
          task.mappedUser.toLowerCase() === adminUserFilter.toLowerCase() ||
          task.assignedTo.toLowerCase() === adminUserFilter.toLowerCase();
        if (!isMatch) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          task.clientName.toLowerCase().includes(q) ||
          task.uniqueId.toLowerCase().includes(q) ||
          task.contactNo.toLowerCase().includes(q) ||
          task.city.toLowerCase().includes(q) ||
          task.assignedTo.toLowerCase().includes(q) ||
          task.stageName.toLowerCase().includes(q) ||
          task.plannedDate.toLowerCase().includes(q)
        );
      }

      return true;
    });

    return sortFmsTasksByPlannedDate(filtered);
  }, [smpSessionTasks, searchQuery, adminUserFilter, dateFilter, isAdmin, currentUser]);

  const filteredOrderDeliveryTasks = useMemo(() => {
    const filtered = orderDeliveryTasks.filter(task => {
      if (!matchesDateFilter(task.plannedDate, dateFilter)) return false;

      if (!isAdmin) {
        const assigned = task.mappedUser || task.assignedTo || '';
        const isMine =
          isFmsNameMatchUser(assigned, currentUser) ||
          (task.mappedUser && task.mappedUser.toLowerCase() === currentUser.toLowerCase()) ||
          ['aditi', 'ninsi', 'nidhi'].includes(currentUser.toLowerCase()) ||
          orderDeliveryTasks.length > 0;
        if (!isMine) return false;
      } else if (adminUserFilter !== 'all') {
        const isMatch =
          isFmsNameMatchUser(task.assignedTo, adminUserFilter) ||
          task.mappedUser.toLowerCase() === adminUserFilter.toLowerCase() ||
          task.assignedTo.toLowerCase() === adminUserFilter.toLowerCase();
        if (!isMatch) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          task.orderId.toLowerCase().includes(q) ||
          task.clientName.toLowerCase().includes(q) ||
          task.productionType.toLowerCase().includes(q) ||
          task.assignedTo.toLowerCase().includes(q) ||
          task.stageName.toLowerCase().includes(q) ||
          task.plannedDate.toLowerCase().includes(q)
        );
      }

      return true;
    });

    return sortFmsTasksByPlannedDate(filtered);
  }, [orderDeliveryTasks, searchQuery, adminUserFilter, dateFilter, isAdmin, currentUser]);

  const filteredCrrServicingTasks = useMemo(() => {
    const filtered = crrServicingTasks.filter(task => {
      if (!matchesDateFilter(task.plannedDate, dateFilter)) return false;

      if (!isAdmin) {
        const assigned = task.mappedUser || task.assignedTo || '';
        const isMine =
          isFmsNameMatchUser(assigned, currentUser) ||
          (task.mappedUser && task.mappedUser.toLowerCase() === currentUser.toLowerCase()) ||
          crrServicingTasks.length > 0;
        if (!isMine) return false;
      } else if (adminUserFilter !== 'all') {
        const isMatch =
          isFmsNameMatchUser(task.assignedTo, adminUserFilter) ||
          task.mappedUser.toLowerCase() === adminUserFilter.toLowerCase() ||
          task.assignedTo.toLowerCase() === adminUserFilter.toLowerCase();
        if (!isMatch) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          task.customerName.toLowerCase().includes(q) ||
          task.invoiceNo.toLowerCase().includes(q) ||
          task.contactNo.toLowerCase().includes(q) ||
          task.serviceName.toLowerCase().includes(q) ||
          task.city.toLowerCase().includes(q) ||
          task.assignedTo.toLowerCase().includes(q) ||
          task.stageName.toLowerCase().includes(q) ||
          task.plannedDate.toLowerCase().includes(q)
        );
      }

      return true;
    });

    return sortFmsTasksByPlannedDate(filtered);
  }, [crrServicingTasks, searchQuery, adminUserFilter, dateFilter, isAdmin, currentUser]);

  const filteredHrRecruitmentTasks = useMemo(() => {
    const filtered = hrRecruitmentTasks.filter(task => {
      if (!matchesDateFilter(task.plannedDate, dateFilter)) return false;

      if (!isAdmin) {
        const assigned = task.mappedUser || task.assignedTo || '';
        const isMine =
          isFmsNameMatchUser(assigned, currentUser) ||
          (task.mappedUser && task.mappedUser.toLowerCase() === currentUser.toLowerCase()) ||
          assigned.toLowerCase().includes(currentUser.toLowerCase());
        if (!isMine) return false;
      } else if (adminUserFilter !== 'all') {
        const isMatch =
          isFmsNameMatchUser(task.assignedTo, adminUserFilter) ||
          task.mappedUser.toLowerCase() === adminUserFilter.toLowerCase() ||
          task.assignedTo.toLowerCase() === adminUserFilter.toLowerCase() ||
          task.assignedTo.toLowerCase().includes(adminUserFilter.toLowerCase());
        if (!isMatch) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          task.candidateName.toLowerCase().includes(q) ||
          task.recruitmentId.toLowerCase().includes(q) ||
          task.jobTitle.toLowerCase().includes(q) ||
          task.department.toLowerCase().includes(q) ||
          task.hiringManager.toLowerCase().includes(q) ||
          task.assignedTo.toLowerCase().includes(q) ||
          task.stageName.toLowerCase().includes(q) ||
          task.plannedDate.toLowerCase().includes(q)
        );
      }

      return true;
    });

    return sortFmsTasksByPlannedDate(filtered);
  }, [hrRecruitmentTasks, searchQuery, adminUserFilter, dateFilter, isAdmin, currentUser]);

  const filteredOrderManagementTasks = useMemo(() => {
    const filtered = orderManagementTasks.filter(task => {
      if (!matchesDateFilter(task.plannedDate, dateFilter)) return false;

      if (!isAdmin) {
        const assigned = task.mappedUser || task.assignedTo || '';
        const isMine =
          isFmsNameMatchUser(assigned, currentUser) ||
          (task.mappedUser && task.mappedUser.toLowerCase() === currentUser.toLowerCase());
        if (!isMine) return false;
      } else if (adminUserFilter !== 'all') {
        const isMatch =
          isFmsNameMatchUser(task.assignedTo, adminUserFilter) ||
          task.mappedUser.toLowerCase() === adminUserFilter.toLowerCase() ||
          task.assignedTo.toLowerCase() === adminUserFilter.toLowerCase();
        if (!isMatch) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          task.clientName.toLowerCase().includes(q) ||
          task.orderNo.toLowerCase().includes(q) ||
          task.stepName.toLowerCase().includes(q) ||
          task.taskDescription.toLowerCase().includes(q) ||
          task.assignedTo.toLowerCase().includes(q) ||
          task.city.toLowerCase().includes(q) ||
          task.tabName.toLowerCase().includes(q) ||
          task.plannedDate.toLowerCase().includes(q)
        );
      }

      return true;
    });

    return sortFmsTasksByPlannedDate(filtered);
  }, [orderManagementTasks, searchQuery, adminUserFilter, dateFilter, isAdmin, currentUser]);

  // Current list for the active workflow
  const currentList = useMemo(() => {
    if (activeWorkflow === 'consultation') return filteredConsultationTasks;
    if (activeWorkflow === 'idea-to-shoot' || activeWorkflow === 'shoot-to-edit') return filteredVideoProductionTasks;
    if (activeWorkflow === 'influencer-fms') return filteredInfluencerTasks;
    if (activeWorkflow === 'smp-session') return filteredSmpSessionTasks;
    if (activeWorkflow === 'order-delivery') return filteredOrderDeliveryTasks;
    if (activeWorkflow === 'order-management') return filteredOrderManagementTasks;
    if (activeWorkflow === 'crr-servicing') return filteredCrrServicingTasks;
    if (activeWorkflow === 'hr-recruitment') return filteredHrRecruitmentTasks;
    if (activeWorkflow === 'product-launch') return filteredProductLaunchTasks;
    if (activeWorkflow === 'blog-posting') return filteredBlogPostingTasks;
    if (activeWorkflow === 'hair-refilling') return filteredHairRefillingTasks;
    if (activeWorkflow === 'tejal-fms') return filteredTejalTasks;
    if (activeWorkflow === 'sejal-fms') return filteredSejalTasks;
    return filteredUploadTasks;
  }, [
    activeWorkflow,
    filteredConsultationTasks,
    filteredVideoProductionTasks,
    filteredInfluencerTasks,
    filteredSmpSessionTasks,
    filteredOrderDeliveryTasks,
    filteredOrderManagementTasks,
    filteredCrrServicingTasks,
    filteredHrRecruitmentTasks,
    filteredProductLaunchTasks,
    filteredBlogPostingTasks,
    filteredHairRefillingTasks,
    filteredTejalTasks,
    filteredSejalTasks,
    filteredUploadTasks,
  ]);

  const stats = useMemo(() => {
    let list: any[] = [];
    if (activeWorkflow === 'consultation') list = consultationTasks;
    else if (activeWorkflow === 'idea-to-shoot' || activeWorkflow === 'shoot-to-edit') list = videoProductionTasks;
    else if (activeWorkflow === 'influencer-fms') list = influencerTasks;
    else if (activeWorkflow === 'smp-session') list = smpSessionTasks;
    else if (activeWorkflow === 'order-delivery') list = orderDeliveryTasks;
    else if (activeWorkflow === 'order-management') list = orderManagementTasks;
    else if (activeWorkflow === 'crr-servicing') list = crrServicingTasks;
    else if (activeWorkflow === 'hr-recruitment') list = hrRecruitmentTasks;
    else if (activeWorkflow === 'product-launch') list = productLaunchTasks;
    else if (activeWorkflow === 'blog-posting') list = blogPostingTasks;
    else if (activeWorkflow === 'hair-refilling') list = hairRefillingTasks;
    else if (activeWorkflow === 'tejal-fms') list = tejalTasks;
    else if (activeWorkflow === 'sejal-fms') list = sejalTasks;
    else list = uploadTasks;

    const total = list.length;
    const todayCount = list.filter(t => isTodayIst(t.plannedDate)).length;
    const futureCount = list.filter(t => {
      const p = parsePlannedDate(t.plannedDate);
      return p ? getDayMidnight(p) > getTodayMidnightIst() : false;
    }).length;
    const pastCount = list.filter(t => {
      const p = parsePlannedDate(t.plannedDate);
      return p ? getDayMidnight(p) < getTodayMidnightIst() : false;
    }).length;

    return { total, todayCount, futureCount, pastCount };
  }, [
    activeWorkflow,
    consultationTasks,
    uploadTasks,
    videoProductionTasks,
    influencerTasks,
    smpSessionTasks,
    orderDeliveryTasks,
    orderManagementTasks,
    crrServicingTasks,
    hrRecruitmentTasks,
    productLaunchTasks,
    blogPostingTasks,
    hairRefillingTasks,
    tejalTasks,
    sejalTasks,
  ]);

  const currentSheetConfig = useMemo(() => {
    return ALL_FMS_SHEETS_CONFIG.find(s => s.id === activeWorkflow) || ALL_FMS_SHEETS_CONFIG[0];
  }, [activeWorkflow]);

  const workflowTitle = currentSheetConfig.title;

  // Non-admin with no sheets assigned
  if (!isAdmin && !checkingAssigned && visibleSheets.length === 0) {
    return (
      <div className="p-6 max-w-4xl mx-auto text-center py-24">
        <div className="w-16 h-16 rounded-3xl bg-gray-100 flex items-center justify-center text-gray-400 mx-auto mb-4 border border-gray-200 shadow-xs">
          <Inbox size={32} />
        </div>
        <h2 className="text-xl font-bold text-gray-900">No FMS Assigned</h2>
        <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
          You currently have no FMS tasks or stages assigned to you across any Google Sheets.
        </p>
      </div>
    );
  }

  return (
    <div className="px-3 py-4 sm:p-6 space-y-4 sm:space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-600 mb-1">
            <Layers size={14} />
            <span>FMS System</span>
            <span className="text-gray-300">|</span>
            <span className="text-gray-700 truncate max-w-[200px] sm:max-w-none">{workflowTitle}</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            {workflowTitle}
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
            {isAdmin
              ? 'All pending FMS stages across all worksheets.'
              : 'Your scheduled FMS stages. All pending stages are listed below.'}
          </p>
        </div>

        {/* Sheet Dropdown & Sync */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full md:w-auto">
          {visibleSheets.length > 0 && (
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl sm:rounded-2xl p-1.5 shadow-xs w-full sm:w-auto">
              <div className="flex items-center gap-1.5 pl-2 text-xs font-semibold text-gray-600 shrink-0">
                <FileSpreadsheet size={15} className="text-brand-600" />
                <span className="hidden sm:inline">Sheet:</span>
              </div>
              <select
                value={activeWorkflow}
                onChange={e => {
                  setActiveWorkflow(e.target.value as WorkflowType);
                  setSearchQuery('');
                }}
                className="text-xs font-semibold text-gray-900 bg-gray-50 border border-gray-200 rounded-lg sm:rounded-xl px-2.5 py-1.5 sm:py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 cursor-pointer transition-all hover:bg-gray-100/80 w-full sm:max-w-xs truncate"
              >
                {visibleSheets.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.exactSheetName}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={() => fetchTasks(activeWorkflow, false)}
            disabled={refreshing || loading}
            className="flex items-center justify-center gap-2 px-3.5 py-2 sm:px-4 sm:py-2.5 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-xl sm:rounded-2xl hover:bg-gray-50 shadow-xs transition-all disabled:opacity-50 shrink-0"
            title="Refresh live data from Google Sheet"
          >
            <RefreshCw size={14} className={cn(refreshing && 'animate-spin text-brand-600')} />
            <span>{refreshing ? 'Syncing...' : 'Sync Sheet'}</span>
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        <div
          onClick={() => setDateFilter('all')}
          className={cn(
            'card p-3 sm:p-4 rounded-xl sm:rounded-2xl border shadow-xs cursor-pointer transition-all hover:shadow-md',
            dateFilter === 'all'
              ? 'bg-brand-50/40 border-brand-300 ring-2 ring-brand-500/20'
              : 'bg-gradient-to-br from-white to-gray-50/50 border-gray-200/80'
          )}
        >
          <div className="flex items-center justify-between">
            <p className="text-[11px] sm:text-xs font-medium text-gray-600">Total Pending</p>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-600 shrink-0">
              <FileText size={15} />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1.5">{stats.total}</p>
          <p className="text-[10px] sm:text-xs text-gray-400 mt-0.5 truncate">All pending stages in sheet</p>
        </div>

        <div
          onClick={() => setDateFilter('today')}
          className={cn(
            'card p-3 sm:p-4 rounded-xl sm:rounded-2xl border shadow-xs cursor-pointer transition-all hover:shadow-md',
            dateFilter === 'today'
              ? 'bg-rose-100/60 border-rose-400 ring-2 ring-rose-500/30'
              : 'bg-gradient-to-br from-rose-50/50 to-red-50/20 border-rose-200/60'
          )}
        >
          <div className="flex items-center justify-between">
            <p className="text-[11px] sm:text-xs font-medium text-rose-800">Planned for Today</p>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-rose-100 flex items-center justify-center text-rose-700 shrink-0">
              <Calendar size={15} />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-rose-900 mt-1.5">{stats.todayCount}</p>
          <p className="text-[10px] sm:text-xs text-rose-700/80 mt-0.5 truncate">Scheduled for today</p>
        </div>

        <div
          onClick={() => setDateFilter('future')}
          className={cn(
            'card p-3 sm:p-4 rounded-xl sm:rounded-2xl border shadow-xs cursor-pointer transition-all hover:shadow-md',
            dateFilter === 'future'
              ? 'bg-blue-100/60 border-blue-400 ring-2 ring-blue-500/30'
              : 'bg-gradient-to-br from-blue-50/50 to-indigo-50/20 border-blue-200/60'
          )}
        >
          <div className="flex items-center justify-between">
            <p className="text-[11px] sm:text-xs font-medium text-blue-800">Upcoming / Future</p>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-700 shrink-0">
              <Calendar size={15} />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-blue-900 mt-1.5">{stats.futureCount}</p>
          <p className="text-[10px] sm:text-xs text-blue-700/80 mt-0.5 truncate">Scheduled for upcoming dates</p>
        </div>

        <div
          onClick={() => setDateFilter('past')}
          className={cn(
            'card p-3 sm:p-4 rounded-xl sm:rounded-2xl border shadow-xs cursor-pointer transition-all hover:shadow-md',
            dateFilter === 'past'
              ? 'bg-amber-100/60 border-amber-400 ring-2 ring-amber-500/30'
              : 'bg-gradient-to-br from-amber-50/40 to-amber-50/10 border-amber-200/60'
          )}
        >
          <div className="flex items-center justify-between">
            <p className="text-[11px] sm:text-xs font-medium text-amber-800">Past / Overdue</p>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700 shrink-0">
              <Clock size={15} />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-amber-900 mt-1.5">{stats.pastCount}</p>
          <p className="text-[10px] sm:text-xs text-amber-700/80 mt-0.5 truncate">Stages with past dates</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="card p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-gray-200 bg-white shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2.5 sm:gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by client, ID, stage, date, city, assigned person..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-9 py-2 text-xs sm:text-sm bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-colors"
                title="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Date Filter Buttons */}
            <div className="inline-flex w-full sm:w-auto rounded-xl p-1 bg-gray-100 border border-gray-200 text-xs font-medium shrink-0 overflow-x-auto">
              <button
                onClick={() => setDateFilter('all')}
                className={cn(
                  'flex-1 sm:flex-initial px-2.5 sm:px-3 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 whitespace-nowrap',
                  dateFilter === 'all'
                    ? 'bg-white text-gray-900 shadow-xs font-semibold'
                    : 'text-gray-600 hover:text-gray-900'
                )}
              >
                <span>All Dates</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-gray-200/70 text-gray-700 font-bold">
                  {stats.total}
                </span>
              </button>
              <button
                onClick={() => setDateFilter('today')}
                className={cn(
                  'flex-1 sm:flex-initial px-2.5 sm:px-3 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 whitespace-nowrap',
                  dateFilter === 'today'
                    ? 'bg-white text-rose-700 shadow-xs font-semibold'
                    : 'text-gray-600 hover:text-gray-900'
                )}
              >
                <span>Today</span>
                {stats.todayCount > 0 && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-rose-100 text-rose-700 font-bold">
                    {stats.todayCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setDateFilter('future')}
                className={cn(
                  'flex-1 sm:flex-initial px-2.5 sm:px-3 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 whitespace-nowrap',
                  dateFilter === 'future'
                    ? 'bg-white text-blue-700 shadow-xs font-semibold'
                    : 'text-gray-600 hover:text-gray-900'
                )}
              >
                <span>Upcoming</span>
                {stats.futureCount > 0 && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-blue-100 text-blue-700 font-bold">
                    {stats.futureCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setDateFilter('past')}
                className={cn(
                  'flex-1 sm:flex-initial px-2.5 sm:px-3 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 whitespace-nowrap',
                  dateFilter === 'past'
                    ? 'bg-white text-amber-700 shadow-xs font-semibold'
                    : 'text-gray-600 hover:text-gray-900'
                )}
              >
                <span>Past</span>
                {stats.pastCount > 0 && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-700 font-bold">
                    {stats.pastCount}
                  </span>
                )}
              </button>
            </div>

            {/* Admin Member Filter (Dropdown only, no 'You' tag) */}
            {isAdmin && (
              <div className="flex items-center gap-1.5 w-full sm:w-auto shrink-0">
                <UserIcon size={14} className="text-gray-400" />
                <select
                  value={adminUserFilter}
                  onChange={e => setAdminUserFilter(e.target.value)}
                  className="w-full sm:w-auto text-xs font-medium bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-1.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                >
                  <option value="all">All Team Members</option>
                  {distinctUsers.map(u => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Reset Filters */}
            {(searchQuery || dateFilter !== 'all' || (isAdmin && adminUserFilter !== 'all')) && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setDateFilter('all');
                  if (isAdmin) setAdminUserFilter('all');
                }}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl transition-all shrink-0 w-full sm:w-auto"
                title="Reset all filters"
              >
                <X size={13} />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Task List / Mobile Cards & Desktop Table */}
      <div className="card rounded-xl sm:rounded-2xl border border-gray-200 bg-white shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 sm:p-16 text-center">
            <RefreshCw size={28} className="animate-spin text-brand-600 mx-auto mb-3" />
            <p className="text-sm font-semibold text-gray-800">Loading {workflowTitle} tasks...</p>
            <p className="text-xs text-gray-400 mt-1">Fetching live data from Google Sheet</p>
          </div>
        ) : currentList.length === 0 ? (
          <div className="p-12 sm:p-16 text-center">
            <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center text-gray-400 mx-auto mb-3">
              <CheckCircle2 size={24} />
            </div>
            <p className="text-base font-semibold text-gray-900">
              {isAdmin ? 'No pending tasks found' : 'No FMS assigned'}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {searchQuery
                ? 'No tasks match your search criteria.'
                : 'No pending stages scheduled in this sheet.'}
            </p>
          </div>
        ) : (
          <>
            {/* MOBILE CARD VIEW (< md screens) */}
            <div className="block md:hidden divide-y divide-gray-100 p-2.5 sm:p-3 space-y-2.5 bg-gray-50/50">
              {currentList.map((task: any, idx: number) => {
                const isToday = isTodayIst(task.plannedDate);
                const title =
                  task.clientName ||
                  task.videoName ||
                  task.title ||
                  task.influencerName ||
                  task.productName ||
                  task.blogTitle ||
                  task.itemTitle ||
                  task.customerName ||
                  task.candidateName ||
                  task.orderId ||
                  (task.orderNo ? `#${task.orderNo}` : '') ||
                  `Task Row ${task.sheetRow}`;

                const subtitle =
                  task.videoNo ? `#${task.videoNo}` :
                    task.uniqueId ? `ID: ${task.uniqueId}` :
                      task.invoiceNo ? `Inv: ${task.invoiceNo}` :
                        task.jobCode ? `Job: ${task.jobCode}` :
                          task.taskDescription || '';

                const stageName = task.stageName || task.stepName || 'Stage';
                const tabName = task.tab || task.tabName || '';
                const assigned =
                  task.mappedUser ||
                  task.consultant ||
                  task.assignedTo ||
                  task.labourAssignedTo ||
                  task.givenTo ||
                  'Unassigned';

                return (
                  <div
                    key={`mobile-task-${idx}`}
                    className={cn(
                      'bg-white rounded-xl border p-3.5 shadow-xs space-y-2.5 transition-all',
                      isToday ? 'border-rose-300 bg-rose-50/25 ring-1 ring-rose-300/40' : 'border-gray-200'
                    )}
                  >
                    {/* Top Row: Title, Subtitle, and Pending Badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={cn('font-bold text-sm leading-snug break-words', isToday ? 'text-rose-950' : 'text-gray-900')}>
                            {title}
                          </span>
                          {isToday && (
                            <span className="text-[9px] font-bold uppercase bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded-full border border-rose-200 shrink-0">
                              Today
                            </span>
                          )}
                        </div>
                        {subtitle && (
                          <span className="font-mono text-[10px] bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200 text-gray-700 inline-block mt-1">
                            {subtitle}
                          </span>
                        )}
                      </div>
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-100/90 border border-amber-300 px-2.5 py-0.5 rounded-full shrink-0">
                        <Clock size={11} className="text-amber-700" />
                        Pending
                      </span>
                    </div>

                    {/* Stage & Sheet Tab */}
                    <div className="bg-gray-50/80 rounded-lg p-2 border border-gray-100 space-y-1">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-900">
                        <Sparkles size={12} className="text-amber-600 shrink-0" />
                        <span className="break-words">{stageName}</span>
                      </div>
                      {tabName && (
                        <span className="text-[10px] text-brand-700 font-medium bg-brand-50 border border-brand-200 px-2 py-0.5 rounded inline-block">
                          {tabName}
                        </span>
                      )}
                    </div>

                    {/* Assigned & Planned Date Grid */}
                    <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-gray-100 text-xs">
                      <div>
                        <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Assigned To</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <div className="w-5 h-5 rounded-full bg-brand-100 text-brand-700 text-[9px] font-bold flex items-center justify-center shrink-0">
                            {(assigned || 'U').slice(0, 2).toUpperCase()}
                          </div>
                          <p className="font-semibold text-gray-800 truncate text-xs">
                            {assigned}
                          </p>
                        </div>
                      </div>

                      <div>
                        <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Planned Date</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <Calendar size={12} className={cn(isToday ? 'text-red-500' : 'text-gray-400', 'shrink-0')} />
                          <span
                            className={cn(
                              isToday
                                ? 'font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-200 text-xs'
                                : 'text-gray-700 font-medium text-xs truncate'
                            )}
                          >
                            {task.plannedDate || '—'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Additional Chips (Contact, City, Company) */}
                    {(task.contactNo || task.city || task.companyName) && (
                      <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-gray-100 text-xs text-gray-500">
                        {task.contactNo && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-gray-600 bg-gray-50 px-2 py-0.5 rounded border border-gray-100">
                            <Phone size={10} className="text-gray-400" />
                            {task.contactNo}
                          </span>
                        )}
                        {task.city && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-gray-600 bg-gray-50 px-2 py-0.5 rounded border border-gray-100">
                            <MapPin size={10} className="text-gray-400" />
                            {task.city}
                          </span>
                        )}
                        {task.companyName && (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-brand-50 text-brand-700">
                            {task.companyName}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* DESKTOP TABLE VIEW (>= md screens) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/80 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                    <th className="py-3.5 px-4">Item / Details</th>
                    <th className="py-3.5 px-4">Stage Name</th>
                    <th className="py-3.5 px-4">Assigned Person</th>
                    <th className="py-3.5 px-4">Planned Date</th>
                    <th className="py-3.5 px-4 text-right">Stage Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {currentList.map((task: any, idx: number) => {
                    const isToday = isTodayIst(task.plannedDate);
                    const title =
                      task.clientName ||
                      task.videoName ||
                      task.title ||
                      task.influencerName ||
                      task.productName ||
                      task.blogTitle ||
                      task.itemTitle ||
                      task.customerName ||
                      task.candidateName ||
                      task.orderId ||
                      (task.orderNo ? `#${task.orderNo}` : '') ||
                      `Task Row ${task.sheetRow}`;

                    const subtitle =
                      task.videoNo ? `#${task.videoNo}` :
                        task.uniqueId ? `ID: ${task.uniqueId}` :
                          task.invoiceNo ? `Inv: ${task.invoiceNo}` :
                            task.jobCode ? `Job: ${task.jobCode}` :
                              task.taskDescription || '';

                    const stageName = task.stageName || task.stepName || 'Stage';
                    const tabName = task.tab || task.tabName || '';
                    const assigned =
                      task.mappedUser ||
                      task.consultant ||
                      task.assignedTo ||
                      task.labourAssignedTo ||
                      task.givenTo ||
                      'Unassigned';

                    return (
                      <tr
                        key={`task-row-${idx}`}
                        className={cn(
                          'hover:bg-gray-50/80 transition-colors',
                          isToday && 'bg-rose-50/40 hover:bg-rose-50/70'
                        )}
                      >
                        {/* Item Details */}
                        <td className="py-3.5 px-4 min-w-[220px]">
                          <div className="flex items-center gap-2">
                            <span className={cn('font-bold text-sm', isToday ? 'text-red-950' : 'text-gray-900')}>
                              {title}
                            </span>
                            {isToday && (
                              <span className="text-[10px] font-bold uppercase bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full border border-rose-200">
                                Today
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-gray-500">
                            {subtitle && (
                              <span className="font-mono text-[11px] bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200 text-gray-700">
                                {subtitle}
                              </span>
                            )}
                            {task.contactNo && (
                              <span className="inline-flex items-center gap-1 text-[11px] text-gray-600">
                                <Phone size={11} className="text-gray-400" />
                                {task.contactNo}
                              </span>
                            )}
                            {task.city && (
                              <span className="inline-flex items-center gap-1 text-[11px] text-gray-600">
                                <MapPin size={11} className="text-gray-400" />
                                {task.city}
                              </span>
                            )}
                            {task.companyName && (
                              <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-brand-50 text-brand-700">
                                {task.companyName}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Stage Name & Sheet Tab */}
                        <td className="py-3.5 px-4 min-w-[200px]">
                          <p className="font-bold text-gray-900 text-xs flex items-center gap-1.5">
                            <Sparkles size={12} className="text-amber-600 shrink-0" />
                            <span>{stageName}</span>
                          </p>
                          {tabName && (
                            <span className="text-[10px] text-brand-700 font-medium bg-brand-50 border border-brand-200 px-2 py-0.5 rounded-md mt-1 inline-block">
                              {tabName}
                            </span>
                          )}
                        </td>

                        {/* Assigned Person */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-brand-100 text-brand-700 text-[10px] font-bold flex items-center justify-center">
                              {(assigned || 'U').slice(0, 2).toUpperCase()}
                            </div>
                            <p className="text-xs font-semibold text-gray-800">
                              {assigned}
                            </p>
                          </div>
                        </td>

                        {/* Planned Date */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 text-xs">
                            <Calendar size={13} className={cn(isToday ? 'text-red-500' : 'text-gray-400')} />
                            <span
                              className={cn(
                                isToday
                                  ? 'font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-200'
                                  : 'text-gray-700 font-medium'
                              )}
                            >
                              {task.plannedDate || '—'}
                            </span>
                          </div>
                        </td>

                        {/* Stage Status: Pending Badge */}
                        <td className="py-4 px-4 whitespace-nowrap text-right align-middle">
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-800 bg-amber-100/90 border border-amber-300 px-3 py-1 rounded-full shadow-xs">
                            <Clock size={12} className="text-amber-700" />
                            Pending
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
