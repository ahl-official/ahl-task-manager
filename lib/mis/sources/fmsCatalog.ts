/**
 * MIS Report Master FMS / workflow step catalog.
 * Labels match Master sheet J/O parameter names.
 * Layout: date | … | status (+2) | … | onTime (+4) | name (+5)
 */

export interface FmsStepDef {
  id: string;
  /** Master sheet parameter label */
  label: string;
  /** Section header shown above this step in Master (e.g. "Help Slip FMS") */
  section: string;
  sheet: string;
  dateCol: number;
  endCol?: number;
  doneStatuses?: string[];
}

function step(
  id: string,
  section: string,
  label: string,
  sheet: string,
  dateCol: number,
  opts?: { endCol?: number; doneStatuses?: string[] },
): FmsStepDef {
  return {
    id,
    section,
    label,
    sheet,
    dateCol,
    endCol: opts?.endCol,
    doneStatuses: opts?.doneStatuses,
  };
}

/** Master-referenced steps (same tabs/columns as MIS Report Master COUNTIFS). */
export const FMS_STEP_CATALOG: FmsStepDef[] = [
  // Alchemane CRM (Web app) — O3–O5
  step('crm-0', 'Alchemane CRM (Web app)', 'step 1', 'Alchemane CRM Web app', 0),
  step('crm-7', 'Alchemane CRM (Web app)', 'step 2', 'Alchemane CRM Web app', 7),
  step('crm-14', 'Alchemane CRM (Web app)', 'step 3', 'Alchemane CRM Web app', 14),

  // Enquiry To Cons — J7, J8, J17
  step('enquiry-0', 'Enquiry To Cons', 'Step1 (E)', 'Enquiry To Consutation Data', 0),
  step('enquiry-7', 'Enquiry To Cons', 'Step2 (E)', 'Enquiry To Consutation Data', 7),
  step('enquiry-21', 'Enquiry To Cons', 'Step 4 (R)', 'Enquiry To Consutation Data', 21),

  // Cons To Order — J19–J24
  step('c2o-0', 'Cons To Order', 'Step 1', 'Cons2Order Data', 0),
  step('c2o-7', 'Cons To Order', 'Step 2', 'Cons2Order Data', 7),
  step('c2o-14', 'Cons To Order', 'Step 3', 'Cons2Order Data', 14),
  step('c2o-21', 'Cons To Order', 'Step 4 (Video)', 'Cons2Order Data', 21),
  step('c2o-28', 'Cons To Order', 'Step 5 (Video)', 'Cons2Order Data', 28),
  step('c2o-35', 'Cons To Order', 'Step 6 (Video)', 'Cons2Order Data', 35),

  // Alchemane O2D — O17–O22
  step('o2d-alc-7', 'Alchemane O2D', 'Step 2', 'Alchemane O2D', 7),
  step('o2d-alc-14', 'Alchemane O2D', 'Step 3', 'Alchemane O2D', 14),
  step('o2d-alc-21', 'Alchemane O2D', 'Step 4', 'Alchemane O2D', 21),
  step('o2d-alc-28', 'Alchemane O2D', 'Step 5', 'Alchemane O2D', 28),
  step('o2d-alc-35', 'Alchemane O2D', 'Step 6', 'Alchemane O2D', 35),
  step('o2d-alc-42', 'Alchemane O2D', 'Step 7', 'Alchemane O2D', 42),

  // Help Slip FMS — O24–O26
  step('help-slip-0', 'Help Slip FMS', 'Step 1', 'Help Slip FMS', 0),
  step('help-slip-7', 'Help Slip FMS', 'Step 2', 'Help Slip FMS', 7),
  step('help-slip-14', 'Help Slip FMS', 'Step 3', 'Help Slip FMS', 14),

  // Hair Refilling — O28–O32
  step('hair-0', 'Hair Reffiling FMS', 'Step 1', 'New Hair Refilling FMS', 0),
  step('hair-7', 'Hair Reffiling FMS', 'Step 2', 'New Hair Refilling FMS', 7),
  step('hair-14', 'Hair Reffiling FMS', 'Step 3', 'New Hair Refilling FMS', 14),
  step('hair-21', 'Hair Reffiling FMS', 'Step 4', 'New Hair Refilling FMS', 21),
  step('hair-28', 'Hair Reffiling FMS', 'Step 5', 'New Hair Refilling FMS', 28),

  // Help Ticket FMS — J34–J39
  step('help-ticket-0', 'Help Ticket FMS', 'Step 1', 'Help Ticket FMS', 0),
  step('help-ticket-7', 'Help Ticket FMS', 'Step 2', 'Help Ticket FMS', 7),
  step('help-ticket-14', 'Help Ticket FMS', 'Step 3', 'Help Ticket FMS', 14),
  step('help-ticket-21', 'Help Ticket FMS', 'Step 4', 'Help Ticket FMS', 21),
  step('help-ticket-28', 'Help Ticket FMS', 'Step 5', 'Help Ticket FMS', 28),
  step('help-ticket-42', 'Help Ticket FMS', 'Step 6', 'Help Ticket FMS', 42),

  // HR FMS — O34–O40
  step('hr-0', 'HR FMS', 'Step 1', 'HR FMS v2.0', 0),
  step('hr-7', 'HR FMS', 'Step 2', 'HR FMS v2.0', 7),
  step('hr-14', 'HR FMS', 'Step 3', 'HR FMS v2.0', 14),
  step('hr-21', 'HR FMS', 'Step 4', 'HR FMS v2.0', 21),
  step('hr-28', 'HR FMS', 'Step 5', 'HR FMS v2.0', 28),
  step('hr-35', 'HR FMS', 'Step 6', 'HR FMS v2.0', 35),
  step('hr-42', 'HR FMS', 'Step 7', 'HR FMS v2.0', 42),

  // New Joining FMS — J41–J45
  step('joining-0', 'New Joining FMS', 'Step 1', 'New Joining FMS', 0),
  step('joining-7', 'New Joining FMS', 'Step 2', 'New Joining FMS', 7),
  step('joining-14', 'New Joining FMS', 'Step 3', 'New Joining FMS', 14),
  step('joining-21', 'New Joining FMS', 'Step 4', 'New Joining FMS', 21),
  step('joining-28', 'New Joining FMS', 'Step 5', 'New Joining FMS', 28),

  // Blog FMS (Alchemane) — O42–O48
  step('blog-alc-0', 'Blog FMS (Alchemane)', 'Step 1', 'Blog FMS (Alchemane)', 0),
  step('blog-alc-7', 'Blog FMS (Alchemane)', 'Step 2', 'Blog FMS (Alchemane)', 7),
  step('blog-alc-14', 'Blog FMS (Alchemane)', 'Step 3', 'Blog FMS (Alchemane)', 14),
  step('blog-alc-21', 'Blog FMS (Alchemane)', 'Step 4', 'Blog FMS (Alchemane)', 21, { doneStatuses: ['Approved'] }),
  step('blog-alc-28', 'Blog FMS (Alchemane)', 'Step 5', 'Blog FMS (Alchemane)', 28),
  step('blog-alc-35', 'Blog FMS (Alchemane)', 'Step 6', 'Blog FMS (Alchemane)', 35),
  step('blog-alc-42', 'Blog FMS (Alchemane)', 'Step 7', 'Blog FMS (Alchemane)', 42),

  // Blog FMS (American) — J47–J53
  step('blog-ame-0', 'Blog FMS (American)', 'Step 1', 'Blog FMS (American)', 0),
  step('blog-ame-7', 'Blog FMS (American)', 'Step 2', 'Blog FMS (American)', 7),
  step('blog-ame-14', 'Blog FMS (American)', 'Step 3', 'Blog FMS (American)', 14),
  step('blog-ame-21', 'Blog FMS (American)', 'Step 4', 'Blog FMS (American)', 21, { doneStatuses: ['Approved'] }),
  step('blog-ame-28', 'Blog FMS (American)', 'Step 5', 'Blog FMS (American)', 28),
  step('blog-ame-35', 'Blog FMS (American)', 'Step 6', 'Blog FMS (American)', 35, { doneStatuses: ['Approved'] }),
  step('blog-ame-42', 'Blog FMS (American)', 'Step 7', 'Blog FMS (American)', 42, { doneStatuses: ['Approved'] }),

  // Order Management Mumbai — O50–O57
  step('o2d-mum-0', 'Order Management Mumbai', 'Step 1', 'O2D Mumbai v2.0', 0, { endCol: 1, doneStatuses: ['Completed'] }),
  step('o2d-mum-7', 'Order Management Mumbai', 'Step 2', 'O2D Mumbai v2.0', 7, { endCol: 8, doneStatuses: ['Completed'] }),
  step('o2d-mum-14', 'Order Management Mumbai', 'Step 3', 'O2D Mumbai v2.0', 14, { endCol: 15, doneStatuses: ['Completed'] }),
  step('o2d-mum-21', 'Order Management Mumbai', 'Step 4', 'O2D Mumbai v2.0', 21, { endCol: 22, doneStatuses: ['Completed'] }),
  step('o2d-mum-28', 'Order Management Mumbai', 'Step 5', 'O2D Mumbai v2.0', 28, { endCol: 29, doneStatuses: ['Completed'] }),
  step('o2d-mum-35', 'Order Management Mumbai', 'Step 6', 'O2D Mumbai v2.0', 35, { endCol: 36, doneStatuses: ['Completed'] }),
  step('o2d-mum-42', 'Order Management Mumbai', 'Step 7', 'O2D Mumbai v2.0', 42, { endCol: 43, doneStatuses: ['Completed'] }),
  step('o2d-mum-49', 'Order Management Mumbai', 'Step 8', 'O2D Mumbai v2.0', 49, { endCol: 50, doneStatuses: ['Completed'] }),

  // Order Management Bangalore — O59+
  step('o2d-blr-0', 'Order Management Bangalore and Delhi', 'Step 1', 'O2D Bangalore v2.0', 0, { endCol: 1, doneStatuses: ['Completed'] }),
  step('o2d-blr-7', 'Order Management Bangalore and Delhi', 'Step 2', 'O2D Bangalore v2.0', 7, { endCol: 8, doneStatuses: ['Completed'] }),
  step('o2d-blr-14', 'Order Management Bangalore and Delhi', 'Step 3', 'O2D Bangalore v2.0', 14, { endCol: 15, doneStatuses: ['Completed'] }),
  step('o2d-blr-21', 'Order Management Bangalore and Delhi', 'Step 4', 'O2D Bangalore v2.0', 21, { endCol: 22, doneStatuses: ['Completed'] }),
  step('o2d-blr-28', 'Order Management Bangalore and Delhi', 'Step 5', 'O2D Bangalore v2.0', 28, { endCol: 29, doneStatuses: ['Completed'] }),
  step('o2d-blr-35', 'Order Management Bangalore and Delhi', 'Step 6', 'O2D Bangalore v2.0', 35, { endCol: 36, doneStatuses: ['Completed'] }),
  step('o2d-blr-42', 'Order Management Bangalore and Delhi', 'Step 7', 'O2D Bangalore v2.0', 42, { endCol: 43, doneStatuses: ['Completed'] }),
  step('o2d-blr-49', 'Order Management Bangalore and Delhi', 'Step 8', 'O2D Bangalore v2.0', 49, { endCol: 50, doneStatuses: ['Completed'] }),
];
