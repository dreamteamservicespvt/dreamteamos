export interface Festival {
  name: string;
  date: string; // ISO YYYY-MM-DD
  cat: string;
  note?: string;
}

// Extracted from official 2026 calendar
export const FESTIVALS: Festival[] = [
  { date: "2026-01-13", name: "Lohri", cat: "Regional", note: "Punjab harvest festival" },
  { date: "2026-01-14", name: "Makar Sankranti", cat: "Hindu", note: "Sun enters Capricorn" },
  { date: "2026-01-14", name: "Pongal", cat: "Regional", note: "Tamil Nadu harvest festival" },
  { date: "2026-01-14", name: "Uttarayan / Kite Festival", cat: "Regional", note: "Gujarat" },
  { date: "2026-01-23", name: "Basant Panchami / Saraswati Puja", cat: "Hindu" },
  { date: "2026-01-23", name: "Subhas Chandra Bose Jayanti", cat: "National" },
  { date: "2026-01-26", name: "Republic Day", cat: "National", note: "National holiday" },
  { date: "2026-02-14", name: "Valentine's Day", cat: "Regional" },
  { date: "2026-02-15", name: "Maha Shivaratri", cat: "Hindu", note: "Night of Lord Shiva" },
  { date: "2026-02-19", name: "Chhatrapati Shivaji Maharaj Jayanti", cat: "National" },
  { date: "2026-03-03", name: "Holika Dahan", cat: "Hindu" },
  { date: "2026-03-04", name: "Holi", cat: "Hindu", note: "Festival of Colors" },
  { date: "2026-03-08", name: "International Women's Day", cat: "National" },
  { date: "2026-03-19", name: "Gudi Padwa", cat: "Regional", note: "Maharashtrian New Year" },
  { date: "2026-03-19", name: "Ugadi", cat: "Regional", note: "Telugu & Kannada New Year" },
  { date: "2026-03-20", name: "Eid ul-Fitr", cat: "Islamic", note: "Tentative – moon sighting" },
  { date: "2026-03-26", name: "Ram Navami", cat: "Hindu", note: "Birth of Lord Ram" },
  { date: "2026-03-31", name: "Mahavir Jayanti", cat: "Jain", note: "Birth of Mahavira" },
  { date: "2026-04-01", name: "Hanuman Jayanti", cat: "Hindu", note: "Chaitra Purnima" },
  { date: "2026-04-03", name: "Good Friday", cat: "Christian", note: "National holiday" },
  { date: "2026-04-05", name: "Easter Sunday", cat: "Christian" },
  { date: "2026-04-14", name: "Baisakhi / Vaisakhi", cat: "Sikh", note: "Punjabi New Year" },
  { date: "2026-04-14", name: "Dr. Ambedkar Jayanti", cat: "National" },
  { date: "2026-04-14", name: "Vishu", cat: "Regional", note: "Kerala New Year" },
  { date: "2026-04-15", name: "Bihu", cat: "Regional", note: "Assam New Year" },
  { date: "2026-04-19", name: "Akshaya Tritiya", cat: "Hindu", note: "Most auspicious day" },
  { date: "2026-05-01", name: "Buddha Purnima", cat: "Buddhist", note: "Birth of Gautama Buddha" },
  { date: "2026-05-09", name: "Maharana Pratap Jayanti", cat: "National" },
  { date: "2026-05-11", name: "Mother's Day", cat: "Regional", note: "2nd Sunday of May" },
  { date: "2026-05-27", name: "Eid ul-Adha (Bakrid)", cat: "Islamic", note: "Tentative – moon sighting" },
  { date: "2026-06-21", name: "International Yoga Day", cat: "National" },
  { date: "2026-06-26", name: "Muharram / Ashura", cat: "Islamic", note: "Islamic New Year" },
  { date: "2026-06-29", name: "Kabirdas Jayanti", cat: "Hindu" },
  { date: "2026-07-16", name: "Jagannath Rath Yatra", cat: "Hindu", note: "Puri, Odisha" },
  { date: "2026-07-26", name: "Kargil Vijay Diwas", cat: "National" },
  { date: "2026-07-29", name: "Guru Purnima", cat: "Hindu", note: "Honour to teachers & gurus" },
  { date: "2026-08-02", name: "Friendship Day", cat: "Regional", note: "1st Sunday of August" },
  { date: "2026-08-15", name: "Independence Day", cat: "National", note: "National holiday" },
  { date: "2026-08-16", name: "Parsi New Year (Navroz)", cat: "Regional" },
  { date: "2026-08-26", name: "Onam", cat: "Regional", note: "Kerala harvest festival" },
  { date: "2026-08-26", name: "Milad-un-Nabi", cat: "Islamic", note: "Prophet's birthday" },
  { date: "2026-08-28", name: "Raksha Bandhan", cat: "Hindu", note: "Sibling bond festival" },
  { date: "2026-09-04", name: "Krishna Janmashtami", cat: "Hindu", note: "Birth of Lord Krishna" },
  { date: "2026-09-14", name: "Ganesh Chaturthi", cat: "Hindu", note: "10-day festival begins" },
  { date: "2026-09-23", name: "Ganesh Visarjan", cat: "Hindu", note: "Immersion ceremony" },
  { date: "2026-10-02", name: "Gandhi Jayanti", cat: "National", note: "National holiday" },
  { date: "2026-10-11", name: "Sharad Navratri begins", cat: "Hindu", note: "9 nights of Durga" },
  { date: "2026-10-19", name: "Durga Ashtami / Maha Ashtami", cat: "Hindu" },
  { date: "2026-10-20", name: "Dussehra / Vijayadashami", cat: "Hindu", note: "Victory of good over evil" },
  { date: "2026-10-26", name: "Valmiki Jayanti", cat: "Hindu" },
  { date: "2026-10-29", name: "Karva Chauth", cat: "Hindu" },
  { date: "2026-11-05", name: "Guru Nanak Jayanti", cat: "Sikh" },
  { date: "2026-11-06", name: "Dhanteras", cat: "Hindu", note: "Diwali begins" },
  { date: "2026-11-08", name: "Diwali / Lakshmi Puja", cat: "Hindu", note: "Festival of Lights" },
  { date: "2026-11-09", name: "Govardhan Puja", cat: "Hindu" },
  { date: "2026-11-11", name: "Bhai Dooj", cat: "Hindu" },
  { date: "2026-11-14", name: "Children's Day / Nehru Jayanti", cat: "National" },
  { date: "2026-11-15", name: "Chhath Puja", cat: "Hindu", note: "Sun God worship" },
  { date: "2026-11-29", name: "Karthigai Deepam", cat: "Regional", note: "Tamil festival of lights" },
  { date: "2026-12-01", name: "Hornbill Festival", cat: "Regional", note: "Nagaland tribal heritage" },
  { date: "2026-12-24", name: "Christmas Eve", cat: "Christian" },
  { date: "2026-12-25", name: "Christmas", cat: "Christian", note: "National holiday" },
  { date: "2026-12-31", name: "New Year's Eve", cat: "Regional" },
];

/** Returns the day-of-week abbreviation: Mon, Tue … Sun */
function dayAbbr(date: Date): string {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getDay()];
}

/** Returns the month abbreviation: Jan, Feb … Dec */
function monthAbbr(date: Date): string {
  return ["Jan","Feb","Mar","Apr","May","Jun",
          "Jul","Aug","Sep","Oct","Nov","Dec"][date.getMonth()];
}

/** Formats an ISO date string as "Apr 6 (Mon)" */
export function formatFestivalDate(isoDate: string): string {
  const d = new Date(isoDate + "T00:00:00");
  return `${monthAbbr(d)} ${d.getDate()} (${dayAbbr(d)})`;
}

/** Label shown in the dropdown option: "Ugadi — Apr 6 (Mon)" */
export function getFestivalOptionLabel(festival: Festival): string {
  return `${festival.name}  —  ${formatFestivalDate(festival.date)}`;
}

/**
 * Returns the name of the nearest upcoming festival (date >= today).
 * Falls back to the last festival in the list if all are past.
 */
export function getUpcomingFestivalName(): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = FESTIVALS.find((f) => new Date(f.date + "T00:00:00") >= today);
  return upcoming ? upcoming.name : FESTIVALS[FESTIVALS.length - 1].name;
}

/** Finds a Festival by name (case-insensitive). Returns undefined if not found. */
export function findFestival(name: string): Festival | undefined {
  return FESTIVALS.find((f) => f.name.toLowerCase() === name.toLowerCase());
}
