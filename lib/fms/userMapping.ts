import { normalizePersonName } from '@/lib/utils/names';

/**
 * Mapping table from Google Sheets "Given To" / FMS names to AHL Task Manager user names.
 *
 * Example:
 * 'azar' -> 'Azhar'
 */
export const FMS_USER_MAPPING: Record<string, string> = {
  // Aliases & Name variations
  azar: 'Azhar',
  azhar: 'Azhar',
  rahul: 'Rahul',
  'rahul singh': 'Rahul Singh',
  'rahul s': 'Rahul Singh',
  pooja: 'Pooja',
  gauri: 'Gauri',
  sejal: 'Sejal',
  kunal: 'Kunal',
  sandy: 'Sandy',
  ajay: 'Ajay',
  madhura: 'Madhura',
  rohit: 'Rohit',
  'rohit kulaye': 'Rohit Kulaye',
  palak: 'Palak',
  'palak lilakar': 'Palak Lilakar',
  vighnesh: 'Vighnesh',
  vignesh: 'Vighnesh',
  dishita: 'Dishita',
  shruti: 'Shruti',
  'shruti nage': 'Shruti Nage',
  ebrahim: 'Ebrahim',
  shreyas: 'Shreyas',
  shreyash: 'Shreyas',
  manav: 'Manav',
  ayush: 'Ayush',
  aayush: 'Ayush',
  sneha: 'Sneha',
  ketan: 'Ketan',
  'ketan crm': 'Ketan CRM',
  mohit: 'Mohit',
  shrunali: 'Shrunali',
  mayur: 'Mayur',
  baggy: 'Bhagyashree',
  bhagyashree: 'Bhagyashree',
  bhageshree: 'Bhagyashree',
  satvik: 'Satvik',
  saatvik: 'Satvik',
  satwik: 'Satvik',
  prashant: 'Prashant',
  aditi: 'Aditi',
  ninsi: 'Ninsi',
  sanjana: 'Sanjana',
  amit: 'Amit',
  'amit kumar': 'Amit Kumar',
  rakesh: 'Rakesh',
  zoya: 'Zoya',
  anthony: 'Anthony',
  parth: 'Parth',
  divya: 'Divya',
  jagruti: 'Jagruti',
  roshni: 'Roshni',
  roshani: 'Roshani',
  daizy: 'Daizy',
  daisy: 'Daizy',
  vinitt: 'Vinitt',
  'vinitt sir': 'Vinitt',
  vishal: 'Vishal',
  'vishal sir': 'Vishal',
  sharin: 'Sharin',
  niddhi: 'Niddhi',
  tuba: 'Tuba',
  pratham: 'Pratham',
  aman: 'Aman',
  'aman ai': 'Aman',
  saburi: 'Saburi',
  muskan: 'Muskan',
  'muskan khan': 'Muskan Khan',
  deepali: 'Deepali',
  vikshita: 'Vikshita',
  nagma: 'Nagma',
  suraj: 'Suraj',
  iqra: 'Iqra',
  deepika: 'Deepika',
  meet: 'Meet',
  sanika: 'Sanika',
  susmita: 'Susmita',
  elma: 'Elma',
  priti: 'Priti',
  arantxa: 'Arantxa',
  drishti: 'Drishti',
  janvi: 'Janvi',
  afzal: 'Afzal',
  zibran: 'Zibran',
  shriya: 'Shriya',
  tanmay: 'Tanmay',
  mehjabeen: 'Mehjabeen',
  jaieza: 'Jaieza',
  tejal: 'Tejal',
  hitesh: 'Hitesh',
  priyanka: 'Priyanka',
  hisham: 'Hisham',
  saniya: 'Saniya',
  dhruv: 'Dhruv',
  shreeya: 'Shreeya',
  sarthak: 'Sarthak',
  javed: 'Javed',
  khushi: 'Khushi',
  raja: 'Raja',
  rajkumar: 'Rajkumar',
  umair: 'Umair',
};

/**
 * Given a name from the FMS sheet, returns the mapped system user name.
 */
export function mapFmsNameToSystemUser(fmsName: string): string {
  const trimmed = fmsName.trim();
  const normalized = normalizePersonName(trimmed);
  if (FMS_USER_MAPPING[normalized]) {
    return FMS_USER_MAPPING[normalized];
  }
  return trimmed;
}

/**
 * Checks if an FMS sheet "Given To" / "Who" name matches a system user name.
 * Supports multiple assignees like "Sejal/Zoya" or "Prashant / Anthony".
 */
export function isFmsNameMatchUser(fmsName: string, systemUserName: string): boolean {
  if (!fmsName || !systemUserName) return false;
  
  const trimmedFms = fmsName.trim().toLowerCase();
  if (['unassigned', 'n/a', 'na', 'none', '-', '--', 'tbd', 'pending', 'null', 'undefined'].includes(trimmedFms)) {
    return false;
  }

  const normUser = normalizePersonName(systemUserName);
  if (!normUser) return false;

  // Split on all delimiters including parentheses, slashes, ampersands, and/or
  const parts = fmsName.split(/[\/\\,&+()[\]\n\r]|(?:\band\b)|(?:\bor\b)/i).map(p => p.trim()).filter(Boolean);
  for (const part of parts) {
    const partTrimmed = part.toLowerCase();
    if (['unassigned', 'n/a', 'na', 'none', '-', '--', 'tbd', 'pending', 'null', 'undefined', 'inventory', 'senior', 'team', 'lead'].includes(partTrimmed)) {
      continue;
    }
    const mapped = mapFmsNameToSystemUser(part);
    const normMapped = normalizePersonName(mapped);
    if (normMapped === normUser) return true;

    const rawNorm = normalizePersonName(part);
    if (rawNorm === normUser) return true;

    // Check individual words within each part
    const words = part.split(/\s+/).map(w => w.trim().toLowerCase()).filter(Boolean);
    for (const w of words) {
      if (['inventory', 'senior', 'team', 'lead', 'manager', 'junior'].includes(w)) continue;
      const wMapped = mapFmsNameToSystemUser(w);
      if (normalizePersonName(wMapped) === normUser || normalizePersonName(w) === normUser) {
        return true;
      }
    }
  }

  // Word boundary regex check (e.g. \bsejal\b or \bzoya\b inside "Inventory Senior (Sejal/Zoya)")
  const userRegex = new RegExp(`\\b${normUser}\\b`, 'i');
  if (userRegex.test(trimmedFms)) {
    return true;
  }

  const mappedSystemName = mapFmsNameToSystemUser(fmsName);
  const normMapped = normalizePersonName(mappedSystemName);

  if (normMapped === normUser) return true;

  const rawNormFms = normalizePersonName(fmsName);
  if (rawNormFms === normUser) return true;

  return false;
}
