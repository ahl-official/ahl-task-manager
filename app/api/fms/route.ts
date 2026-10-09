import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/utils/auth';
import { getUploadFmsTasks } from '@/lib/fms/uploadFms';
import { getConsultationFmsTasks } from '@/lib/fms/consultationFms';
import { getVideoProductionFmsTasks } from '@/lib/fms/videoProductionFms';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const userParam = searchParams.get('user');
    const workflow = searchParams.get('workflow') || 'idea-to-upload';

    const isAdmin = session.role === 'admin' || session.role === 'leader';
    let targetUserName: string | undefined = session.name;

    if (searchParams.get('checkAssigned') === 'true') {
      const targetUser = session.name;
      const [
        upload,
        consultation,
        ideaToShoot,
        shootToEdit,
        influencer,
        productLaunch,
        blogPosting,
        hairRefilling,
        tejal,
        sejal,
        smp,
        orderDelivery,
        orderManagement,
        crr,
        hr,
      ] = await Promise.allSettled([
        getUploadFmsTasks({ targetUserName: targetUser, role: session.role }),
        getConsultationFmsTasks({ targetUserName: targetUser, role: session.role }),
        getVideoProductionFmsTasks('Idea To Shoot FMS', { targetUserName: targetUser, role: session.role }),
        getVideoProductionFmsTasks('Shoot To Edit FMS', { targetUserName: targetUser, role: session.role }),
        (await import('@/lib/fms/influencerFms')).getInfluencerFmsTasks({ targetUserName: targetUser, role: session.role }),
        (await import('@/lib/fms/productLaunchFms')).getProductLaunchFmsTasks({ targetUserName: targetUser, role: session.role }),
        (await import('@/lib/fms/blogPostingFms')).getBlogPostingFmsTasks('all', { targetUserName: targetUser, role: session.role }),
        (await import('@/lib/fms/hairRefillingFms')).getHairRefillingFmsTasks({ targetUserName: targetUser, role: session.role }),
        (await import('@/lib/fms/staffWorkflowFms')).getStaffWorkflowFmsTasks('tejal-fms', { targetUserName: targetUser, role: session.role }),
        (await import('@/lib/fms/staffWorkflowFms')).getStaffWorkflowFmsTasks('sejal-fms', { targetUserName: targetUser, role: session.role }),
        (await import('@/lib/fms/smpSessionFms')).getSmpSessionFmsTasks({ targetUserName: targetUser, role: session.role }),
        (await import('@/lib/fms/orderDeliveryFms')).getOrderDeliveryFmsTasks({ targetUserName: targetUser, role: session.role }),
        (await import('@/lib/fms/orderManagementFms')).fetchOrderManagementTasks(targetUser),
        (await import('@/lib/fms/crrServicingFms')).getCrrServicingFmsTasks({ targetUserName: targetUser, role: session.role }),
        (await import('@/lib/fms/hrRecruitmentFms')).getHrRecruitmentFmsTasks({ targetUserName: targetUser, role: session.role }),
      ]);

      const counts: Record<string, number> = {
        'idea-to-upload': upload.status === 'fulfilled' ? upload.value.length : 0,
        'consultation': consultation.status === 'fulfilled' ? consultation.value.length : 0,
        'idea-to-shoot': ideaToShoot.status === 'fulfilled' ? ideaToShoot.value.length : 0,
        'shoot-to-edit': shootToEdit.status === 'fulfilled' ? shootToEdit.value.length : 0,
        'influencer-fms': influencer.status === 'fulfilled' ? influencer.value.length : 0,
        'product-launch': productLaunch.status === 'fulfilled' ? productLaunch.value.length : 0,
        'blog-posting': blogPosting.status === 'fulfilled' ? blogPosting.value.length : 0,
        'hair-refilling': hairRefilling.status === 'fulfilled' ? hairRefilling.value.length : 0,
        'tejal-fms': tejal.status === 'fulfilled' ? tejal.value.length : 0,
        'sejal-fms': sejal.status === 'fulfilled' ? sejal.value.length : 0,
        'smp-session': smp.status === 'fulfilled' ? smp.value.length : 0,
        'order-delivery': orderDelivery.status === 'fulfilled' ? orderDelivery.value.length : 0,
        'order-management': orderManagement.status === 'fulfilled' ? orderManagement.value.length : 0,
        'crr-servicing': crr.status === 'fulfilled' ? crr.value.length : 0,
        'hr-recruitment': hr.status === 'fulfilled' ? hr.value.length : 0,
      };

      const assignedWorkflows = Object.keys(counts).filter(k => counts[k] > 0);

      return NextResponse.json({
        success: true,
        counts,
        assignedWorkflows,
        totalAssigned: Object.values(counts).reduce((a, b) => a + b, 0),
      });
    }

    if (isAdmin) {
      if (userParam === 'all') {
        targetUserName = undefined; // Return all tasks
      } else if (userParam === 'mine') {
        targetUserName = session.name;
      } else if (userParam) {
        targetUserName = userParam;
      } else {
        targetUserName = undefined; // Default for admin view is all tasks
      }
    }

    if (workflow === 'consultation') {
      const tasks = await getConsultationFmsTasks({
        targetUserName,
        role: session.role,
      });

      return NextResponse.json({
        success: true,
        workflow: 'consultation',
        tasks,
        currentUser: session.name,
        role: session.role,
      });
    }

    if (workflow === 'idea-to-shoot') {
      const tasks = await getVideoProductionFmsTasks('Idea To Shoot FMS', {
        targetUserName,
        role: session.role,
      });

      return NextResponse.json({
        success: true,
        workflow: 'idea-to-shoot',
        tasks,
        currentUser: session.name,
        role: session.role,
      });
    }

    if (workflow === 'shoot-to-edit') {
      const tasks = await getVideoProductionFmsTasks('Shoot To Edit FMS', {
        targetUserName,
        role: session.role,
      });

      return NextResponse.json({
        success: true,
        workflow: 'shoot-to-edit',
        tasks,
        currentUser: session.name,
        role: session.role,
      });
    }

    if (workflow === 'product-launch') {
      const { getProductLaunchFmsTasks } = await import('@/lib/fms/productLaunchFms');
      const tasks = await getProductLaunchFmsTasks({
        targetUserName,
        role: session.role,
      });

      return NextResponse.json({
        success: true,
        workflow: 'product-launch',
        tasks,
        currentUser: session.name,
        role: session.role,
      });
    }

    if (workflow === 'hair-refilling') {
      const { getHairRefillingFmsTasks } = await import('@/lib/fms/hairRefillingFms');
      const { adminGetAllUsers } = await import('@/lib/firebase/users');
      let registeredUserNames: string[] = [];
      try {
        const dbUsers = await adminGetAllUsers();
        registeredUserNames = dbUsers.map(u => u.name);
      } catch (e) {
        console.warn('Could not fetch DB users for hair refilling validation:', e);
      }

      const tasks = await getHairRefillingFmsTasks({
        targetUserName,
        role: session.role,
        registeredUserNames,
      });

      return NextResponse.json({
        success: true,
        workflow: 'hair-refilling',
        tasks,
        currentUser: session.name,
        role: session.role,
      });
    }

    if (workflow === 'tejal-fms' || workflow === 'sejal-fms') {
      const { getStaffWorkflowFmsTasks } = await import('@/lib/fms/staffWorkflowFms');
      const tasks = await getStaffWorkflowFmsTasks(workflow, {
        targetUserName,
        role: session.role,
      });

      return NextResponse.json({
        success: true,
        workflow,
        tasks,
        currentUser: session.name,
        role: session.role,
      });
    }

    if (workflow === 'influencer-fms') {
      const { getInfluencerFmsTasks } = await import('@/lib/fms/influencerFms');
      const tasks = await getInfluencerFmsTasks({
        targetUserName,
        role: session.role,
      });

      return NextResponse.json({
        success: true,
        workflow: 'influencer-fms',
        tasks,
        currentUser: session.name,
        role: session.role,
      });
    }

    if (workflow === 'smp-session') {
      const { getSmpSessionFmsTasks } = await import('@/lib/fms/smpSessionFms');
      const tasks = await getSmpSessionFmsTasks({
        targetUserName,
        role: session.role,
      });

      return NextResponse.json({
        success: true,
        workflow: 'smp-session',
        tasks,
        currentUser: session.name,
        role: session.role,
      });
    }

    if (workflow === 'order-delivery') {
      const { getOrderDeliveryFmsTasks } = await import('@/lib/fms/orderDeliveryFms');
      const tasks = await getOrderDeliveryFmsTasks({
        targetUserName,
        role: session.role,
      });

      return NextResponse.json({
        success: true,
        workflow: 'order-delivery',
        tasks,
        currentUser: session.name,
        role: session.role,
      });
    }

    if (workflow === 'crr-servicing') {
      const { getCrrServicingFmsTasks } = await import('@/lib/fms/crrServicingFms');
      const tasks = await getCrrServicingFmsTasks({
        targetUserName,
        role: session.role,
      });

      return NextResponse.json({
        success: true,
        workflow: 'crr-servicing',
        tasks,
        currentUser: session.name,
        role: session.role,
      });
    }

    if (workflow === 'hr-recruitment') {
      const { getHrRecruitmentFmsTasks } = await import('@/lib/fms/hrRecruitmentFms');
      const tasks = await getHrRecruitmentFmsTasks({
        targetUserName,
        role: session.role,
      });

      return NextResponse.json({
        success: true,
        workflow: 'hr-recruitment',
        tasks,
        currentUser: session.name,
        role: session.role,
      });
    }

    if (workflow === 'order-management') {
      const { fetchOrderManagementTasks } = await import('@/lib/fms/orderManagementFms');
      const tasks = await fetchOrderManagementTasks(targetUserName);

      return NextResponse.json({
        success: true,
        workflow: 'order-management',
        tasks,
        currentUser: session.name,
        role: session.role,
      });
    }

    if (workflow === 'blog-posting') {
      const { getBlogPostingFmsTasks } = await import('@/lib/fms/blogPostingFms');
      const tasks = await getBlogPostingFmsTasks('all', {
        targetUserName,
        role: session.role,
      });

      return NextResponse.json({
        success: true,
        workflow: 'blog-posting',
        tasks,
        currentUser: session.name,
        role: session.role,
      });
    }

    // Default 'idea-to-upload'
    const tasks = await getUploadFmsTasks({
      targetUserName,
      role: session.role,
    });

    return NextResponse.json({
      success: true,
      workflow: 'idea-to-upload',
      tasks,
      currentUser: session.name,
      role: session.role,
    });
  } catch (error: any) {
    console.error('Error fetching FMS tasks:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch FMS tasks' },
      { status: 500 },
    );
  }
}
