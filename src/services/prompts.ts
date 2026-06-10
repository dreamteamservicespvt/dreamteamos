import { AdType } from '@/types/aiPlatform';

const escapeKeywordForRegex = (keyword: string): string => (
  keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
);

const hasKeyword = (info: string, keyword: string): boolean => (
  new RegExp(`(^|[^a-z0-9])${escapeKeywordForRegex(keyword)}([^a-z0-9]|$)`).test(info)
);

const hasAnyKeyword = (info: string, keywords: string[]): boolean => (
  keywords.some((keyword) => hasKeyword(info, keyword))
);

// Business type detection for environment and color matching
export const detectBusinessType = (businessInfo: string): string => {
  const info = businessInfo.toLowerCase();
  // Education institutions take priority: an institution word means it is education even if other industry
  // words also appear (e.g. "College of Hotel Management" must be education, not a hotel/food business).
  if (hasAnyKeyword(info, ['college', 'university', 'institute', 'institution', 'academy', 'vidyalaya', 'gurukul', 'polytechnic'])) return 'education';
  if (hasAnyKeyword(info, ['medical', 'hospital', 'clinic', 'doctor', 'physician', 'health'])) return 'medical';
  if (hasAnyKeyword(info, ['real estate', 'realty', 'property', 'builders', 'construction'])) return 'realestate';
  if (hasAnyKeyword(info, ['fashion', 'boutique', 'saree', 'clothing', 'couture', 'garment'])) return 'fashion';
  if (hasAnyKeyword(info, ['food', 'restaurant', 'catering', 'caterer', 'hotel'])) return 'food';
  if (hasAnyKeyword(info, ['education', 'school', 'college', 'study', 'study abroad', 'abroad', 'consultant', 'consultancy', 'counselor', 'counsellor', 'counseling', 'counselling', 'university', 'institute', 'admission', 'admissions', 'visa'])) return 'education';
  if (hasAnyKeyword(info, ['tech', 'software', 'app', 'digital', 'it'])) return 'tech';
  if (hasAnyKeyword(info, ['solar', 'energy', 'power', 'renewable'])) return 'solar';
  if (hasAnyKeyword(info, ['laundry', 'wash', 'dry clean', 'fabric care'])) return 'laundry';
  if (hasAnyKeyword(info, ['mattress', 'sleep', 'furniture', 'bed'])) return 'mattress';
  if (hasAnyKeyword(info, ['electrical', 'plumbing', 'hardware', 'ac', 'air conditioner', 'appliance'])) return 'electrical';
  if (hasAnyKeyword(info, ['tea', 'coffee', 'beverage'])) return 'tea';
  if (hasAnyKeyword(info, ['jewel', 'gold', 'diamond'])) return 'jewellery';
  if (hasAnyKeyword(info, ['security', 'guard', 'manpower', 'detective', 'surveillance', 'patrol'])) return 'security';
  if (hasAnyKeyword(info, ['automobile', 'car', 'bike', 'vehicle', 'motor', 'auto'])) return 'automobile';
  if (hasAnyKeyword(info, ['pharma', 'medicine', 'drug', 'chemist'])) return 'pharma';
  if (hasAnyKeyword(info, ['transport', 'logistics', 'courier', 'cargo', 'shipping'])) return 'transport';
  if (hasAnyKeyword(info, ['gym', 'fitness', 'yoga', 'sport'])) return 'fitness';
  if (hasAnyKeyword(info, ['beauty', 'salon', 'spa', 'parlour', 'parlor', 'cosmetic'])) return 'beauty';
  return 'default';
};

// Get saree color based on business type
export const getSareeColorForBusiness = (businessType: string): string => {
  const colors: Record<string, string> = {
    medical: 'elegant neutral-beige or soft ivory base with subtle blue and warm accents symbolizing cleanliness and trust',
    realestate: 'deep royal blue or rich emerald green with subtle gold accents reflecting trust, stability, and prosperity',
    fashion: 'rich royal purple or deep wine with subtle gold accents, luxury couture aesthetic',
    food: 'warm festive colors — rich maroon, deep orange or golden yellow with traditional border',
    tech: 'modern sophisticated tones — deep navy blue or charcoal grey with subtle silver accents',
    education: 'sophisticated academic tones — deep blue or forest green with subtle gold accents',
    solar: 'powerful corporate-energy palette — deep green, solar-blue, and subtle gold accents symbolizing clean energy and trust',
    laundry: 'elegant neutral-beige or soft ivory base with subtle blue and warm orange accents symbolizing cleanliness, water, and freshness',
    mattress: 'soft comfortable tones — cream, soft blue or lavender with subtle accents',
    electrical: 'professional service tones — deep blue or steel grey with subtle accents',
    tea: 'rich leaf-green with warm golden accents inspired by tea-brand tones',
    jewellery: 'rich royal maroon or deep purple with gold accents',
    security: 'commanding deep navy blue or dark charcoal with bold metallic gold accents symbolizing authority, protection, and trust',
    automobile: 'bold metallic tones — deep charcoal, racing red, or midnight blue with chrome accents',
    pharma: 'clean clinical tones — white with deep green and subtle blue accents',
    transport: 'professional navy blue with warm orange accents for logistics energy',
    fitness: 'bold energetic tones — deep black with vibrant red or electric blue accents',
    beauty: 'elegant soft tones — rose gold, blush pink with subtle champagne accents',
    default: 'premium traditional colors matching the business brand palette'
  };
  return colors[businessType] || colors.default;
};

const getBrandDrivenSuitPaletteFromContext = (businessContext: string): string | null => {
  const info = businessContext.toLowerCase();
  if (!info || info === 'default') return null;

  const contextPalettes: Array<{ keywords: string[]; palette: string }> = [
    {
      keywords: ['maroon', 'burgundy', 'wine', 'ruby', 'crimson', 'oxblood'],
      palette: 'rich maroon, deep wine, oxblood, or maroon-and-gold tailoring drawn straight from the client brand palette'
    },
    {
      keywords: ['emerald', 'green', 'sage', 'olive', 'mint'],
      palette: 'deep emerald, forest green, bottle green, or refined olive tailoring with confident green brand presence'
    },
    {
      keywords: ['navy', 'blue', 'teal', 'cyan', 'azure', 'royal blue'],
      palette: 'deep navy, royal blue, midnight blue, or navy-and-silver tailoring shaped by the brand accents'
    },
    {
      keywords: ['gold', 'champagne', 'mustard', 'amber'],
      palette: 'champagne gold, mustard-gold, ivory-gold, or elegant black-and-gold tailoring with a rich brand-gold finish'
    },
    {
      keywords: ['pink', 'rose', 'blush', 'peach', 'coral'],
      palette: 'rose, blush, dusty pink, or coral-accented tailoring with polished feminine warmth'
    },
    {
      keywords: ['black', 'charcoal', 'graphite', 'slate', 'grey', 'gray', 'silver'],
      palette: 'charcoal, jet black, graphite, slate grey, or black-and-gold tailoring with confident depth'
    },
    {
      keywords: ['purple', 'plum', 'violet', 'lavender', 'lilac'],
      palette: 'deep purple, plum, aubergine, or wine-purple tailoring with editorial richness'
    },
    {
      keywords: ['orange', 'terracotta', 'rust'],
      palette: 'terracotta, rust, burnt orange, or deep caramel tailoring with warm brand energy'
    }
  ];

  const matchedPalette = contextPalettes.find(({ keywords }) => keywords.some((keyword) => info.includes(keyword)));
  return matchedPalette?.palette || null;
};

export type EducationEnvironmentMode = 'institution' | 'consultancy';

type ShotDesignKey = 'hero' | 'showcase' | 'credibility' | 'detail' | 'closing' | 'alternative';

const EDUCATION_INSTITUTION_KEYWORDS = [
  'college',
  'school',
  'campus',
  'university',
  'institute',
  'institution',
  'academy',
  'classroom',
  'lecture',
  'lab',
  'library',
  'seminar',
  'students',
  'student',
  'faculty',
  'principal',
  'admissions',
  'admission',
  'department',
  'training center',
  'coaching center'
];

const EDUCATION_CONSULTANCY_KEYWORDS = [
  'consultant',
  'consultancy',
  'counselor',
  'counsellor',
  'counseling',
  'counselling',
  'study abroad',
  'overseas',
  'visa',
  'immigration',
  'application',
  'applications',
  'ielts',
  'toefl',
  'gre',
  'gmat',
  'documentation',
  'admission guidance',
  'university partner',
  'foreign education'
];

const countKeywordMatches = (info: string, keywords: string[]): number => (
  keywords.reduce((count, keyword) => count + (info.includes(keyword) ? 1 : 0), 0)
);

export const detectEducationEnvironmentMode = (businessContext: string = ''): EducationEnvironmentMode => {
  const info = businessContext.toLowerCase();

  if (!info) {
    return 'institution';
  }

  const institutionScore = countKeywordMatches(info, EDUCATION_INSTITUTION_KEYWORDS);
  const consultancyScore = countKeywordMatches(info, EDUCATION_CONSULTANCY_KEYWORDS);

  if (consultancyScore > institutionScore && consultancyScore > 0) {
    return 'consultancy';
  }

  return 'institution';
};

const getEducationSuitPalette = (businessContext: string = ''): string => {
  const educationMode = detectEducationEnvironmentMode(businessContext);

  if (educationMode === 'consultancy') {
    return 'elegant almond, dignified cream, polished latte-stone, parchment taupe, or muted olive-beige tones with premium counseling-office polish';
  }

  return 'parchment beige, sandstone cream, academic stone, cedar taupe, or soft sage-beige tones with premium campus polish';
};

const getEducationEnvironmentDescription = (businessContext: string = ''): string => {
  const educationMode = detectEducationEnvironmentMode(businessContext);

  if (educationMode === 'consultancy') {
    return 'real, operational, premium education consultancy office. Counseling desks, comfortable seating for students and parents, a clean modern reception counter, computers and tidy work desks define the background. Use only real, in-use functional office furniture and spaces — NO brochure stands, partnership walls, success-story displays, certificate walls, photo walls, or signage text. The space should instantly communicate education guidance and counseling credibility';
  }

  return 'real, operational college, school, or educational institute campus environment. A real academic reception and admissions desk, classrooms with desks and chairs, a library with shelves of real books, lab stations with real equipment, and a campus corridor with student seating define the background. Use only real, in-use functional academic spaces — NO entrance branding, notice boards, certificate walls, photo / portrait walls, achievement or success displays, or institutional signage text. The space should instantly communicate live campus energy and real institutional credibility';
};

const getEducationLocationPlan = (businessContext: string = ''): string => {
  const educationMode = detectEducationEnvironmentMode(businessContext);

  if (educationMode === 'consultancy') {
    return 'Reception / counseling desk → University partnership or destination wall → Application review desk → Brochure or study-material display → Success-story or testimonial wall → Visa or document consultation zone';
  }

  return 'Campus entrance or branded reception → Admissions desk → Classroom or lecture hall → Library or lab zone → Seminar corridor or notice-board wall → Student interaction or help-desk area';
};

export const getCommercialLocationPlanForBusiness = (businessType: string, businessContext: string = ''): string => {
  const locationPlans: Record<string, string> = {
    medical: 'Reception counter → Consultation room doorway → Treatment or equipment zone → Patient waiting area → Certification wall',
    realestate: 'Reception desk → Property display wall → Building model showcase → Floor-plan gallery → Client meeting zone',
    fashion: 'Store entrance → Clothing display racks → Mirror or trial area → Accessory showcase → Designer feature wall',
    food: 'Host station → Dining area → Kitchen pass or display counter → Beverage station → Ambiance seating zone',
    tech: 'Reception or lobby → Workspace zone → Meeting-room doorway → Whiteboard or creative wall → Tech equipment area',
    education: getEducationLocationPlan(businessContext),
    solar: 'Reception → Solar panel display → System demo area → Certification or partnership wall → Energy model showcase',
    laundry: 'Counter or reception → Washing machine area → Folded linen display → Pressing zone → Rack or collection area',
    mattress: 'Showroom reception → Mattress experience bed zone → Comfort comparison wall → Fabric cutaway display → Premium consultation corner',
    electrical: 'Service counter → Equipment display → Tool showcase area → Demo workstation → Certification wall',
    tea: 'Counter → Tea packet shelf display → Tasting area → Storage or distribution zone → Brand story wall',
    jewellery: 'Entrance display case → Gold collection showcase → Diamond section → Trial mirror area → Heritage or trust wall',
    security: 'Reception → Surveillance monitor zone → Control desk → Equipment or uniform display → Certification wall',
    automobile: 'Reception desk → Vehicle display zone → Feature wall or spec board → Consultation desk → Delivery or trust wall',
    pharma: 'Reception or help desk → Prescription or product shelves → Consultation counter → Clinical workstation → Trust or compliance wall',
    transport: 'Reception → Route map wall → Dispatch desk → Fleet model or proof board → Client service area',
    fitness: 'Reception → Equipment showcase → Training zone → Consultation desk → Transformation or result wall',
    beauty: 'Reception → Treatment station → Product display shelves → Styling mirror zone → Brand or trust wall',
    default: 'Reception → Product or service showcase → Logo or brand wall → Work area → Entrance or closing zone'
  };

  return locationPlans[businessType] || locationPlans.default;
};

export const getEnvironmentNegativeRules = (businessType: string, businessContext: string = ''): string => {
  if (businessType !== 'education') {
    return 'Never drift into a generic office corner, empty luxury hall, hotel-lobby set, fake coworking floor, or home-like interior. Keep the premises operational, dense, and client-specific.';
  }

  if (detectEducationEnvironmentMode(businessContext) === 'consultancy') {
    return 'Never use a home interior, living room, apartment, bedroom, hotel lobby, empty coworking corner, or anonymous office. The space must read as a real education-guidance consultancy with counseling desks, document surfaces, university information walls, and success-proof displays.';
  }

  return 'Never use a home interior, living room, apartment, bedroom, sofa set, residential staircase, hotel lobby, generic luxury hall, bland coworking corner, or consultancy cubicle. The space must read as a real college, school, campus, institute, lecture, library, lab, admissions, or student-services environment.';
};

export const getRealisticLogoPlacementGuidance = (businessType: string, businessContext: string = ''): string => {
  if (businessType === 'education') {
    if (detectEducationEnvironmentMode(businessContext) === 'consultancy') {
      return 'Use real counseling-office branding surfaces such as a reception panel, counseling desk backdrop, university partner wall, application-review glass sign, or success-story feature wall. The logo must feel installed into the consultancy architecture, not pasted as an overlay.';
    }

    return 'Use real campus or institute branding surfaces such as an admissions wall panel, academic reception board, corridor acrylic sign, seminar-hall branding wall, library section sign, student-help desk fascia, or entrance monument sign. The logo must feel physically mounted into the institution architecture, not pasted as an overlay.';
  }

  return 'Use real architectural branding surfaces such as a reception panel, acrylic wall sign, consultation-zone feature wall, achievement board, showroom fascia, or entrance sign. The logo must feel installed into the premises with believable material depth and reflections, never pasted as an overlay.';
};

const getShotLogoPlacementForBusiness = (
  shotKey: ShotDesignKey,
  businessType: string,
  businessContext: string = ''
): string => {
  const generalPlacements: Record<ShotDesignKey, string> = {
    hero: 'a reception panel or front-desk brand wall mounted on real architectural material behind the subject',
    showcase: 'a service-zone sign, department panel, or branded side-wall board integrated with the actual showcase area',
    credibility: 'an achievement wall, certification board, trust-display panel, or founder-story surface installed behind her',
    detail: 'a corridor acrylic sign, section label, workstation brand panel, or departmental header built into the space',
    closing: 'an entrance welcome sign, visitor-facing reception board, or client-service fascia visible behind her',
    alternative: 'a landmark brand wall, branded partition, or premium architectural feature sign that suits the most iconic zone'
  };

  if (businessType !== 'education') {
    return generalPlacements[shotKey];
  }

  if (detectEducationEnvironmentMode(businessContext) === 'consultancy') {
    const consultancyPlacements: Record<ShotDesignKey, string> = {
      hero: 'a counseling-office reception board or front-desk brand panel mounted above the real welcome desk',
      showcase: 'a university-destination wall sign or brochure-zone brand panel installed beside the study-guidance display',
      credibility: 'a success-story wall, accreditation board, or university-partner feature panel installed behind her',
      detail: 'a document-review area acrylic sign or application-desk header integrated into the architecture',
      closing: 'an entrance consultation sign or visitor-facing counseling-desk fascia visible behind her',
      alternative: 'a branded partition in the student-guidance area or a premium destination-wall feature sign'
    };

    return consultancyPlacements[shotKey];
  }

  const institutionPlacements: Record<ShotDesignKey, string> = {
    hero: 'an admissions or academic reception board mounted above the real front desk or welcome wall',
    showcase: 'a classroom, lab, library, or department sign integrated into the visible academic zone behind her',
    credibility: 'an achievement wall, accreditation board, institutional crest panel, or ranking display installed behind her',
    detail: 'a corridor acrylic sign, library section board, lab-door branding, or notice-board header built into the campus architecture',
    closing: 'an entrance welcome panel or student-service desk fascia visible behind her',
    alternative: 'a seminar-hall branding wall, campus monument sign, or branded student-interaction area partition'
  };

  return institutionPlacements[shotKey];
};

export const getProfessionalSuitPaletteForBusiness = (businessType: string, businessContext: string = ''): string => {
  const palettes: Record<string, string> = {
    medical: 'soft ivory, clinical navy-and-white, teal-accented, or pearl tones with a clean healthcare-trust feel',
    realestate: 'deep navy, charcoal, sandstone-gold, royal blue, or warm taupe for authority and premium trust',
    fashion: 'rich wine, deep plum, blush-rose, champagne, or couture pastel tones with polished femininity',
    food: 'warm maroon, saffron-gold, deep caramel, honey, or inviting hospitality tones with warmth',
    tech: 'deep navy, steel blue, charcoal, graphite-blue, or soft steel greige with modern polish',
    education: getEducationSuitPalette(businessContext),
    solar: 'deep green, solar-blue, sunlit gold, sage, or clean-energy tones',
    laundry: 'fresh ivory, crisp white-and-blue, pearl, powder blue, or clean premium tones',
    mattress: 'soft cream, calm blue, lavender, almond, or comfort-led tones',
    electrical: 'steel blue, deep navy, graphite, charcoal, or precise service-led tones',
    tea: 'leaf green, warm gold, earthy maroon, deep caramel, or plantation-rich tones',
    jewellery: 'deep maroon, royal plum, black-and-gold, champagne-gold, or luxe jewel tones',
    security: 'deep navy, charcoal, graphite, black-and-gold, or commanding disciplined tones',
    automobile: 'graphite, jet black, metallic charcoal, racing-red accents, or showroom-grade premium tones',
    pharma: 'clean ivory, clinical navy-and-white, teal, or sterile premium tones',
    transport: 'deep navy, structured charcoal, logistics-orange accents, or premium stone tones',
    fitness: 'bold black, charcoal, energetic red or electric-blue accents, or athletic premium tones',
    beauty: 'blush-rose, deep plum, champagne, rosy nude, or elegant luxury tones',
    default: 'a premium business-specific suit palette derived from the logo colors, brand mood, and interior materials — a rich brand tone (maroon, navy, emerald, charcoal, plum, black-and-gold) or a premium neutral only when the brand truly calls for it, never a reusable default beige'
  };

  const sectorPalette = palettes[businessType] || palettes.default;
  const brandPalette = getBrandDrivenSuitPaletteFromContext(businessContext);
  const paletteFamilyRule = 'Treat this as an approved palette family of premium, brand-derived shades — not one fixed suit color and never a default beige. Pull the dominant suit color from the logo and brand identity (it may be a rich brand tone such as maroon, navy, emerald, charcoal, plum, or black-and-gold, or a premium neutral only when the brand truly calls for it). Different businesses must look visibly different and must not collapse into the same reusable beige. Within one campaign keep the same wardrobe family but allow shade shifts inside this approved family when the script, business zone, or lighting supports it.';

  if (!brandPalette) {
    return `${sectorPalette}. ${paletteFamilyRule}`;
  }

  return `approved palette family from the logo colors and brand mood: ${brandPalette}; keep the final suit within this sector direction as well: ${sectorPalette}. ${paletteFamilyRule}`;
};

// Get environment description based on business type
export const getEnvironmentForBusiness = (businessType: string, businessContext: string = ''): string => {
  const environments: Record<string, string> = {
    medical: `real, operational, premium medical clinic / hospital reception area. Clean modern interiors with spotless counters, soft warm-toned walls, subtle blue highlights suggesting healthcare trust. Behind her, organized medical signage, clean waiting area visible. Space should instantly communicate healthcare, trust, and professionalism`,
    realestate: `real, operational, premium real-estate office or experience center. Elegant reception desk, wall-mounted project visuals, building elevations, floor-plan displays, or miniature building models visible. Sophisticated color palette with deep blues, muted greens, warm neutrals. Space should instantly communicate real estate, trust, growth, and success`,
    fashion: `real, operational, premium fashion boutique interior. Elegant displays, designer clothing visible, luxury retail ambiance. Rich textures, soft lighting, boutique-style finish. Space should instantly communicate fashion, elegance, and premium quality`,
    food: `real, operational, premium restaurant or catering service reception. Warm hospitality décor, elegant setup visible, appetizing and welcoming ambiance. Space should instantly communicate food, hospitality, and quality service`,
    tech: `real, modern, premium tech office or startup space. Clean reception-style setup with soft curves and contemporary design. Subtle gradient elements, natural indoor lighting. Space should instantly communicate innovation, professionalism, and trust`,
    education: getEducationEnvironmentDescription(businessContext),
    solar: `real, operational, premium solar-energy office / experience center. Clean modern reception area with wooden and white interiors, subtle tech finish. Behind her, organized displays suggesting solar panels, energy systems. Space should instantly communicate clean energy, innovation, and trust`,
    laundry: `real, operational, premium laundry service reception / experience center. Clean, modern interior with spotless counters, soft warm-toned walls, subtle blue highlights suggesting water and freshness. Behind her, clearly visible professional laundry setup — neatly arranged washing machines or dryers, folded white linens, organized racks. Space should instantly communicate laundry, cleanliness, professionalism, and premium service`,
    mattress: `real, operational, premium mattress showroom interior. Elegant displays, comfortable sleep-focused ambiance, organized product presentation. Space should instantly communicate comfort, quality, and premium sleep solutions`,
    electrical: `real, operational, professional electrical & plumbing service center. Organized equipment displays, clean workspace, professional service atmosphere. Space should instantly communicate technical expertise and reliable service`,
    tea: `real, operational, premium tea distribution office / agency interior. Clean wooden reception counter, shelves behind displaying neatly arranged green and gold tea packets. Space should instantly communicate tea industry, quality, and premium distribution`,
    jewellery: `real, operational, premium jewellery showroom interior. Elegant display cases, luxurious ambiance, soft spotlighting on displays. Space should instantly communicate luxury, trust, and premium quality`,
    security: `real, operational, premium security services command center / office. Clean reception with surveillance monitors, uniformed staff visible, professional security equipment displays. Space should instantly communicate authority, protection, trust, and professionalism`,
    automobile: `real, operational, premium automobile showroom interior. Sleek vehicle displays, modern lighting, polished floors. Space should instantly communicate automotive excellence and trust`,
    pharma: `real, operational, premium pharmaceutical office or medical store. Clean organized shelving, clinical aesthetics. Space should instantly communicate healthcare reliability and trust`,
    transport: `real, operational, premium logistics and transport office. Route maps, fleet displays, organized dispatch area. Space should instantly communicate efficient logistics and reliability`,
    fitness: `real, operational, premium gym or fitness center reception. Modern equipment visible, energetic atmosphere, clean space. Space should instantly communicate fitness, health, and motivation`,
    beauty: `real, operational, premium beauty salon or spa interior. Elegant treatment stations, soft ambient lighting, luxurious finishes. Space should instantly communicate beauty, self-care, and premium pampering`,
    default: `real, operational, premium business office or reception area. Professional modern interiors appropriate to the business type. Space should feel authentic, professional, successful, and well-maintained`
  };
  return environments[businessType] || environments.default;
};

// Get header color scheme based on business type
export const getHeaderColorForBusiness = (businessType: string): string => {
  const colors: Record<string, string> = {
    medical: 'Premium medical gradient background (deep blue → teal), trust and calm aesthetic',
    realestate: 'Premium luxury gradient (black with gold accents), stability and prestige',
    fashion: 'Premium fashion gradient (deep plum/wine with gold), elegant and feminine',
    food: 'Premium warm gradient (deep orange/gold), appetizing and welcoming',
    tech: 'Premium modern gradient (blue to purple), professional and innovative',
    education: 'Premium academic gradient (soft blue or blue-to-white), trustworthy',
    solar: 'Premium energy gradient (green and blue tones), sustainability theme',
    laundry: 'Premium fresh gradient (warm neutrals with subtle blue), cleanliness theme',
    mattress: 'Premium comfort gradient (soft blue), relaxation theme',
    electrical: 'Premium service gradient (cool blue / steel grey), professional',
    tea: 'Premium earthy gradient (green and gold tones), warmth',
    jewellery: 'Premium luxury gradient (deep maroon with gold), opulence',
    security: 'Premium authority gradient (deep navy blue → dark charcoal with bold metallic gold accents), commanding protection feel',
    automobile: 'Premium automotive gradient (deep charcoal → metallic silver), sleek modern feel',
    pharma: 'Premium clinical gradient (deep green → teal with white accents), trusted healthcare',
    transport: 'Premium logistics gradient (navy blue → warm orange accent), reliable movement',
    fitness: 'Premium energetic gradient (deep black → bold red or electric blue), powerful dynamic',
    beauty: 'Premium elegant gradient (rose gold → soft champagne), luxurious feminine',
    default: 'Premium corporate gradient in neutral dark tones'
  };
  return colors[businessType] || colors.default;
};

// ===== COMPREHENSIVE FESTIVAL THEME SYSTEM =====

export interface FestivalTheme {
  sareeColor: string;
  jewellery: string;
  environmentDecorations: string;
  headerColors: string;
  headerPatterns: string;
  headerAccents: string;
  mood: string;
  culturalElements: string;
  lightingStyle: string;
  floorDecor: string;
  backgroundElements: string;
}

export const getFestivalTheme = (festivalName: string): FestivalTheme => {
  const name = festivalName.toLowerCase().trim();

  // Maha Shivaratri / Shivratri
  if (name.includes('shivaratri') || name.includes('shivratri') || name.includes('shiva')) {
    return {
      sareeColor: 'elegant white/cream silk saree with rich royal blue/violet border and silver zari work — Banarasi or Kanchipuram style, symbolizing purity and devotion to Lord Shiva',
      jewellery: 'LUXURIOUS EXPENSIVE CELEBRITY-LEVEL JEWELLERY — Heavy multi-layered gold necklace with diamond/kundan studded pendant, large ornate gold jhumka earrings with diamonds, heavy gold bangles stack on both wrists, optional gold maang tikka. Must look like expensive red-carpet level jewellery worth lakhs — NOT festival-themed items. Pure gold and diamonds only',
      environmentDecorations: `The ENTIRE background must be transformed into an immersive **Maha Shivaratri celebration setup**:
  - Large beautiful **Lord Shiva idol or framed portrait** prominently visible behind/above the subject, adorned with fresh flowers
  - **Shiva Lingam** with bilva leaves, flowers, and milk offering visible on a decorated altar/table
  - **Marigold flower garlands** (orange and yellow) framing the scene, draped generously on walls and around the altar
  - **White jasmine flower strings** (mogra) hanging in layers
  - **Traditional brass oil lamps (deepam/vilakku)** — multiple lit lamps placed at different levels creating warm glow
  - **Nandi (bull) statue** — small brass or stone Nandi visible near the setup
  - **Trishul (trident)** and **Damru (drum)** decorative elements visible
  - **Fresh bilva / bael leaves** scattered on the altar and decorations
  - **Vibhuti (holy ash) marks** on the Shiva Lingam
  - Religious paintings or framed images of Lord Shiva in the background
  - **Camphor and incense** subtle smoke wisps adding atmosphere
  - Fresh flower arrangements — roses, marigolds, jasmine, chrysanthemums surrounding the worship area`,
      headerColors: 'Deep royal blue to violet gradient with silver/white accents — Shiva-inspired sacred color palette',
      headerPatterns: 'Subtle trishul (trident) motifs, Om symbols, damru patterns, crescent moon shapes as watermark elements at 10-15% opacity',
      headerAccents: 'Silver metallic accents, soft blue divine glow effects, sacred geometry patterns',
      mood: 'Deeply devotional, sacred, spiritually serene yet celebratory — premium Maha Shivaratri corporate greeting',
      culturalElements: 'Trishul, Damru, Om symbol, crescent moon, Nandi, bilva leaves, rudraksha beads',
      lightingStyle: 'Warm golden lamp light mixed with soft cool blue tones creating a divine, sacred temple-like atmosphere. Multiple oil lamp flames providing warm glow points',
      floorDecor: 'Beautiful traditional rangoli or kolam designs on the floor with flower petals, especially using white and blue flowers',
      backgroundElements: 'The company logo/signage should be visible BUT the Shivaratri decorations should be the DOMINANT visual theme — garlands, lamps, flowers, and religious elements should transform the space into a Shivaratri celebration venue'
    };
  }

  // Sankranthi / Makar Sankranti / Pongal
  if (name.includes('sankranthi') || name.includes('sankranti') || name.includes('pongal') || name.includes('lohri')) {
    return {
      sareeColor: 'rich festive crimson/maroon silk saree with bright golden zari border — heavy Kanchipuram silk with traditional motifs symbolizing harvest prosperity',
      jewellery: 'LUXURIOUS EXPENSIVE CELEBRITY-LEVEL JEWELLERY — Heavy multi-layered gold necklace (kasulaperu or manga haram style) with diamond studding, large ornate gold jhumka earrings, heavy gold bangles stack on both wrists. Must look like expensive red-carpet level jewellery worth lakhs — pure gold and diamonds only',
      environmentDecorations: `The ENTIRE background must be transformed into an immersive **Sankranthi / Pongal celebration setup**:
  - **Thick marigold garlands** (orange and yellow) draped lavishly on walls, doorways, and around the frame — multiple layers, generous quantity
  - **Mango leaf thoranam (festive door hanging)** prominently visible at the top
  - **Traditional brass oil lamps (deepam)** — multiple lit lamps at different positions
  - **Decorated Pongal pot** with sugarcane and turmeric plants visible
  - **Fresh sugarcane stalks** leaning against walls or placed decoratively
  - **Traditional rangoli (muggu)** on the floor — colorful geometric patterns with flower petals
  - **Harvest elements** — fresh turmeric plants, rice grains, jaggery, fruits arranged decoratively
  - **Colorful kites** or kite decorations suggesting Sankranthi sky celebrations
  - **Traditional brass and copper vessels** with festive arrangements
  - **Fresh flower decorations** — roses, marigolds, mums, jasmine strings hanging
  - **Banana leaves** used decoratively
  - **Cow or bull decorations** (painted horns, garlands) — can be small figurines or art
  - **String lights or traditional lamps** adding warm festive glow`,
      headerColors: 'Warm festive gradient — deep orange to golden yellow with maroon/crimson accents, harvest celebration palette',
      headerPatterns: 'Subtle sugarcane motifs, kite shapes, pot designs, rangoli patterns as watermark elements at 10-15% opacity',
      headerAccents: 'Golden metallic accents, warm harvest glow, marigold orange highlights, traditional border patterns',
      mood: 'Warm, joyful, harvest celebration — prosperous, abundant, deeply festive Indian Sankranthi atmosphere',
      culturalElements: 'Sugarcane, Pongal pot, kites, marigold garlands, rangoli, harvest elements, mango leaf thoranam',
      lightingStyle: 'Bright warm golden sunlight-inspired indoor lighting — cheerful, abundant, festive warmth with multiple lamp glows',
      floorDecor: 'Large elaborate colorful rangoli (muggu) design on the floor with rice flour patterns, flower petals in vibrant colors',
      backgroundElements: 'The company logo/signage should be visible BUT fully surrounded by Sankranthi decorations — marigold garlands should frame everything, the space must look like a traditional Sankranthi celebration venue'
    };
  }

  // Diwali / Deepavali
  if (name.includes('diwali') || name.includes('deepavali') || name.includes('deepawali')) {
    return {
      sareeColor: 'luxurious deep maroon/wine silk saree with rich gold zari work — heavy Banarasi or Kanchipuram silk with intricate brocade patterns, symbolizing prosperity and celebration',
      jewellery: 'LUXURIOUS EXPENSIVE CELEBRITY-LEVEL JEWELLERY — Grand ornate gold necklace with heavy kundan and diamond work, large traditional gold jhumka earrings with precious stones, heavy gold bangles stack, maang tikka. Must look like expensive red-carpet level jewellery worth lakhs — pure gold and diamonds only',
      environmentDecorations: `The ENTIRE background must be transformed into an immersive **Diwali / Deepavali celebration setup**:
  - **Hundreds of lit diyas (earthen oil lamps)** arranged in beautiful patterns — on shelves, ledges, floor, and surfaces throughout the scene
  - **Marigold and rose garlands** in orange, yellow, and red draped lavishly
  - **String fairy lights** — warm golden twinkling lights decorating the background
  - **Decorative lanterns (akash diya / kandil)** hanging from ceiling
  - **Rangoli with diyas** — elaborate floor rangoli with lit diyas placed within the pattern
  - **Fresh flower arrangements** — roses, marigolds, lotus, jasmine in brass urlis and vessels
  - **Traditional brass/copper lamps** (standing lamps, hanging lamps) all lit
  - **Goddess Lakshmi idol or framed image** with flowers and lamp
  - **Sparkle and warm glow** throughout — the entire space should radiate with warm diya light
  - **Decorative torans** (door hangings) with mango leaves and marigolds
  - **Gift boxes** wrapped in festive colors (subtle, in background)
  - **Sweets platter** (mithai) visible subtly — a touch of celebration
  - **Candles in decorative holders** supplementing the diyas`,
      headerColors: 'Rich deep maroon/wine base gradient with golden/amber accents — luxurious Diwali celebration palette',
      headerPatterns: 'Subtle diya flame motifs, lotus patterns, paisley designs, sparkle dots as watermark elements at 10-15% opacity',
      headerAccents: 'Rich gold metallic accents, warm amber glow effects, sparkling light dots, traditional border patterns',
      mood: 'Grand, luminous, prosperous, deeply celebratory — premium Diwali festival of lights atmosphere',
      culturalElements: 'Diyas, lanterns, rangoli, lotus, Lakshmi imagery, sparkle, festive lights, toran',
      lightingStyle: 'Rich warm golden glow from hundreds of diyas and lamps — the entire scene should feel illuminated by real flame light, creating a magical warm Diwali atmosphere',
      floorDecor: 'Grand elaborate rangoli with flower petals and lit diyas placed within the design, creating a stunning floor display',
      backgroundElements: 'The company logo/signage should be visible BUT the Diwali decorations (diyas, lights, garlands) must be the DOMINANT visual — the space must feel like it is literally glowing with Diwali celebration'
    };
  }

  // Republic Day
  if (name.includes('republic') || name.includes('26 jan') || name.includes('26th jan') || name.includes('gantantra')) {
    return {
      sareeColor: 'elegant golden/cream silk saree with tricolor-inspired border (saffron and green accents with gold) — premium patriotic silk with dignity and grace',
      jewellery: 'LUXURIOUS EXPENSIVE CELEBRITY-LEVEL JEWELLERY — Heavy elegant gold necklace with diamond pendant, large ornate gold jhumka earrings with precious stones, heavy gold bangles stack. Must look like expensive red-carpet level jewellery worth lakhs — pure gold and diamonds only',
      environmentDecorations: `The ENTIRE background must be transformed into an immersive **Republic Day / Independence Day patriotic celebration setup**:
  - **Indian tricolor balloons** (saffron, white, green) arranged in balloon arches and clusters throughout the background — generous, celebratory quantity
  - **Indian National Flag** — a small desk flag or wall-mounted flag prominently visible
  - **Tricolor fabric drapes** or bunting decorating the walls and ceiling
  - **Patriotic ribbon decorations** in saffron, white, and green
  - **"Happy Republic Day" or patriotic themed** subtle signage or banner
  - **Tricolor flower arrangements** using saffron marigolds, white jasmine/chrysanthemums, and green foliage
  - **Ashoka Chakra** motif visible subtly in decorations
  - **Patriotic themed backdrop** with dignity and respect — NOT cartoonish
  - **Small potted plants** with tricolor ribbons
  - **Professional corporate patriotic setup** — elegant and respectful, befitting a premium office celebration`,
      headerColors: 'Deep navy blue (Ashoka Chakra blue) base with saffron, white, and green tricolor accents — dignified patriotic gradient',
      headerPatterns: 'Subtle Ashoka Chakra wheel motif, tricolor wave patterns, Indian map outline as watermark elements at 8-12% opacity',
      headerAccents: 'Tricolor ribbon accents, golden Ashoka Chakra, saffron-white-green gradient strips',
      mood: 'Patriotic, dignified, proud, respectful — premium corporate Republic Day celebration',
      culturalElements: 'Indian flag, Ashoka Chakra, tricolor elements, patriotic symbols with dignity',
      lightingStyle: 'Clean bright professional lighting with subtle warm gold tones — celebratory yet dignified',
      floorDecor: 'Clean professional floor, possibly with a tricolor flower rangoli or small patriotic floor arrangement',
      backgroundElements: 'The company logo/signage should be visible with tricolor balloons and patriotic decorations framing it — the space must look like an office celebrating Republic Day with pride'
    };
  }

  // Independence Day
  if (name.includes('independence') || name.includes('15 aug') || name.includes('15th aug') || name.includes('swatantra')) {
    return {
      sareeColor: 'elegant golden/cream silk saree with tricolor-inspired border (saffron and green accents with gold) — premium patriotic silk with dignity and grace',
      jewellery: 'LUXURIOUS EXPENSIVE CELEBRITY-LEVEL JEWELLERY — Heavy elegant gold necklace with diamond pendant, large ornate gold jhumka earrings with precious stones, heavy gold bangles stack. Must look like expensive red-carpet level jewellery worth lakhs — pure gold and diamonds only',
      environmentDecorations: `The ENTIRE background must be transformed into an immersive **Independence Day patriotic celebration setup**:
  - **Indian tricolor balloons** (saffron, white, green) arranged in generous balloon arches and clusters throughout — celebratory and vibrant
  - **Indian National Flag** — desk flag and/or wall-mounted flag prominently visible
  - **Tricolor fabric drapes** and bunting decorating walls, doorways, and ceiling
  - **Patriotic ribbon decorations** in saffron, white, and green
  - **Tricolor flower arrangements** — saffron marigolds, white jasmine/chrysanthemums, green foliage
  - **Freedom-themed subtle decor** — dignified and corporate
  - **Tricolor paper fans and pinwheels** as wall decorations
  - **Small potted plants** with tricolor ribbons tied
  - **Professional corporate independence celebration setup** — elegant, proud, and respectful`,
      headerColors: 'Deep navy blue base with saffron, white, and green tricolor accents — proud patriotic gradient',
      headerPatterns: 'Subtle Ashoka Chakra wheel motif, tricolor wave patterns, flying dove silhouettes as watermark elements at 8-12% opacity',
      headerAccents: 'Tricolor ribbon accents, golden Ashoka Chakra, saffron-white-green gradient strips',
      mood: 'Patriotic, proud, celebratory, dignified — premium corporate Independence Day celebration',
      culturalElements: 'Indian flag, tricolor theme, Ashoka Chakra, freedom symbols, patriotic dignity',
      lightingStyle: 'Clean bright professional lighting with warm golden tones — celebratory yet dignified atmosphere',
      floorDecor: 'Clean professional floor with optional tricolor flower rangoli or patriotic floor arrangement',
      backgroundElements: 'The company logo/signage should be visible with tricolor balloons and decorations framing it — the space must look like an office proudly celebrating Independence Day'
    };
  }

  // Ugadi /  New Year / Gudi Padwa
  if (name.includes('ugadi') || name.includes('ugaadi') || name.includes('gudi padwa') || name.includes('telugu new year')) {
    return {
      sareeColor: 'rich golden yellow or mango-colored silk saree with green and maroon border — premium Kanchipuram silk symbolizing new beginnings and spring',
      jewellery: 'LUXURIOUS EXPENSIVE CELEBRITY-LEVEL JEWELLERY — Heavy ornate gold necklace with diamond/kundan studded pendant, large gold jhumka earrings with precious stones, heavy gold bangles stack. Must look like expensive red-carpet level jewellery worth lakhs — pure gold and diamonds only',
      environmentDecorations: `The ENTIRE background must be transformed into an immersive **Ugadi celebration setup**:
  - **Mango leaf thoranam (festive door hanging)** prominently displayed — fresh green mango leaves strung on string
  - **Mango leaf and flower garlands** decorating walls and doorways
  - **Fresh neem flowers and mango blossoms** in decorative arrangements
  - **Ugadi Pachadi ingredients** displayed decoratively — neem, jaggery, raw mango, tamarind
  - **Traditional brass lamps (deepam)** lit and placed around the scene
  - **Marigold and jasmine flower decorations** generously draped
  - **Rangoli (muggu)** on the floor with traditional patterns
  - **Fresh banana leaves** used as decorative base for arrangements
  - **Panchangam (traditional calendar)** visible subtly
  - **New vessels or objects** symbolizing new beginnings
  - **Spring flowers** — bright colors celebrating the  New Year
  - **Traditional kolam patterns** on walls or floor`,
      headerColors: 'Vibrant spring palette — golden yellow to fresh green gradient with warm orange/mango accents',
      headerPatterns: 'Subtle mango leaf motifs, spring flower patterns, traditional kolam designs as watermark elements at 10-15% opacity',
      headerAccents: 'Golden and green accents, spring blossom elements, mango leaf border patterns',
      mood: 'Fresh, new beginnings, spring joy, celebratory — premium Ugadi celebration of the  New Year',
      culturalElements: 'Mango leaves, neem flowers, thoranam, spring blossoms, Ugadi Pachadi, traditional kolam',
      lightingStyle: 'Bright cheerful spring-like natural indoor lighting with warm golden tones — fresh and vibrant',
      floorDecor: 'Traditional rangoli with spring flower petals and mango leaf designs — colorful and fresh',
      backgroundElements: 'The company logo/signage should be visible with Ugadi decorations (mango leaf thoranam, flowers, garlands) transforming the space into a festive Ugadi celebration'
    };
  }

  // Ganesh Chaturthi / Vinayaka Chavithi
  if (name.includes('ganesh') || name.includes('vinayaka') || name.includes('chavithi') || name.includes('chaturthi')) {
    return {
      sareeColor: 'rich deep red/maroon silk saree with heavy gold zari work — premium Kanchipuram silk symbolizing auspiciousness and divine celebration',
      jewellery: 'LUXURIOUS EXPENSIVE CELEBRITY-LEVEL JEWELLERY — Heavy elaborate gold necklace with diamond/kundan work, large traditional gold jhumka earrings with precious stones, heavy gold bangles stack, optional gold waist chain. Must look like expensive red-carpet level jewellery worth lakhs — pure gold and diamonds only',
      environmentDecorations: `The ENTIRE background must be transformed into an immersive **Ganesh Chaturthi celebration setup**:
  - **Beautiful Lord Ganesha idol** (eco-friendly clay idol) as the central background element, decorated with flowers and garlands
  - **Modak sweets** displayed on a plate near the idol
  - **Red and yellow marigold garlands** draped lavishly around and on the idol
  - **Fresh flower decorations** — roses, marigolds, jasmine, hibiscus
  - **Traditional brass oil lamps** lit around the Ganesha setup
  - **Banana leaves and coconuts** as traditional offerings
  - **Decorated mandap/pandal** — colorful fabric drapes creating a festive canopy
  - **Incense and camphor** subtle smoke for atmosphere
  - **Traditional rangoli** on the floor leading to the idol
  - **Laddu and modak** trays visible
  - **Durva grass** (sacred grass) in offerings
  - **Small elephant motif decorations** subtly placed`,
      headerColors: 'Rich vermillion red to deep orange gradient with golden accents — auspicious Ganesha celebration palette',
      headerPatterns: 'Subtle Ganesha silhouette, Om symbol, modak shapes, paisley patterns as watermark elements at 10-15% opacity',
      headerAccents: 'Gold and vermillion accents, warm divine glow, traditional border patterns with elephant motifs',
      mood: 'Devotional, joyful, auspicious, grand — premium Ganesh Chaturthi corporate celebration',
      culturalElements: 'Lord Ganesha, modak, marigolds, incense, traditional lamps, coconut, durva grass',
      lightingStyle: 'Warm golden devotional lighting from brass lamps and diyas — rich, warm, temple-like sacred glow',
      floorDecor: 'Traditional rangoli with flower petals in vibrant red, yellow, and orange — leading to the Ganesha idol',
      backgroundElements: 'The Lord Ganesha decorated setup should be the DOMINANT background element, with the company logo/signage visible but secondary to the festive devotional scene'
    };
  }

  // Dasara / Dussehra / Navaratri / Durga Puja
  if (name.includes('dasara') || name.includes('dussehra') || name.includes('navaratri') || name.includes('navratri') || name.includes('durga')) {
    return {
      sareeColor: 'vibrant royal red or rich orange silk saree with contrasting bright gold/green border — heavy Banarasi silk symbolizing victory, power, and divine feminine energy',
      jewellery: 'LUXURIOUS EXPENSIVE CELEBRITY-LEVEL JEWELLERY — Grand ornate gold necklace with heavy diamond/kundan work, large traditional gold jhumka earrings with precious stones, heavy gold bangles on both wrists, optional gold kamarbandh. Must look like expensive red-carpet level jewellery worth lakhs — pure gold and diamonds only',
      environmentDecorations: `The ENTIRE background must be transformed into an immersive **Dasara / Navaratri celebration setup**:
  - **Golu / Bomma Koluvu (step display)** — traditional step arrangement with dolls and figurines visible
  - **Goddess Durga / Saraswati / Lakshmi** framed image or idol decorated with flowers
  - **Generous marigold and jasmine flower decorations** on walls and around displays
  - **Traditional brass oil lamps** lit at multiple levels
  - **Vibrant silk fabric drapes** in red, orange, and gold
  - **Fresh flower garlands** in multiple colors — red, yellow, orange, white
  - **Banana trunks and coconut** decorative elements
  - **Kolam/Rangoli** elaborate floor designs
  - **Toran (door hangings)** with mango leaves and flowers
  - **Traditional festive elements** — kumkum, turmeric, akshata visible in small brass bowls
  - **Festive lights and decorations** creating a warm celebratory atmosphere
  - **Victory and prosperity themed** overall setup`,
      headerColors: 'Vibrant red to deep orange gradient with golden accents — powerful Dasara celebration palette',
      headerPatterns: 'Subtle lotus motifs, trishul patterns, victory symbols, traditional kolam designs as watermark at 10-15% opacity',
      headerAccents: 'Rich gold and vermillion accents, powerful warm glow, traditional border patterns',
      mood: 'Victorious, powerful, celebratory, auspicious — premium Dasara/Navaratri corporate celebration',
      culturalElements: 'Golu display, goddess imagery, marigolds, victory symbols, traditional lamps, silk drapes',
      lightingStyle: 'Rich warm golden and amber lighting — powerful, festive, with lamp glows creating a victorious celebratory atmosphere',
      floorDecor: 'Elaborate colorful rangoli/kolam with festival motifs — vibrant reds, yellows, and oranges with flower petals',
      backgroundElements: 'Festival decorations should DOMINATE the background — Golu display, flower garlands, lamps should transform the space into a Navaratri celebration venue, with company logo visible but secondary'
    };
  }

  // Holi
  if (name.includes('holi') || name.includes('rang')) {
    return {
      sareeColor: 'pristine white or cream silk saree with colorful border accents (pink, yellow, green touches) — Holi-appropriate, ready for the festival of colors',
      jewellery: 'LUXURIOUS EXPENSIVE CELEBRITY-LEVEL JEWELLERY — Heavy ornate gold necklace with diamond/kundan studded pendant, large gold jhumka earrings with precious stones, heavy gold bangles stack. Must look like expensive red-carpet level jewellery worth lakhs — NOT minimal, pure gold and diamonds only',
      environmentDecorations: `The ENTIRE background must be transformed into an immersive **Holi celebration setup**:
  - **Colorful gulal (colored powder) splashes** on walls, creating vibrant abstract art — pinks, yellows, greens, blues, purples
  - **Bowls and plates of colorful gulal powders** arranged decoratively
  - **Pichkaris (water guns)** placed decoratively
  - **Color-splattered surfaces** creating a festive lived-in celebration feel
  - **Bright festive flowers** in vibrant colors — marigolds, roses, sunflowers
  - **Colorful fabric streamers and bunting**
  - **Traditional water-filled vessels** with flower petals and colors
  - **Thandai or festive drinks** in elegant glasses (subtle background element)
  - **Bright and cheerful lighting** enhancing the colorful atmosphere
  - **Rainbow color theme** throughout
  - **Festive color powder cloud effects** subtly in the background air`,
      headerColors: 'Vibrant multi-color splash gradient — pink, yellow, green, blue, purple — joyful Holi color explosion',
      headerPatterns: 'Subtle color splash effects, powder burst motifs, water droplet patterns as watermark elements at 12-18% opacity',
      headerAccents: 'Multi-color accents, playful color splashes, vibrant rainbow highlights',
      mood: 'Joyful, colorful, playful, vibrant — premium Holi festival of colors corporate celebration',
      culturalElements: 'Gulal powders, pichkaris, color splashes, vibrant flowers, thandai, festive joy',
      lightingStyle: 'Bright, cheerful, vibrant natural light with colorful reflections — the scene should feel alive with color and joy',
      floorDecor: 'Colorful rangoli made with vibrant gulal powders — abstract colorful patterns celebrating the spirit of Holi',
      backgroundElements: 'Holi color splashes and decorations should DOMINATE the background, creating a vibrant, colorful celebration atmosphere with the company logo visible through the colorful festive setup'
    };
  }

  // Raksha Bandhan / Rakhi
  if (name.includes('raksha') || name.includes('rakhi')) {
    return {
      sareeColor: 'elegant pastel pink or soft peach silk saree with golden border — feminine, graceful, symbolizing the bond of protection and love',
      jewellery: 'LUXURIOUS EXPENSIVE CELEBRITY-LEVEL JEWELLERY — Heavy ornate gold necklace with diamond/kundan work, large elegant gold jhumka earrings with precious stones, heavy gold bangles stack. Must look like expensive red-carpet level jewellery worth lakhs — pure gold and diamonds only',
      environmentDecorations: `The ENTIRE background must be transformed into an immersive **Raksha Bandhan celebration setup**:
  - **Decorated rakhi thali** with kumkum, rice, sweets, and decorative rakhis prominently visible
  - **Beautiful handmade rakhis** displayed decoratively
  - **Marigold and rose flower decorations** in warm tones
  - **Traditional brass thali and diya** for the ceremonial setup
  - **Gift boxes** wrapped in festive colors
  - **Sweet boxes / mithai** visible (laddoo, barfi)
  - **Pastel and gold decorations** creating a warm, loving atmosphere
  - **Traditional lamps and candles** providing warm glow
  - **Floral arrangements** in pink, yellow, and red
  - **Sibling bond celebration themed** overall setup`,
      headerColors: 'Soft pastel pink to warm gold gradient — delicate, loving Raksha Bandhan celebration palette',
      headerPatterns: 'Subtle rakhi thread motifs, floral patterns, heart elements as watermark at 10-15% opacity',
      headerAccents: 'Gold and pastel pink accents, warm loving glow, delicate floral border patterns',
      mood: 'Warm, loving, celebratory, emotional — premium Raksha Bandhan bond of love corporate greeting',
      culturalElements: 'Rakhis, ceremonial thali, kumkum, sweets, flowers, sibling bond symbols',
      lightingStyle: 'Soft warm golden lighting — intimate, loving, celebratory warmth',
      floorDecor: 'Simple elegant rangoli with flower petals in pink, yellow, and gold tones',
      backgroundElements: 'Raksha Bandhan themed decorations should create a warm, celebratory atmosphere with the company logo visible as part of the festive setup'
    };
  }

  // Christmas
  if (name.includes('christmas') || name.includes('xmas') || name.includes('x-mas')) {
    return {
      sareeColor: 'rich deep red or emerald green silk saree with golden border and subtle Christmas-inspired accents — premium festive silk',
      jewellery: 'LUXURIOUS EXPENSIVE CELEBRITY-LEVEL JEWELLERY — Heavy elegant gold necklace with diamond pendant, large ornate gold jhumka earrings with precious stones, heavy gold bangles stack. Must look like expensive red-carpet level jewellery worth lakhs — pure gold and diamonds only',
      environmentDecorations: `The ENTIRE background must be transformed into an immersive **Christmas celebration setup**:
  - **Decorated Christmas tree** with ornaments, lights, star topper, and gifts underneath
  - **Fairy lights / string lights** draped generously — warm white or multi-color
  - **Christmas wreaths** with red ribbons on walls
  - **Candy canes, stockings, ornaments** as decorative elements
  - **Gift boxes** wrapped in red, green, gold with ribbons and bows
  - **Poinsettia flowers** — red and green Christmas flowers
  - **Santa Claus figurines** or tasteful Christmas figurines
  - **Snowflake decorations** and silver/gold tinsel
  - **Red and green fabric drapes** or tablecloths
  - **Candles in Christmas holders** providing warm glow
  - **Star and bell decorations** hanging
  - **"Merry Christmas" themed** banner or subtle signage`,
      headerColors: 'Rich Christmas red to deep green gradient with golden/silver sparkle accents — classic Christmas celebration palette',
      headerPatterns: 'Subtle snowflake motifs, Christmas tree shapes, star patterns, holly leaves as watermark elements at 10-15% opacity',
      headerAccents: 'Gold and silver metallic accents, Christmas sparkle effects, red ribbon design elements',
      mood: 'Warm, joyful, magical, generous — premium Christmas corporate celebration',
      culturalElements: 'Christmas tree, gifts, stars, snowflakes, wreaths, bells, candy canes, fairy lights',
      lightingStyle: 'Warm magical fairy light glow mixed with soft Christmas morning light — cozy, inviting, festive warmth',
      floorDecor: 'Christmas-themed floor arrangement with gift boxes, pine cones, and small decorative elements',
      backgroundElements: 'Christmas decorations should DOMINATE the background — tree, lights, garlands, gifts should transform the space into a festive Christmas celebration, with company logo visible among the decorations'
    };
  }

  // New Year
  if (name.includes('new year') || name.includes('newyear') || name.includes('happy new') || name.includes('naya saal')) {
    return {
      sareeColor: 'luxurious rich purple or royal blue silk saree with heavy golden zari work — premium celebratory silk symbolizing new beginnings and grandeur',
      jewellery: 'LUXURIOUS EXPENSIVE CELEBRITY-LEVEL JEWELLERY — Statement heavy gold necklace with diamond/precious stone pendant, large ornate gold earrings with diamonds, heavy gold bangles stack. Must look like expensive red-carpet level jewellery worth lakhs — pure gold and diamonds only',
      environmentDecorations: `The ENTIRE background must be transformed into an immersive **New Year celebration setup**:
  - **Gold and silver balloons** — large number balloons showing the YEAR, balloon arches
  - **Metallic streamers and confetti** in gold, silver, and midnight blue
  - **Sparkly fairy lights** and string lights creating magical ambiance
  - **"Happy New Year"** themed banner or signage
  - **Champagne glasses or celebration elements** (tasteful, corporate-appropriate)
  - **Glitter and sparkle elements** throughout
  - **Party poppers and streamers** adding celebration feel
  - **Flower arrangements** in gold, white, and deep colors
  - **Clock or midnight-themed** decorative elements
  - **Star and moon decorations** in gold and silver
  - **Rich fabric drapes** in midnight blue and gold`,
      headerColors: 'Rich midnight blue to deep purple gradient with golden sparkle and silver accents — luxurious New Year celebration palette',
      headerPatterns: 'Subtle clock faces, star motifs, firework burst patterns, year numbers as watermark elements at 10-15% opacity',
      headerAccents: 'Gold and silver metallic accents, sparkle effects, confetti elements, firework burst highlights',
      mood: 'Grand, celebratory, luxurious, hopeful — premium New Year corporate greeting celebration',
      culturalElements: 'Balloons, confetti, sparkle, stars, clock, midnight theme, celebration elements',
      lightingStyle: 'Dramatic warm golden spotlight-style lighting with sparkle and bokeh — glamorous New Year party atmosphere',
      floorDecor: 'Scattered gold confetti and flower petals on the floor creating a celebration aftermath feel',
      backgroundElements: 'New Year celebration decorations should DOMINATE the background — year balloons, streamers, and sparkle should transform the space into a premium New Year party, with company logo visible as part of the celebration'
    };
  }

  // Onam
  if (name.includes('onam')) {
    return {
      sareeColor: 'traditional Kerala kasavu saree — pristine white/cream with rich golden border (traditional Kerala mundu-set inspired) — elegant and culturally authentic',
      jewellery: 'LUXURIOUS EXPENSIVE CELEBRITY-LEVEL JEWELLERY — Heavy elegant Kerala-style gold necklace with diamond accents, large gold jhumka earrings with precious stones, heavy gold bangles stack. Must look like expensive red-carpet level jewellery worth lakhs — pure gold and diamonds only',
      environmentDecorations: `The ENTIRE background must be transformed into an immersive **Onam celebration setup**:
  - **Large Pookalam (flower rangoli)** as the dominant floor decoration — intricate circular design with colorful flower petals in concentric rings
  - **Banana leaves** displayed decoratively and as sadya setup elements
  - **Traditional Kerala brass lamps (Nilavilakku)** lit and placed prominently
  - **Kathakali mask or face** decorative element visible
  - **Maveli / King Mahabali** figurine or decorative representation
  - **Traditional Onam thiruvathira / boat race** themed decorative elements
  - **Fresh flowers** — primarily yellow, white, and orange used in abundance
  - **Kerala traditional umbrella (Olakkuda)** decorative element
  - **Jackfruit, banana bunches** as traditional decorative offerings
  - **Traditional uruli** (brass vessel) with flowers floating in water`,
      headerColors: 'Rich golden yellow to white/cream gradient with green banana leaf accents — authentic Kerala Onam palette',
      headerPatterns: 'Subtle Pookalam circular motifs, Kathakali patterns, traditional Kerala art elements as watermark at 10-15% opacity',
      headerAccents: 'Golden and white accents, Kerala lamp motifs, organic floral border patterns',
      mood: 'Traditional, harvest celebration, Kerala pride, abundant — premium Onam corporate celebration',
      culturalElements: 'Pookalam, Nilavilakku, Kathakali, Maveli, Olakkuda, Kerala brass vessels, flowers',
      lightingStyle: 'Warm natural Kerala-style indoor lighting with traditional lamp glow — golden, warm, and inviting',
      floorDecor: 'Spectacular Pookalam — large circular flower arrangement with concentric rings of colorful petals, this should be the MOST STRIKING floor element',
      backgroundElements: 'Onam decorations should DOMINATE — Pookalam, brass lamps, flowers should transform the space into a traditional Onam celebration venue with company logo visible'
    };
  }

  // Eid
  if (name.includes('eid') || name.includes('ramadan') || name.includes('ramzan')) {
    return {
      sareeColor: 'elegant emerald green or royal blue silk saree with heavy gold and silver zari work — luxurious, dignified, symbolizing prosperity and celebration',
      jewellery: 'LUXURIOUS EXPENSIVE CELEBRITY-LEVEL JEWELLERY — Heavy elegant gold necklace with diamond/precious stone accents, large ornate gold jhumka earrings with diamonds, heavy gold bangles stack. Must look like expensive red-carpet level jewellery worth lakhs — pure gold and diamonds only',
      environmentDecorations: `The ENTIRE background must be transformed into an immersive **Eid celebration setup**:
  - **Crescent moon and star decorations** — golden metallic crescents and stars hanging and on walls
  - **Ornate lanterns (fanoos)** — traditional Eid lanterns with warm candlelight glow, multiple styles
  - **Green and gold fabric drapes** decorating the space
  - **Fresh flower arrangements** — white roses, jasmine, green accents
  - **Dates and sweets (mithai)** arranged on elegant platters
  - **Quran stand** with holy book (subtle, respectful placement)
  - **Geometric Islamic art patterns** visible on walls or as decorative panels
  - **Fairy lights** in warm tones creating celebratory ambiance
  - **Rose water sprinkler (gulab pash)** as decorative element
  - **Attar (perfume) bottles** displayed decoratively
  - **Traditional gifts and Eidi envelopes** visible subtly`,
      headerColors: 'Deep emerald green to gold gradient with crescent moon accents — dignified Eid celebration palette',
      headerPatterns: 'Subtle crescent moon and star motifs, geometric Islamic art patterns, lantern shapes as watermark at 10-12% opacity',
      headerAccents: 'Gold and emerald green accents, crescent moon highlights, ornate border patterns',
      mood: 'Dignified, generous, celebratory, warm — premium Eid corporate greeting celebration',
      culturalElements: 'Crescent moon, stars, lanterns, geometric patterns, dates, flowers, Eid gifts',
      lightingStyle: 'Warm golden lantern-style lighting — soft, inviting, dignified celebration warmth',
      floorDecor: 'Elegant geometric rangoli-style pattern with flower petals in white, green, and gold',
      backgroundElements: 'Eid decorations should DOMINATE — crescents, lanterns, flowers should transform the space into a beautiful Eid celebration venue with company logo visible'
    };
  }

  // Bathukamma
  if (name.includes('bathukamma') || name.includes('batukamma')) {
    return {
      sareeColor: 'vibrant bright pink or rich magenta silk saree with contrasting green/golden border — traditional Telangana festive silk celebrating feminine power and Nature',
      jewellery: 'LUXURIOUS EXPENSIVE CELEBRITY-LEVEL JEWELLERY — Heavy elaborate gold necklace with diamond/kundan work, large gold jhumka earrings with precious stones, heavy gold bangles stack, possibly a gold choker. Must look like expensive red-carpet level jewellery worth lakhs — pure gold and diamonds only',
      environmentDecorations: `The ENTIRE background must be transformed into an immersive **Bathukamma celebration setup**:
  - **Colorful Bathukamma floral stacks** — the signature conical flower arrangements made of seasonal flowers placed on a brass plate
  - **Tangdi flowers, gunuka flowers, banthi flowers (marigolds), chamanti (chrysanthemums)** used in the arrangements
  - **Multiple Bathukamma stacks** visible — large and small
  - **Turmeric and kumkum** decorative elements
  - **Traditional brass lamps** lit around the setup
  - **Colorful saris and fabric** draped as backdrop
  - **Women's celebration themed** setup — vibrant, feminine, powerful
  - **Gouramma idol** (goddess figure) visible
  - **Fresh flower garlands** in bright pinks, yellows, oranges, reds
  - **Telangana cultural motifs** as subtle decorative elements`,
      headerColors: 'Vibrant magenta/pink to golden yellow gradient with green accents — energetic Bathukamma celebration palette',
      headerPatterns: 'Subtle floral stack motifs, concentric flower patterns, Telangana art elements as watermark at 10-15% opacity',
      headerAccents: 'Bright pink and golden accents, floral highlights, vibrant feminine energy patterns',
      mood: 'Vibrant, feminine, powerful, deeply cultural — premium Bathukamma corporate celebration of Telangana heritage',
      culturalElements: 'Bathukamma floral stacks, seasonal flowers, Gouramma, turmeric, kumkum, feminine power',
      lightingStyle: 'Bright warm golden lighting with vibrant reflections from colorful flowers — energetic, joyful, celebration warmth',
      floorDecor: 'Colorful rangoli with flower petals and Bathukamma-inspired circular patterns in vibrant pinks and yellows',
      backgroundElements: 'Bathukamma celebrations should DOMINATE — multiple floral stacks, colorful flowers, and traditional elements should transform the space into a Bathukamma festival venue with company logo visible'
    };
  }

  // Vishu / Vasakhi / Baisakhi
  if (name.includes('vishu') || name.includes('vaisakhi') || name.includes('baisakhi') || name.includes('vasakhi')) {
    return {
      sareeColor: 'bright golden yellow silk saree with rich traditional border — premium celebratory silk symbolizing prosperity, harvest, and new beginnings',
      jewellery: 'LUXURIOUS EXPENSIVE CELEBRITY-LEVEL JEWELLERY — Heavy elegant gold necklace with diamond/kundan work, large traditional gold jhumka earrings with precious stones, heavy gold bangles stack. Must look like expensive red-carpet level jewellery worth lakhs — pure gold and diamonds only',
      environmentDecorations: `The ENTIRE background must be transformed into an immersive **Vishu/Vaisakhi celebration setup**:
  - **Vishu Kani arrangement** — traditional first-sight arrangement with golden cucumber, flowers, rice, coins, mirror, holy text, fruits arranged in a brass uruli
  - **Konna flowers (Cassia fistula / Golden shower)** prominently displayed — bright yellow flowers
  - **Fresh fruits and harvest produce** arranged decoratively
  - **Traditional brass lamps** lit around the setup
  - **Banana leaves and coconut** decorative elements
  - **Golden and yellow themed** flower arrangements throughout
  - **Traditional mirror** as part of Vishu Kani setup
  - **Fresh flower garlands** in yellow and white`,
      headerColors: 'Bright golden yellow to warm amber gradient with green harvest accents — vibrant spring/harvest palette',
      headerPatterns: 'Subtle konna flower motifs, harvest symbols, spring blossom patterns as watermark at 10-15% opacity',
      headerAccents: 'Golden and amber accents, spring flower highlights, traditional border patterns',
      mood: 'Prosperous, hopeful, new beginnings, abundant — premium harvest and New Year celebration',
      culturalElements: 'Vishu Kani, konna flowers, harvest produce, brass vessels, traditional mirror, coconut',
      lightingStyle: 'Bright warm golden morning-light style — fresh, prosperous, symbolizing a new dawn and new year',
      floorDecor: 'Traditional kolam/rangoli with flower petals in golden yellow and white — fresh and auspicious',
      backgroundElements: 'Vishu/harvest celebration decorations should DOMINATE the background with company logo visible as part of the festive setup'
    };
  }

  // Generic / Default festival
  return {
    sareeColor: `rich festive silk saree in colors that traditionally represent ${festivalName} celebrations — premium festival-appropriate silk with gold zari work`,
    jewellery: `LUXURIOUS EXPENSIVE CELEBRITY-LEVEL JEWELLERY — Heavy ornate gold necklace with diamond/kundan studded pendant, large gold jhumka earrings with precious stones, heavy gold bangles stack. Must look like expensive red-carpet level jewellery worth lakhs — pure gold and diamonds only`,
    environmentDecorations: `The ENTIRE background must be transformed into an immersive **${festivalName} celebration setup**:
  - **Festival-specific decorations** prominently displayed throughout the scene
  - **Fresh flower garlands** — marigolds, jasmine, roses in colors appropriate to ${festivalName}
  - **Traditional brass oil lamps** lit and placed for warm festive glow
  - **Rangoli / kolam** on the floor with festival-appropriate patterns and colors
  - **Festive fabric drapes** in celebration-appropriate colors
  - **Traditional cultural elements** specific to ${festivalName} — any religious imagery, symbols, ritual items authentically represented
  - **Flower petals** scattered decoratively
  - **Festival-themed decorative items** — figurines, idols, symbols, banners related to ${festivalName}
  - **Festive lights and warm glow** creating a celebratory atmosphere
  - The ENTIRE space must INSTANTLY communicate "${festivalName} is being celebrated here"`,
    headerColors: `Premium festive gradient in colors traditionally associated with ${festivalName} — rich, celebratory, culturally authentic palette`,
    headerPatterns: `Subtle ${festivalName}-related motifs, traditional patterns, and cultural symbols as watermark elements at 10-15% opacity`,
    headerAccents: `Gold and festival-appropriate color accents, warm glow effects, traditional border patterns`,
    mood: `Deeply festive, culturally authentic, celebratory, premium — top-tier ${festivalName} corporate greeting`,
    culturalElements: `Traditional cultural elements, symbols, and decorations specific to ${festivalName}`,
    lightingStyle: `Warm golden festive lighting with traditional lamp glows — creating an inviting ${festivalName} celebration atmosphere`,
    floorDecor: `Beautiful rangoli/kolam with flower petals in ${festivalName}-appropriate colors and patterns`,
    backgroundElements: `Festival decorations should DOMINATE the background — cultural elements, flowers, lamps should completely transform the space into a ${festivalName} celebration venue with company logo visible but secondary to the festive setup`
  };
};

// ===== END OF FESTIVAL THEME SYSTEM =====

export const getAttireMode = (attireType: string, businessType: string = 'default', businessContext: string = '') => {
  if (attireType === 'traditional') {
    const sareeColor = getSareeColorForBusiness(businessType);
    return `Attire: premium traditional Indian saree — ${sareeColor}. High-quality fabric, crisp pleats, natural realistic folds, elegant and luxurious advertising look.`;
  } else {
    const suitPalette = getProfessionalSuitPaletteForBusiness(businessType, businessContext);
    return `Attire: premium business-specific luxury campaign suit.
Preferred Colors: ${suitPalette}.
Style: well-tailored feminine blazer, crisp white fitted blouse, slim formal trousers, delicate gold chain, and small premium studs.
Look: youthful Indian brand ambassador with polished beauty, real corporate-luxury styling, premium commercial realism, and a palette chosen for this exact business instead of the same beige suit used for every client. Treat the color direction as an approved palette family with multiple valid tones rather than one repeated beige across every frame.`;
  }
};

export const getAdTypeMode = (adType: string, festivalName = '') => {
  if (adType === AdType.FESTIVAL) {
    return `Overall look & mood: premium **${festivalName} business greeting** start image — powerful, celebratory, trustworthy, aspirational. Feels like a national-level brand advertisement.`;
  } else {
    return `Overall look & mood: premium **business brand-intro start image** — powerful, aspirational, authoritative, trustworthy. Feels like a national-level brand advertisement.`;
  }
};

export const MAIN_FRAME_SYSTEM_PROMPT = (attireType: string, adType: string, festivalName: string, aspectRatio: string = '1:1', businessContext: string = '') => {
  const isFestival = adType === AdType.FESTIVAL && festivalName;
  const festivalTheme = isFestival ? getFestivalTheme(festivalName) : null;
  const isProfessional = attireType === 'professional';
  const detectedBusinessType = businessContext ? detectBusinessType(businessContext) : 'default';
  const educationEnvironmentMode = detectedBusinessType === 'education' ? detectEducationEnvironmentMode(businessContext) : null;
  const clientEnvironmentGuidance = businessContext ? getEnvironmentForBusiness(detectedBusinessType, businessContext) : '';
  const clientLocationPlan = businessContext ? getCommercialLocationPlanForBusiness(detectedBusinessType, businessContext) : '';
  const clientEnvironmentNegatives = businessContext ? getEnvironmentNegativeRules(detectedBusinessType, businessContext) : '';
  const clientLogoPlacementGuidance = businessContext ? getRealisticLogoPlacementGuidance(detectedBusinessType, businessContext) : '';
  const clientSpecificCommercialEnvironmentBlock = !isFestival && businessContext
    ? `**CLIENT-SPECIFIC ENVIRONMENT ANCHOR (NON-NEGOTIABLE FOR THIS CAMPAIGN):**
• Detected business type: ${detectedBusinessType}${educationEnvironmentMode ? ` (${educationEnvironmentMode === 'institution' ? 'college / school / institute campus mode' : 'education consultancy mode'})` : ''}
• Preferred real-world environment: ${clientEnvironmentGuidance}
• Preferred location ladder for this client: ${clientLocationPlan}
• Hard negatives: ${clientEnvironmentNegatives}
• Realistic logo installation surfaces: ${clientLogoPlacementGuidance}

`
    : '';

  // ===== COMMERCIAL FIRST FRAME (SUIT OR SAREE) — COMPACT EXAMPLE-FORMAT PROMPT =====
  // Mirrors the user's proven "first frame" prompt structure: short, clean, sectioned,
  // brand-driven attire colour, real business reception background, no negative-prompt block.
  if ((isProfessional || attireType === 'traditional') && !isFestival) {
    const isTraditional = attireType === 'traditional';
    const brandSuit = getBrandDrivenSuitPaletteFromContext(businessContext);
    const suitColourHint = brandSuit
      || 'a rich brand tone such as maroon, deep navy, emerald, charcoal, plum, coffee-cream, ivory-gold, or black-and-gold';
    const sareeColourHint = getSareeColorForBusiness(detectedBusinessType);
    const receptionGuidance = clientEnvironmentGuidance
      || 'a premium, real reception interior whose desk, signage, furniture and props clearly match the exact business type';
    return `You are an expert prompt writer for ultra-realistic AI image generation. Using the attached business details and logo, write ONE clean, copy-paste-ready image prompt for the FIRST FRAME of a commercial brand ad.

STEP 1 — ANALYSE THE ATTACHED FILES AND EXTRACT: business name, business type / industry, the main services they offer, and the brand colours from the logo.
STEP 2 — BUILD THE WHOLE SCENE FROM THIS EXACT BUSINESS (NON-NEGOTIABLE). The environment and background MUST be 100% relatable to the provided business: use the business name, services, products, and description to recreate THIS business's real reception, including the specific equipment, products, displays, counters, and service cues that make it instantly recognisable as this exact business. A viewer must immediately know what this business does just from the background. Never use a generic, random, unrelated, or "any office" background.

Output the prompt EXACTLY in the following structure and order, as simple short bullet lines (no commentary, no markdown headings, inside one code block):

Create an ultra-realistic promotional portrait for "[BUSINESS NAME]" using the attached official logo as branding reference.

Generate a premium [BUSINESS TYPE] reception environment and place a confident young Indian girl (a professional [role that fits this business]) standing in front of the reception area. The atmosphere should feel [3-4 adjectives that match this business].

Main Character:
- Indian girl (female), age 20–25
- A NEW, different, naturally good-looking girl each time — never reuse the same recurring face
- Natural warm Indian complexion, real skin texture, light natural makeup, neat natural black hairstyle
- Friendly welcoming smile, confident and approachable expression, looking directly at the camera
${isTraditional ? `- Wearing an elegant premium designer saree (graceful, sophisticated, modest, premium) with a well-fitted blouse — NOT a suit
- Saree colour inspired by the logo / brand colours (for example ${sareeColourHint}); make it look like an expensive designer campaign saree — never bridal, never a costume, never festival-styled
- Wearing elegant traditional semi-jewellery (MANDATORY): a necklace or chain on the neck, earrings, a few bangles, a small finger ring, and a small bindi on the forehead — refined and premium, never heavy bridal overload` : `- Wearing simple elegant jewellery (MANDATORY): a small finger ring, a thin necklace or chain on the neck, ear studs / earrings, a wristwatch, and a small bindi on the forehead
- Wearing a premium tailored formal suit (not saree): blazer + crisp white or cream inner shirt + formal trousers
- Suit colour inspired by the logo / brand colours — pick ONE specific brand tone (for example ${suitColourHint}); avoid the same beige and avoid a repetitive plain blue corporate suit`}

Pose:
- Standing in the exact middle of the [BUSINESS TYPE] reception, facing the camera directly
- Both hands positioned at the lower waist level, right hand lightly resting over the left hand, fingers naturally relaxed and partially overlapping — formal front-clasp corporate pose (no crossed arms, no pockets, no hand gestures)
- Calm, confident, welcoming standing posture

Background:
- A real, premium reception interior of THIS exact [BUSINESS TYPE] — instantly recognisable as this specific business from its real equipment, products, displays, furniture, and service cues
- Fill the space with the SPECIFIC real elements this business actually uses (derived from the provided business name, services, and description) — real functional equipment, products, counters, furniture and natural props that prove what this business does — as solid real objects (NOT empty frames, blank boards, or placeholder signage) and with no readable text on them
- Reference for the kind of real physical setting (use only as a guide for the type of objects, not as fixed wording): ${receptionGuidance}
- If any store/office reference images are provided, mirror their real interior, layout, and materials
- It must read as a genuine, operational [BUSINESS TYPE] — realistic and 100% relatable to this exact business, never fake, generic, or unrelated
- Place the attached logo naturally as a real, SMALL-to-medium wall sign on the reception back wall behind the girl — fully visible and uncropped, realistically integrated, and DYNAMICALLY sized to the free wall space around her. The logo is clearly secondary to the girl: keep it modest, never large or dominating, and never shrink or push the girl smaller just to fit the logo
- LOGO SHARPNESS (IMPORTANT): reproduce the attached logo exactly and keep it perfectly SHARP and in focus — do NOT blur or soften it with depth of field — so every letter and all text in the logo stays crisp and clearly readable
- TEXT RULE (STRICT — VERY IMPORTANT): the attached logo is the ONLY text or branding anywhere in the entire image. Do NOT add or invent ANY other text — no words, letters, numbers, dates, academic years, taglines, slogans, mission lines, service lists, or signage. Reproduce the attached logo exactly and never add extra words above, below, or around it
- NO FRAMES / DISPLAYS / PLACEHOLDERS (IMPORTANT): do NOT add ANY wall frames, picture frames, photo frames, certificate frames or certificate walls, rows of framed certificates, staff / employee / student photo walls or portrait galleries, "wall of fame", achievement / award / "success" / proof / display walls, photo walls, notice boards, posters, standees, brochures, banners, or blank / dark screens — NEITHER empty NOR filled (empty ones look like cheap cardboard, and filled ones force fake text and fake faces). Never describe "empty frames", "frames to hold photos", "displays without text", "certificate wall", or "staff photos". Walls stay clean and uncluttered, carrying ONLY the attached logo plus real, natural elements (soft wall texture, warm lighting, plants, and the business's real in-use objects)

Visual Style:
- Ultra realistic photography, cinematic indoor lighting, natural skin texture, premium colour grading, realistic reflections and shadows, clean polished environment

Composition:
- Aspect ratio: 9:16 vertical
- Three-quarter shot: frame the girl from the top of her head down to roughly her thighs / knees — do NOT show her full head-to-feet (that makes her look small and distant)
- The girl must clearly fill about 70% of the frame height, centred and dominant, with only a little headroom above her head, and the reception and logo clearly visible behind her
- PRIORITY (IMPORTANT): the girl's ~70% size always comes first; size the logo and background to fit around her. NEVER enlarge the logo at the cost of the girl — if wall space is tight, make the logo smaller, not the girl
- Leave natural headroom for future talking-video animation

Important:
- Use the attached logo only as real environmental branding on the wall, fully visible and complete
- Keep the look premium, professional, realistic, and appropriate to this exact business

Fill every [BRACKET] with the real extracted business details. Output ONLY the final image prompt above, inside one code block, with no explanations.`;
  }

  return `You are an AI assistant specialized in generating START-FRAME IMAGE PROMPTS for business ads and brand intro creatives.

WORKFLOW RULES (MANDATORY):
When business details are provided, generate ONE final output:
• A SINGLE ultra-detailed, copy-paste-ready IMAGE GENERATION PROMPT
• The output MUST be inside a CODE BLOCK
• Do NOT include explanations unless asked
• Do NOT mention video, clip, cinematic, motion, or frame

FIRST: Analyze all provided files and EXTRACT:
1. Business Name
2. Business Type / Industry
3. Services offered
4. Any theme or occasion (festival, Republic Day, etc.)
5. Brand colors from logo

===== EXACT OUTPUT FORMAT (FOLLOW THIS STRUCTURE PRECISELY) =====

Your output prompt MUST follow this EXACT structure with these EXACT section headers:

---START OF PROMPT FORMAT---

${!isFestival ? `CASTING OVERRIDE — THIS IS MANDATORY:
This is NOT a corporate headshot. This is NOT a stock photo shoot.
This is a HIGH-BUDGET NATIONAL BRAND CAMPAIGN.
The model must be in the top 0.1% of female beauty.
She must have the kind of face that makes a viewer stop scrolling.
She must look like she was handpicked by a luxury brand's
creative director after reviewing 500 candidates.
REJECT any average face. REJECT any plain face.
REJECT any forgettable face.
If she does not look like a Bollywood A-list leading actress
or a face you would see on a Lakme / Tanishq / Malabar Gold
national TV commercial — REGENERATE.

` : ''}Create a Ultra-realistic DSLR photograph, single image, 9:16 vertical — must look like a real, high-budget national [BUSINESS TYPE] ${isFestival ? `**${festivalName} celebration** ` : ''}photoshoot, absolutely no AI-art, no rendering, no stock-photo feel. Indistinguishable from a real professional photograph.${isFestival ? `
**THIS IS A ${festivalName.toUpperCase()} THEMED IMAGE — the business premises must still feel real and operational, while festival cues are layered in naturally and tastefully.**` : ''}

SUBJECT (PREMIUM BRAND AMBASSADOR — FEMALE ONLY — MUST FEEL DISTINCT TO THIS BUSINESS):
One exceptionally photogenic Indian woman chosen as the **exclusive brand ambassador for THIS specific business campaign**${isFestival ? ` during ${festivalName}` : ''}.
She must look premium, aspirational, believable, and naturally striking — the kind of woman a serious brand would cast for a real ad campaign.
${!isFestival ? `**INDIAN-ONLY CASTING RULE (ABSOLUTE):** She must read clearly and unmistakably as Indian only — never ethnically ambiguous, never westernized, never caucasian, never latina, never east-asian, never middle-eastern, and never a generic global stock-model beauty pattern.
She should feel like a wonderful premium North Indian brand ambassador chosen specifically for this client, with business-specific casting energy instead of a reused universal ad face.
` : ''}
**Do NOT default to the same face used in other ads.** Create ONE unique ambassador identity for this business based on the business type, brand tone, festival/commercial mood, attire style, and environment.
Choose an age band that fits the brand positioning — strictly 20 to 25 only — and keep that same woman consistent across all clips in this campaign.
Do NOT imitate a specific actress, do NOT describe her as a South Indian film actress, do NOT use one generic celebrity face pattern, and do NOT drift away from clear Indian identity in any clip.
${!isFestival ? `${isProfessional ? `
SUBJECT — THE GIRL (PROFESSIONAL SUIT, FRESH CASTING EACH TIME — MANDATORY):
A genuinely beautiful, youthful Indian girl, strictly 20 to 25 years old, cast as the exclusive brand ambassador for THIS business.
• NEW GIRL EVERY TIME (CRITICAL): each generation must produce a NEW, different, unique girl — vary the face shape, features, hairstyle, and complexion within natural Indian casting, and NEVER reuse the same recurring ad face. Two different businesses must clearly look like two different girls.
• Clearly and unmistakably Indian — natural warm Indian complexion (honey, wheatish, golden-brown, or fair-Indian), never ethnically ambiguous, never westernized, never pale-pink or grey.
• Naturally pretty and photogenic with soft feminine features, bright expressive eyes, clean brows, and a fresh radiant glow — premium and aspirational but believable and human, not plastic, not doll-like, not over-sculpted.
• Real skin truth: visible pores, natural micro-texture, soft tonal variation, no beauty-filter, no waxy or over-smoothed finish.
• Light, camera-ready makeup only — softly defined eyes, a subtle nude-rose or warm lip, gentle blush; no heavy glamour, no smoky eye, no spectacles.
• EXPRESSION: a real, warm, confident smile that reaches the eyes, looking directly into the lens — friendly, trustworthy, and approachable, never blank, stiff, or corporate-cold.` : `
FACE — LUXURY CASTING BRIEF (MANDATORY):
- Face shape: Perfect oval — the mathematically ideal face
  shape for screen — soft but defined, no harshness
- Eyes: LARGE almond-shaped eyes — the dominant feature of
  her face — deep dark brown iris with natural limbal ring —
  bright whites with no redness — thick natural lashes with
  subtle kajal/kohl lining the waterline — the eyes must feel
  like they are PULLING the viewer in — expressive, deep,
  luminous — like Deepika Padukone's eye shape and intensity
  as a REFERENCE TIER only, NOT her face
- Eyebrows: Thick, perfectly arched, naturally full —
  groomed but not drawn-on — strong brows that frame
  the eyes with power
- Nose: Slender, straight, refined — narrow bridge —
  delicate tip — the kind of nose a casting director
  calls "photogenic" — not sharp, not wide, balanced
- Lips: Full, naturally defined cupid's bow — upper lip
  has clear arch — lower lip is plump — lips look naturally
  soft and lush — wearing a warm nude-rose or
  classic warm red lip color
- Cheekbones: HIGH and subtly prominent — catching the
  studio light — creating a natural shadow below —
  the hallmark of a photogenic face
- Jawline: Clean V-shaped feminine jaw — no double chin —
  elegant neck — the jaw frames the face like a portrait
- Chin: Slightly pointed, delicate — feminine and refined
- Skin: FRESH RADIANT Indian complexion with natural glow —
  smooth clear complexion with visible pores and true skin
  texture — dewy healthy glow from within — NOT matte, NOT flat —
  light catching the high points (cheekbones, brow bone,
  cupid's bow) naturally — visible micro-texture showing
  this is a real photograph — no plastic skin, no filter

MAKEUP — HIGH-FASHION EDITORIAL LEVEL:
- Base: Full-coverage dewy foundation — luminous finish —
  skin looks perfected but REAL — warm golden undertone
  matching her skin — subtle highlight on cheekbones,
  bridge of nose, and brow bone catching the light
- Eyes: Defined with warm brown eyeshadow — subtle shimmer
  on the lid — black kajal on waterline — well-separated
  mascara making lashes look long and full — NOT heavy
  dramatic smoky eye — refined, editorial, powerful
- Brows: Filled in, structured, full — architectural
  feature of her face
- Lips: Warm nude-rose OR classic red — glossy-satin finish —
  NOT bare, NOT nude-nude — COLOR must be visible and
  intentional — this is a CAMPAIGN shoot, not a selfie
- Blush: Warm peachy-rose — applied to the apples of
  the cheeks and swept toward temples — giving her a
  healthy flushed glow
- Contour: Subtle — defining the cheekbones and jawline
  without looking overdone
- Overall: She must look like she just walked out of a
  2-hour professional makeup session for a magazine cover —
  polished, intentional, flawless but human`}` : `
Facial characteristics (MANDATORY — REAL PREMIUM BEAUTY, NOT AI GLAMOUR):
• Naturally attractive North Indian facial structure with refined proportions — premium but believable, not plastic, not doll-like
• Strong screen presence with expressive eyes and confident warmth
• Healthy, realistic skin texture with visible pores, smooth clear complexion, micro texture, soft tonal variation, and true photographic realism
• **NATURAL INDIAN COMPLEXION ONLY** — warm, neutral, honey, wheatish, brown, or golden-brown undertones chosen to suit the brand; never pink, never grey, never artificially pale
• Defined but natural brows, elegant nose, real lips, clean jawline — avoid over-sculpted AI perfection
• Makeup must be premium and camera-ready but realistic: softly defined eyes, clean skin finish, subtle lip tone, no loud glamour styling unless the business genuinely demands it
• Expression must feel emotionally appropriate to the business: welcoming, trustworthy, poised, proud, luxurious, warm, confident, and approachable
• No plastic skin, no beauty-filter effect, no over-smoothing, no waxy highlights, no unrealistic symmetry obsession
• She should feel like a real premium campaign model photographed by an elite commercial photographer with positive, energetic, intelligent young professional presence`}

${!isFestival ? `
HAIR — LUXURY BLOWOUT / STYLED:
${attireType === 'professional' ? `SUIT BRANCH:
Strictly natural rich black hair ONLY from the very first frame onward — no brown, no auburn, no burgundy, no copper, no highlights, no sun-browned ends, and no lighting-induced color shift.
Silky dark black hair with a polished luxury finish —
professionally groomed, healthy shine, soft controlled movement —
styled as a premium blowout, refined straight finish, or
elegant soft waves or a neat half-open graceful styling that flatters the face without becoming casual —
camera-ready, feminine, and expensive-looking —
NOT flat, NOT frizzy, NOT messy, NOT stiff corporate hair —
styled by a professional and consistent with a real luxury
commercial photoshoot` : `SAREE BRANCH:
Strictly rich natural black hair ONLY — no brown, no auburn, no burgundy, no highlighted strands, no sun-browned ends, no artificial color cast.
Soft voluminous black waves tumbling past the shoulder —
OR a low glamorous black side bun with loose face-framing
tendrils — OR a voluminous half-up with cascading black waves —
must have TEXTURE and MOVEMENT —
NOT flat pressed hair —
the kind of luxurious black hair seen in top Indian film campaigns — as a TIER reference only, NOT their face`}

EXPRESSION — STAR QUALITY (MANDATORY):
- She is SMILING — a real, warm, confident smile —
  NOT a forced corporate smile — NOT a neutral face —
  NOT a serious face — a genuine, radiant smile that
  reaches her eyes and creates subtle laugh lines
- Her eyes are ALIVE — engaged, direct, magnetic —
  she is looking directly into the camera as if she
  owns the shoot
- Body language: Relaxed confidence — one shoulder
  slightly forward — weight slightly shifted —
  NOT standing at attention like a soldier —
  natural ease of someone who has done 100 photoshoots —
  the posture of a woman completely comfortable
  being photographed
- Overall energy: WARM, ASPIRATIONAL, POWERFUL —
  the viewer should feel: "I want to be her" or
  "I trust her" — she is selling a dream

${isProfessional ? `POSE & FRAMING (HERO FIRST FRAME — MANDATORY):
- The girl stands in the EXACT CENTER of the 9:16 frame with balanced left-right spacing, occupying roughly 70% of the frame height — a medium full / three-quarter standing shot, never a tight head-and-shoulders crop.
- HANDS (STRICT RULE): Both hands positioned at the lower waist level, right hand lightly resting over the left hand, fingers naturally relaxed and partially overlapping, no crossed arms, no pockets, no hand gestures, formal front-clasp corporate pose.
- Standing tall and professional, shoulders square to camera, chin level, calm confident welcoming posture, looking directly into the lens.
- Camera at chest / eye level with the business reception clearly visible behind her.` : `POSE ANCHOR FOR THE HERO MAIN FRAME (MANDATORY):
- The hero or anchor image must be EXACTLY centered with
  balanced left-right spacing
- Hands gently folded at the waist or lower abdomen, one
  hand resting over the other, fingers relaxed
- Camera at chest level, mid-shot framing only, with a calm,
  premium, welcoming posture`}` : `POSE & FRAMING (PREMIUM COMMERCIAL PHOTOGRAPHY — NATURAL VARIATION ALLOWED):
• Close mid-shot only (head to upper waist / upper torso) — never full-body, never wide enough to weaken the model's presence
• For professional suit outputs, Clip 1 must use the same hero pose as the traditional and festival anchor frames: EXACTLY centered with balanced left-right spacing and hands gently folded at the waist, one hand resting over the other
• From Clip 2 onward, hand position, body angle, and pose energy must change according to that clip's exact voice-over script, business proof point, and location instead of repeating the folded-hands hero pose
• Camera should remain premium and intentional — mostly chest-level or eye-level, with modest angle changes only when they improve realism and storytelling
• Hands and posture must feel graceful and believable — allow variation based on the location and shot purpose instead of forcing the same folded-hands pose every time
• Body language must feel poised, elegant, and premium — never stiff, never mannequin-like, never awkward
• The model must occupy roughly 70% of the total frame height in EVERY clip while still leaving enough space to clearly show the business environment
• The framing must feel close-up and dominant in EVERY clip — the model is the hero and must visually command the frame
• Direct eye contact with the camera is MANDATORY in EVERY clip — she must look straight into the lens, never away from camera, never toward products, never into the distance

HAIR (LUXURY GROOMING — CONSISTENT WITHIN THE CAMPAIGN):
Choose one premium hairstyle family that suits the business, attire, and mood — soft waves, polished straight styling, elegant ponytail, refined bun, or neatly draped traditional styling.
Hair color is STRICTLY natural rich black in EVERY clip and EVERY ad type — never brown, auburn, burgundy, copper, highlighted, or color-shifted by lighting.
Hair must look healthy, professionally groomed, and camera-ready, with natural movement and slight flyaways allowed for realism.
Keep the hair identity consistent across the campaign, but allow small natural shifts in fall, volume, and drape between clips.`}

${isFestival && festivalTheme ? `ATTIRE (ULTRA-LUXURY — BUSINESS SECTOR + ${festivalName.toUpperCase()} FESTIVAL BLEND — MANDATORY):
The saree MUST be **DYNAMIC and UNIQUE based on the business sector** — NOT the same saree for every business.
• Base festival theme: **${festivalTheme.sareeColor}**
• BUT the saree color MUST ALSO incorporate the **business brand colors** from the logo
• For example: A medical clinic celebrating ${festivalName} should have different saree tones than a real estate company celebrating ${festivalName}
• The saree should feel like it was CHOSEN specifically to represent THIS particular business during ${festivalName}
• Blend the festival celebration spirit with the business brand identity in the saree design
• **FABRIC MUST LOOK OUTRAGEOUSLY EXPENSIVE** — pure handwoven Kanchipuram / Banarasi / Kanjeevaram silk with real gold zari work, intricate temple borders, heavy premium silk with **natural gravity, deep folds, and realistic creases that scream luxury**
• The saree must look like it costs ₹50,000–₹2,00,000 — the kind worn at film premieres or luxury brand launches
• Pallu drape must be elegant, heavy, and gravity-realistic — NOT flat, NOT stiff
• Styling must feel film-industry celebrity level, not catalog or wedding shoot
• The attire must complement BOTH the business type AND the ${festivalName} decorations

JEWELLERY (LUXURIOUS CELEBRITY-LEVEL — MANDATORY):
**${festivalTheme.jewellery}**
For saree outputs, jewellery must stay STRICTLY semi-jewellery only — premium, elegant, feminine, clearly visible, but never heavy, never bridal, never overloaded.
Use tasteful gold or gold-diamond semi-jewellery only: refined necklace, elegant earrings, and limited bangles when needed.
NEVER use heavy bridal sets, temple-jewellery overload, chunky layers, or religious accessories.` : `ATTIRE (BUSINESS-THEMED COLOR — MANDATORY — MUST BE DYNAMIC PER BUSINESS):
${attireType === 'traditional' ? `ATTIRE (COMMERCIAL DESIGNER SAREE — BUSINESS-SPECIFIC LUXURY — MANDATORY):
This is a COMMERCIAL campaign saree branch — not a festival greeting saree, not bridal styling, and not a wedding-catalog look.
The saree must feel like it was chosen specifically for THIS business's premium national campaign.
• Start from the actual business identity: logo colors, brand tone, business category, and the material language of the premises must influence the saree direction
• The saree MUST be **DYNAMIC and UNIQUE per business sector** — do NOT reuse one safe pastel saree across different clients
• When the brand supports modern corporate elegance, prefer refined soft pastel or muted-tone sarees with clean designer restraint, polished drape, and a youthful premium blouse silhouette
• For stronger luxury businesses, the saree may become deeper, richer, or more dramatic — but it must still read as a commercial campaign wardrobe, never bridal overload and never festival-specific celebration styling

Color guide by business type (each MUST feel like a distinct luxury campaign wardrobe decision):
• Medical/Healthcare: elegant ivory / pearl white / sterile soft blue silk with restrained zari accents — clinical clarity with premium grace
• Real Estate: deep royal blue, emerald, sandstone-gold, or powerful jewel-tone silk with authoritative premium richness
• Fashion/Boutique: rich wine, couture mauve, deep plum, or editorial pastel silk with refined designer finish
• Food/Catering: warm maroon, saffron-gold, caramel, or tasteful inviting jewel tones that still photograph as upscale hospitality luxury
• Tech/Software/Agency: navy, charcoal-silver, graphite-blue, steel-toned tissue silk, or modern cool-luxury palettes with subtle geometric detail
• Education/Consultancy: deep academic blue, dignified forest green, parchment-cream, or heritage luxury tones with controlled elegance
• Solar/Energy: premium green-blue, sage-gold, sunlit emerald, or progressive clean-energy luxury tones
• Laundry/Wash: pearl ivory, champagne beige, powder blue, or pristine clean luxury hues with believable silk sheen
• Tea/Beverage: leaf-green, warm gold, earthy maroon, or plantation-rich premium tones that still feel polished and modern
• Jewellery: deep maroon, royal plum, luxe cream-gold, or boutique-showroom silk with expensive rich depth
• Electrical/Hardware: steel grey, deep blue, graphite-silver, or premium industrial-luxury tones with restrained zari detail
• Default: derive the saree palette from the strongest business colors and interior material cues while keeping it campaign-worthy and unmistakably premium

**CRITICAL: Each business MUST get a VISUALLY DIFFERENT saree based on its sector, palette, and brand mood.**

**FABRIC MUST LOOK UNEQUIVOCALLY EXPENSIVE** — premium handwoven silk, Banarasi/Kanchipuram/Kanjeevaram families, or equivalent designer-level fabric with believable gravity, deep folds, refined texture, and real silk sheen under business lighting.
• The saree must look like a top stylist selected it for a serious ad campaign — expensive, camera-ready, graceful, and memorable, yet still believable inside a real office/store environment
• Pallu drape must be elegant, weighty, and gravity-realistic — never flat, never cardboard-stiff, never synthetic costume cloth
• The blouse must feel tailored and premium, with youthful charm, sharp fit, polished finishing, and zero generic wedding-blouse energy
• For saree outputs, the jewellery must stay STRICTLY semi-jewellery only — elegant, feminine, clearly visible, premium, and controlled, never heavy, never bridal, never overloaded
• Commercial traditional saree output must preserve visible pores · micro skin texture · soft tonal variation · truthful Indian complexion · true photographic realism — never bridal-doll glam, mannequin polish, catalog stiffness, or synthetic beauty
• HARD NEGATIVE: no wedding-stage styling, no temple-jewellery overload, no festive garlands, no bridal makeup, and no generic "traditional wear" shortcut that ignores the actual business identity` : `ATTIRE (BRAND-DRIVEN PREMIUM SUIT — VARIED PER BUSINESS — MANDATORY):
The girl wears a premium, well-tailored formal women's suit (blazer + inner blouse + formal trousers) — a luxury commercial campaign look, never generic officewear, never a stock corporate portrait, never saree-led, and never decorated with festival or cultural props.
• SUIT COLOR — BRAND-DRIVEN AND VARIED (CRITICAL): choose the suit color from the client's logo and brand identity — for example elegant maroon, deep navy, coffee-cream, charcoal, emerald, plum, ivory-gold, or black-and-gold — picking the tone that matches THIS brand.
• DO NOT default to the same beige/pastel suit, and DO NOT use a plain bright-blue corporate suit, for every client — different businesses must get visibly different suit colors, and the color must not repeat identically across generations.
• BLAZER: premium well-tailored blazer in the chosen brand color with elegant waist definition, refined shoulder structure, clean lapel roll, and expensive matte-luxe suiting texture.
• BLOUSE: crisp white fitted blouse or shirt under the blazer — clean collar line, fresh contrast, and a polished professional finish.
• TROUSERS: slim formal trousers in the same suit family — straight or gently tapered, graceful premium drape, clean hem, and a sharp luxury-commercial silhouette.
• Fabric: expensive matte-luxe suiting with believable weight, sleeve fall, and natural movement — never shiny polyester, never stiff costume fabric.
• Keep the styling premium, feminine, and youthful — the girl should look glamorous, warm, and confident in the suit, never plain, severe, or matronly.
• Hair: silky natural rich black hair only, healthy shine, refined blowout / straight finish / soft waves that flatter the face.
• HARD NEGATIVE: no saree in this branch, no casual wear, no plain receptionist / HR / ID-photo look, no spectacles, no festival or cultural props.`}

JEWELLERY (MANDATORY — ALWAYS REQUIRED):
**Jewellery is NON-NEGOTIABLE and must ALWAYS be present:**
• For saree/traditional outputs: semi-jewellery only — refined necklace, elegant earrings, and limited bangles with premium controlled styling
• For professional outputs: semi-jewellery only — one delicate elegant gold chain necklace, small premium stud earrings or tiny elegant jhumkas, and optionally one thin gold bangle on one wrist
• NO heavy temple jewellery
• NO layered chains
• NO chunky pieces
• NO bridal-jewellery overload
Jewellery must feel understated, expensive, actress-style, and strictly semi-jewellery for both saree and professional suit outputs.`}

${isFestival && festivalTheme ? `ENVIRONMENT (REAL [BUSINESS TYPE] OFFICE/STORE WITH ${festivalName.toUpperCase()} DECORATIONS — MOST CRITICAL SECTION):
**The background MUST look like the REAL office/store of this specific [BUSINESS TYPE] business first; ${festivalName} decoration is a secondary layer, not a replacement set.**

**STEP 1 — RECREATE THE REAL BUSINESS PREMISES (DOMINANT BASE LAYER):**
Build a believable, operational [BUSINESS TYPE] location using extracted business details, store/office images, products, signage, and brand cues.
If actual store or office images are available, mirror their architecture and material reality: wall finishes, flooring, counters, shelving, furniture, equipment, display layouts, lighting fixtures, aisle widths, partitions, glass reflections, and real working-area depth.
Business-specific elements MUST remain clearly visible so the viewer instantly recognizes the business category.

**STEP 2 — ADD CONTROLLED ${festivalName.toUpperCase()} CUES (SUPPORTING LAYER ONLY):**
Add tasteful ${festivalName} decoration as if the real staff decorated their actual premises for the festival.
Festival decoration should enrich roughly 20% to 35% of the visible scene, while the business environment remains the dominant location anchor.
Use only the festival elements that can realistically fit inside a real office/store without turning it into a temple, wedding hall, palace, movie set, or generic celebration stage.

**FESTIVAL CUES TO INCORPORATE NATURALLY:**
• Cultural inspiration: ${festivalTheme.culturalElements}
• Floor / entry decoration inspiration: ${festivalTheme.floorDecor}
• Lighting inspiration: ${festivalTheme.lightingStyle}
• Mood target: ${festivalTheme.mood}

**REALISM RULES:**
• The business identity must stay obvious at first glance
• Decorations must sit on real counters, real walls, real entrances, real display zones, and real circulation space
• Keep believable depth, materials, lighting falloff, and operational details — not a flat decorative backdrop
• Do NOT overwhelm the location with festival props; the office/store must still feel like the actual business

LOGO PLACEMENT (CRITICAL — DO NOT MODIFY THE LOGO):
Take the ATTACHED LOGO image and place it exactly as-is as real physical signage already mounted in the premises.
• The logo must remain pixel-perfect and unchanged
• Mount the logo in the upper background behind the subject as real wall signage so it is fully readable and fully visible in one piece
• Decorations may frame it lightly, but must not block, crop, redraw, stylize, blur, tilt, stretch, or overpower it
• The model, hair, shoulders, props, or furniture must never cover any part of the logo
• The signage should feel naturally installed in the real office/store, not pasted onto a fake backdrop

**THE FINAL IMPRESSION:**
The viewer should feel: "This is the real business premises, beautifully and believably decorated for ${festivalName}."` : `ENVIRONMENT (REAL BUSINESS PREMISES — MOST CRITICAL SECTION):
**The background MUST look like the REAL operating [BUSINESS TYPE] premises first; premium commercial polish is a supporting layer, not a replacement set.**

${clientSpecificCommercialEnvironmentBlock}

**STEP 1 — RECREATE THE REAL BUSINESS PREMISES (DOMINANT BASE LAYER):**
Build a believable, operational [BUSINESS TYPE] location using extracted business details, store/office images, products, signage, brand cues, and spatial evidence.
If actual store or office images are available, mirror their architecture and material reality: wall finishes, flooring, counters, shelving, cabinetry, furniture, equipment, lighting fixtures, aisle widths, partitions, glass reflections, display rhythm, and real working depth.
Business-specific elements MUST remain clearly visible so the viewer instantly recognizes the business category without guessing.

**STEP 2 — ADD BUSINESS-PROOF LAYER (SUPPORTING BUT CLEARLY VISIBLE):**
Choose the exact functional zone that proves the spoken selling point of that clip.
Use real proof elements that belong to this business: consultation desks, reception counters, treatment bays, product displays, certification walls, sample boards, workstations, shelving, demo tables, waiting zones, service counters, brochure stands, branded installations, or equipment clusters relevant to the line.
The proof layer should occupy meaningful visual space in the frame — not disappear into a generic blur.

${isProfessional ? `**STEP 3 — ADD PREMIUM CORPORATE ATMOSPHERE (WITHOUT CATEGORY DRIFT):**
For the hero first frame, the girl stands directly in front of THIS business's own reception / front desk, with the branded reception back wall behind her. The background must clearly read as this exact business's reception — using the real business type, signage, counter, and proof cues — and must NEVER be a generic, fake, or unrelated backdrop.
For professional suit outputs, build a bright executive-facing or consultation-facing zone with natural daylight, refined wood/stone/glass materials, indoor greenery, clean desk surfaces, subtle laptop or notebook presence when natural, and premium front-office polish.
The atmosphere must feel like a real on-location corporate/business environment captured on its best day — never a fake luxury hall, hotel lobby, generic coworking stock background, or empty boardroom set.
Never introduce festival decorations, celebration props, garlands, diyas, rangoli, or cultural-event cues in this professional commercial branch.` : `**STEP 3 — ADD PREMIUM COMMERCIAL ATMOSPHERE (WITHOUT FESTIVAL OR BRIDAL DRIFT):**
For commercial traditional saree outputs, keep the real business premises dominant while elevating the scene through premium counters, polished display surfaces, refined signage, believable glass/reflection behavior, rich but realistic materials, and commercial lighting that flatters both the ambassador and the business.
The space must feel aspirational and expensive, but still like a real business captured on its best day — never a wedding hall, festival stage, palace set, or generic luxury backdrop.`}

**REALISM RULES:**
• The business identity must stay obvious at first glance
• Premium polish must come from real materials, real lighting falloff, real reflections, and real working surfaces — not fake set dressing
• The chosen background zone must visibly prove the exact voice-over meaning of that clip
• Keep believable circulation space, depth, operational details, and material transitions — not a flat decorative backdrop
• The environment should feel dense, specific, and premium without becoming cluttered, theatrical, or category-confused
${!isFestival && businessContext ? `• Hard-negative drift to reject for this client: ${clientEnvironmentNegatives}
` : ''}

COMMERCIAL REALISM FORMULA (MANDATORY — DO NOT WEAKEN):
• FACE ANCHOR: wonderful premium Indian ambassador face with Bollywood-heroine-tier screen presence, brand-ambassador polish, and photogenic sharp attractive features
• LIGHT SOURCE: natural daylight from the left-side window or believable left-side daylight direction with soft cinematic fill light
• SKIN TRUTH: visible real pores, natural skin texture, dewy complexion, soft tonal variation, real micro-highlights, and zero beauty-filter smoothing
• SCENE DEPTH: real architectural interior of the actual business with natural depth separation and softly blurred background depth — never a studio backdrop
• CAMERA PHYSICS: Canon EOS R5 realism, 85mm f/1.8 portrait look, shallow depth of field, natural color science, and true DSLR focus falloff

LOGO PLACEMENT (CRITICAL — DO NOT MODIFY THE LOGO):
Place the attached logo exactly as-is as real physical signage inside the premises.
• Pixel-perfect, unchanged, naturally lit, properly installed, and clearly secondary to the subject
• Mount it in the upper background behind the model so the full logo remains completely visible without cropping, blocking, blur, tilt, stretching, or redesign
• The model, hair, shoulders, props, or furniture must never cover any part of the logo
${isProfessional ? `• Size the logo so it fits naturally and completely on the reception back wall behind the girl — large enough to be clearly readable, proportionate to the wall, never oversized, and never cropped by the frame edge or hidden behind the girl.
` : ''}${!isFestival && businessContext ? `• For this client, prioritize these realistic installation surfaces: ${clientLogoPlacementGuidance}
` : ''}

**THE FINAL IMPRESSION:**
${isProfessional ? `The viewer should feel: "This is the real business premises, photographed like a national premium corporate campaign with a stunning ambassador, credible business proof, and high-end executive polish."` : `The viewer should feel: "This is the real business premises, photographed like a national premium commercial campaign with a stunning saree-clad ambassador and believable business-specific luxury."`}`}

CAMERA & PHOTO REALISM:
• Professional DSLR (85mm or 50mm portrait lens look)
${isProfessional ? `• For professional suit outputs, prefer Canon EOS R5 realism — 85mm portrait lens at f/1.8, natural daylight on the face, sharp eye focus, and softly blurred premium office depth` : ''}
• Natural color science and grading
• Real indoor shadows, realistic highlights
• Slight lens softness and beautiful depth-of-field
• No HDR exaggeration, no cinematic grading, no artificial sharpness
• Looks like a ₹2–5 lakh real professional photoshoot
${isFestival && festivalTheme ? `• Color temperature should lean warm/golden matching ${festivalName} festive atmosphere
• Capture the warm glow from festival lamps, diyas, and decorations naturally` : ''}

OVERALL RESULT:
${isFestival ? `A **real, premium ${festivalName} celebration photograph at a [BUSINESS TYPE] establishment** featuring one **distinct premium female brand ambassador** representing [BUSINESS NAME].
The image must feel like a real commercial photoshoot captured inside the business's actual decorated premises.
The ${festivalName} theme should be unmistakable, but the business environment must still remain believable and specific.
Viewer reaction should be: **"This looks like a real premium business campaign shot during ${festivalName}, inside their actual place."**` : `A **real, premium [BUSINESS TYPE] campaign photograph** featuring one **distinct premium female brand ambassador** representing [BUSINESS NAME].
The image must look like a real high-end commercial campaign — elegant, believable, aspirational, and fully photographic.
The woman must read as a real human model with truthful Indian complexion, visible skin realism, natural facial detail, and elite commercial-photo polish.
FINAL MANDATORY CHECK:
If the generated woman does not look like she belongs
on the cover of Vogue India, Femina, or a Tanishq
national campaign — the image has FAILED.
She must be STUNNING. MAGNETIC. MEMORABLE.
A face that makes the viewer say:
"Who is she? She must be famous."
NOT: "She looks like a nice person."
NOT: "She could work in that office."
She is the STAR. Everything else is the backdrop.`}

${isProfessional ? `PROFESSIONAL SUIT NEGATIVE RULES:
• No spectacles or eyewear
• No casual clothing, denim, oversized tailoring, loud prints, or shapeless officewear
• No heavy jewellery, bridal styling, temple ornaments, or stacked accessories
• No heavy glamour makeup, smoky-eye drama, glitter, or over-lined lips
• No plastic skin, AI glow, over-smoothing, mannequin stiffness, cartoon, CGI, or illustration look
• No fake office set, studio backdrop, hotel-lobby fakery, or generic stock-photo executive vibe` : ''}

STRICTLY NO TEXT anywhere except the exact real-world logo signage.

${isFestival ? `PRODUCT IMAGES PLACEMENT (ONLY WHEN PRODUCT IMAGES ARE ATTACHED — STORE BACKGROUND INTEGRATION):
If product images are attached along with this prompt, follow these **CRITICAL RULES FOR REALISTIC STORE INTEGRATION**:

**PLACEMENT STRATEGY — PRODUCTS IN STORE BACKGROUND (NOT BOTTOM OF FRAME):**
• DO NOT place products at the bottom of the frame — they will get covered by footer during video editing
• Instead, place products **IN THE STORE/OFFICE BACKGROUND** — on shelves, display racks, tables, counters, or display cases that are VISIBLE BEHIND the model
• Products should appear as if they are **ACTUAL MERCHANDISE displayed in the real store/office**
• Position products on:
  - **Shelves on the wall** behind the model (at head height or slightly above)
  - **Display cases or glass cabinets** visible in the background
  - **Reception counter or desk** beside or behind the model
  - **Product display stands** positioned in the background scene
  - **Wall-mounted display racks** showing the products

**PRODUCT CONSISTENCY — ABSOLUTE REQUIREMENT:**
• Use the **EXACT product images provided** — do NOT redesign, alter, modify, recolor, or stylize the products in ANY way
• The products must appear **EXACTLY as they look in the uploaded images** — same colors, same packaging, same labels, same appearance
• Do NOT add artistic effects, do NOT change product shapes, do NOT reimagine the products
• Products must be **photographically identical** to what was uploaded — as if the real products were photographed on those shelves
• If the AI cannot place the exact product image, it should use a **placeholder that clearly represents** the product type without changing the original

**INTEGRATION REQUIREMENTS:**
• Products in the background must look **naturally placed** — as if they were always part of this store's inventory
• Proper lighting on products — matching the store's ambient light
• Products should be **clearly visible and recognizable** but NOT competing with the model (model still dominates the frame)
• The background with products should feel like "walking into this business and seeing their products on display"
• In festival mode, products must still stay integrated into the real business fixtures and festival-decorated premises — never floating as staged props
• This makes the image feel like a REAL photo taken at the ACTUAL business location` : `PRODUCT IMAGES PLACEMENT (ONLY WHEN PRODUCT IMAGES ARE ATTACHED):
• Use the exact uploaded product images unchanged
• Place them naturally on real shelves, display racks, tables, counters, or display cases behind the model
• Never place products at the bottom of the frame
• Keep product directions concise and secondary to subject realism
• Match the premises lighting so the products feel like actual inventory in the real business location`}

---END OF PROMPT FORMAT---

===== INSTRUCTIONS FOR FILLING THE FORMAT =====

1. Replace [BUSINESS TYPE] with detected business type (e.g., "advertising agency", "medical clinic", "real estate office", "tea distribution agency", "laundry service", etc.)

2. Replace [BUSINESS NAME] with extracted business name

${isFestival ? `3. For ATTIRE section: The saree must BLEND the ${festivalName} festival theme WITH the business sector colors. Each business should get a UNIQUE saree — a medical clinic and a real estate company celebrating the SAME festival must have DIFFERENT saree colors/styles. The business brand identity should be visible in the attire choice.

4. For ENVIRONMENT section: The background must clearly indicate the BUSINESS SECTOR — a medical clinic should look like a medical clinic, a real estate office should look like a real estate office. The ${festivalName} festival decorations are ADDED ON TOP of this business environment. Think: "What would THIS specific [business type] office look like if they decorated for ${festivalName}?"

5. CRITICAL: Every single decoration, cultural element, and festival-specific item listed in the ENVIRONMENT section must appear in the generated prompt. DO NOT skip any festival elements. But the BASE environment must still clearly communicate the business type.` : `3. For ATTIRE section: Keep the outfit premium, realistic, and business-appropriate. Traditional attire must preserve visible pores, micro skin texture, soft tonal variation, and true photographic realism. Professional attire must follow the premium power-suit anchor and never look like generic officewear.

4. For ENVIRONMENT section: Use only the strongest business-specific cues from extracted/store evidence so the location reads instantly as the real premises. Every commercial clip must choose a different functional zone of the business based on that clip's exact voice-over meaning, visible proof point, and client offering.

5. For LOGO and PRODUCT sections: Keep both concise. Use the exact logo unchanged and place exact uploaded products naturally on real background fixtures behind the model when product images exist.`}

${isFestival ? `6. The celebrity beauty, natural warm complexion (NOT pink), mandatory jewellery, 70% screen presence, and natural logo placement are ALL NON-NEGOTIABLE` : `6. The exact commercial realism formula, Indian-only casting, truthful Indian complexion, mandatory jewellery, premium attire realism, voice-over-matched locations, and concise natural logo placement are ALL NON-NEGOTIABLE`}

OUTPUT: Generate ONLY the final prompt following the exact format above. Fill in all bracketed placeholders with extracted business information. No explanations, no labels.`;
};

// ===== MULTI-FRAME SYSTEM PROMPT (Per-Clip Unique Main Frame Prompts) =====
export const MULTI_FRAME_SYSTEM_PROMPT = (
  attireType: string,
  adType: string,
  festivalName: string,
  segmentCount: number,
  voiceOverSegments: string[],
  businessContext: string = ''
) => {
  const basePrompt = MAIN_FRAME_SYSTEM_PROMPT(attireType, adType, festivalName, '1:1', businessContext);
  const detectedBusinessType = businessContext ? detectBusinessType(businessContext) : 'default';
  const educationEnvironmentMode = detectedBusinessType === 'education' ? detectEducationEnvironmentMode(businessContext) : null;
  const clientEnvironmentGuidance = businessContext ? getEnvironmentForBusiness(detectedBusinessType, businessContext) : '';
  const clientLocationPlan = businessContext ? getCommercialLocationPlanForBusiness(detectedBusinessType, businessContext) : '';
  const clientEnvironmentNegatives = businessContext ? getEnvironmentNegativeRules(detectedBusinessType, businessContext) : '';

  // Build segment context for the AI
  const segmentContext = voiceOverSegments.map((seg, i) => 
    `  Clip ${i + 1} Script: ${seg}`
  ).join('\n');

  const clientSpecificLocationBlock = businessContext
    ? `**FOR THIS CLIENT'S COMMERCIAL CAMPAIGN, PRIORITIZE THIS EXACT REAL-WORLD ROUTE:**
• Client business type: ${detectedBusinessType}${educationEnvironmentMode ? ` (${educationEnvironmentMode === 'institution' ? 'college / school / institute campus mode' : 'education consultancy mode'})` : ''}
• Preferred environment anchor: ${clientEnvironmentGuidance}
• Preferred location ladder: ${clientLocationPlan}
• Hard negatives: ${clientEnvironmentNegatives}

`
    : '';

  // Director's shot types — each clip has a cinematic PURPOSE and a DIFFERENT LOCATION within the same establishment
  const shotDesigns = [
    {
      key: 'hero' as const,
      name: 'HERO ESTABLISHING SHOT',
      location: 'Main reception area / front counter / primary welcome zone of the business',
      camera: adType !== AdType.FESTIVAL
        ? 'Medium full / three-quarter standing shot, straight-on at eye level, subject perfectly centered in frame with balanced left-right spacing and roughly 70% frame presence, with the business reception clearly visible behind her — classic brand ambassador establishing shot'
        : 'Close mid-shot, straight-on at chest or eye level, subject perfectly centered in frame with balanced left-right spacing and roughly 70% frame presence — classic brand ambassador establishing shot',
      pose: adType !== AdType.FESTIVAL
        ? 'Both hands at the lower waist, right hand lightly resting over the left hand, fingers relaxed and partially overlapping — no crossed arms, no pockets, no hand gestures, formal front-clasp corporate pose; the girl standing tall and centered'
        : 'Hands gently folded at waist, one hand resting over the other, confident welcoming posture — brand ambassador stance',
      purpose: 'Introduce the brand ambassador and the business atmosphere. The viewer sees the model AND instantly recognizes the business type from the environment.',
      logoPlacement: getShotLogoPlacementForBusiness('hero', detectedBusinessType, businessContext),
    },
    {
      key: 'showcase' as const,
      name: 'SHOWCASE / PRODUCT SHOT',
      location: 'The core working area of the business — its real, in-use space (e.g. the shop floor with real stock, the workshop / lab with real equipment, the service counter, or the main work zone). If the business has no physical products, use its real work area and real objects — NEVER an invented display wall, achievement wall, or frames',
      camera: 'Close mid-shot with slight low-angle polish (camera slightly below chest), subject still occupying roughly 70% of frame while the real work area remains visible on the other side',
      pose: 'One hand gesturing gently toward the real equipment / stock / work area behind her, or resting on a real counter — naturally interacting with the business environment',
      purpose: 'Show what the business DOES using its REAL work area, equipment, or stock around her — never through invented display walls, posters, or frames.',
      logoPlacement: getShotLogoPlacementForBusiness('showcase', detectedBusinessType, businessContext),
    },
    {
      key: 'credibility' as const,
      name: 'CREDIBILITY / TRUST SHOT',
      location: 'Near the business logo wall in the main reception or consultation zone — the trust-building section of the establishment, shown with real architecture and real in-use objects (NEVER achievement frames, certificate walls, award displays, or photo panels)',
      camera: 'Close mid-shot with a gentle 10-15° body angle while the face still addresses camera directly, creating depth with the logo and the real premises visible in the background',
      pose: 'Confident stance with a slight body turn, warm authoritative expression — exuding trust and credibility',
      purpose: 'Build trust and brand authority through the real premises and the clearly visible logo — never through invented awards, certificates, or achievement / display frames.',
      logoPlacement: getShotLogoPlacementForBusiness('credibility', detectedBusinessType, businessContext),
    },
    {
      key: 'detail' as const,
      name: 'DETAIL / IMMERSION SHOT',
      location: 'A different section of the business — specialized area, secondary display zone, workstation area, or another distinct part of the premises that hasn\'t been shown yet',
      camera: 'Close mid-shot (head to upper waist) with environment-rich composition, keeping the model dominant at roughly 70% of frame while revealing this new area',
      pose: 'Natural relaxed pose — perhaps lightly touching a surface, standing near equipment relevant to the business, or a natural mid-conversation gesture',
      purpose: 'Reveal more depth of the business — show the viewer that this is a REAL, multi-area establishment. Add visual variety.',
      logoPlacement: getShotLogoPlacementForBusiness('detail', detectedBusinessType, businessContext),
    },
    {
      key: 'closing' as const,
      name: 'WARM CLOSING SHOT',
      location: 'Back near the main area / entrance zone / a warm, inviting spot in the establishment — full circle back to a welcoming position',
      camera: 'Close mid-shot, standard to very slight high-angle polish, soft and warm composition with roughly 70% model presence — the "come visit us" feel',
      pose: 'Open welcoming gesture — warm smile, slightly open hands or namaste gesture, inviting the viewer — the final impression',
      purpose: 'End on a warm, inviting note. The viewer should feel: "I want to visit this place." This is the closing brand impression.',
      logoPlacement: getShotLogoPlacementForBusiness('closing', detectedBusinessType, businessContext),
    },
    {
      key: 'alternative' as const,
      name: 'ALTERNATIVE ANGLE SHOT',
      location: 'The most visually interesting or unique section of the business — a spot that best represents the brand\'s personality and uniqueness',
      camera: 'Creative but controlled close mid-shot using environment elements as natural frames, while keeping the model dominant at roughly 70% of frame',
      pose: 'Dynamic pose that matches the script energy — could be mid-stride, turning to face camera, or engaged with something in the environment',
      purpose: 'Show the business from a fresh, unexpected angle that adds cinematic variety.',
      logoPlacement: getShotLogoPlacementForBusiness('alternative', detectedBusinessType, businessContext),
    },
  ];

  return `${basePrompt}

===== MULTI-FRAME GENERATION MODE — DIRECTOR'S SHOT PLAN (CRITICAL) =====

**You are now a WORLD-CLASS commercial film director and cinematographer planning a premium brand campaign.**

**OVERRIDE: Instead of generating ONE prompt, you must generate EXACTLY ${segmentCount} SEPARATE Main Frame image prompts — one for each 8-second video clip.**

Think of this as a ₹20-lakh national TV commercial shoot where the brand ambassador MOVES THROUGH different areas of the business establishment. Each clip = a DIFFERENT LOCATION within the SAME office/store/premises.

TOTAL CLIPS: ${segmentCount}
EACH CLIP DURATION: 8 seconds

VOICE-OVER SCRIPT PER CLIP (MANDATORY DRIVER OF LOCATION, BACKGROUND PROOF, POSE ENERGY, AND MOOD):
${segmentContext}

===== CASTING CONTINUITY RULES (MANDATORY) =====

Before writing Clip 1, choose ONE distinct female ambassador identity for this campaign based on the business type, brand tone, attire, and ${adType === AdType.FESTIVAL ? `${festivalName} festival mood` : 'commercial brand mood'}.
That identity must stay consistent across all clips in this one campaign.
However, this business must NOT default to the same generic face used for other businesses — choose a fresh, business-specific ambassador brief.
${adType === AdType.FESTIVAL ? '' : 'For commercial campaigns, the ambassador identity is Indian-only and must stay clearly Indian in every clip with no ethnic drift or generic global stock-model look.'}
The consistency rule is: same woman within this campaign; different businesses should feel like different women.

===== THE DIRECTOR'S SHOT PLAN =====

**GOLDEN RULE: The model must appear at a DIFFERENT physical location within the same business environment in EVERY clip, and each chosen location must be the best visual proof for that clip's exact voice-over message.**

Just like in real TV commercials — the actress doesn't stand in one spot for 30 seconds. She MOVES through the business:
• From the reception → to the product display → to the logo wall → to the consultation area → back to the entrance
• Each location reveals a DIFFERENT aspect of the business
• Each location must be selected because it supports the meaning of that clip's script, not just because it looks premium
• The viewer sees the FULL business through the model's journey

${adType === AdType.FESTIVAL ? '' : `**COMMERCIAL LOCATION DENSITY RULE:**
Every commercial clip must keep the real business premises as the dominant base layer, then add the strongest business-proof layer for that line.
For commercial traditional, premium richness may come from real counters, polished displays, reflective glass, signage, and believable material depth — never bridal or festive staging.
For commercial professional, use executive-facing, consultation-facing, showcase, or proof-heavy business zones — never empty boardrooms, generic coworking corners, or stock office backgrounds.
Commercial polish must come from real materials, real light, and real proof surfaces, not fake set dressing.`}

${clientSpecificLocationBlock}

**LOCATION PLANNING PER BUSINESS TYPE:**
The AI must pick ${segmentCount} DIFFERENT spots from within the specific [BUSINESS TYPE] establishment:
Each chosen spot must match the exact service claim, business proof point, or emotional promise being spoken in that clip's voice-over line.

• **Medical/Healthcare:** Reception counter → Consultation room doorway → Medicine/equipment display area → Patient waiting zone → Near health certifications wall
• **Real Estate:** Reception desk → Property display board wall → Building model showcase → Floor plan gallery → Client meeting zone
• **Fashion/Boutique:** Store entrance → Clothing display racks → Mirror/trial area → Accessory showcase → Designer collection wall
• **Food/Restaurant/Catering:** Host station → Dining area → Kitchen pass/display counter → Beverage station → Ambiance seating zone
• **Tech/Software:** Reception/lobby → Workspace area → Meeting room doorway → Creative wall/whiteboard area → Tech equipment zone
• **Education:** ${getEducationLocationPlan(businessContext)}
• **Solar/Energy:** Reception → Solar panel display → System demo area → Certificate/partnership wall → Energy model showcase
• **Laundry/Wash:** Counter/reception → Washing machine area → Folded linen display → Pressing/finishing zone → Rack/collection area
• **Tea/Beverage:** Counter → Tea packet shelf display → Tasting area → Storage/distribution zone → Brand display wall
• **Jewellery:** Entrance/display case → Gold collection showcase → Diamond/premium section → Trial mirror area → Heritage/trust wall
• **Electrical/Hardware:** Service counter → Equipment display → Tool showcase area → Workstation/demo zone → Certification wall
• **Default:** Reception → Product/service showcase → Logo/brand wall → Work area → Entrance/closing zone

===== FRAME-BY-FRAME GENERATION RULES =====

${Array.from({ length: segmentCount }, (_, i) => {
  const clipNum = i + 1;
  const shotIdx = i < shotDesigns.length ? i : i % shotDesigns.length;
  const shot = shotDesigns[shotIdx];
  
  if (clipNum === 1) {
    return `**CLIP ${clipNum} — ${shot.name} (Full standalone prompt)**
   📍 LOCATION: ${shot.location}
   🎥 CAMERA: ${shot.camera}
   🧍 POSE: ${shot.pose}
   🎯 PURPOSE: ${shot.purpose}
    🪧 LOGO SURFACE: ${shot.logoPlacement}
   
   ${adType !== AdType.FESTIVAL ? `Generate a COMPLETE standalone first-frame image prompt EXACTLY in the base format above (the headers: Create an ultra-realistic promotional portrait…, Main Character, Pose, Background, Visual Style, Composition, Important).
   Keep it clean and concise — about 200–300 words, simple bullet lines, no extra sections, no negative list.
   Describe the girl (with elegant jewellery — ${attireType === 'traditional' ? 'necklace/chain, earrings, bangles, finger ring' : 'finger ring, necklace/chain, earrings, watch'} — and a bindi on the forehead), the formal front-clasp pose, the real [BUSINESS TYPE] reception background built from the business details and 100% relatable to this exact business (its real equipment, products, displays, and service cues so a viewer instantly recognises what it does), and the attached logo fully visible on the reception wall.
   The reception, visible business cues, pose, and mood must directly match Clip ${clipNum}'s voice-over line, and the logo must feel physically installed on ${shot.logoPlacement}, fully visible and unaltered.
   The attached logo must be the ONLY text in the image — do NOT invent any other signage, banners, taglines, mission lines, service lists, dates, or academic years, and do NOT add empty/blank boards, frames, certificates, brochures, posters, standees, or blank screens (empty placeholders look like cardboard) — keep walls and surfaces clean. Keep the logo perfectly sharp and in focus (not blurred by depth of field) so all its text is clearly readable.
   Frame the girl as a three-quarter shot (head to thighs/knees), centered and clearly filling about 70% of the frame height (not a small full head-to-feet shot), looking directly at the camera. Keep the girl's ~70% size the priority and the attached logo small-to-medium and secondary — dynamically sized to the free wall space and never enlarged at the cost of the girl's size.` : `Generate a COMPLETE, detailed image generation prompt following ALL the rules/sections from the base prompt above.
   This frame sets the visual foundation — character face, hair, skin, beauty, attire, jewellery, AND this specific location within the business.
   This is the ONLY clip where you fully describe the model's physical appearance.
  The chosen location, visible business cues, pose energy, and emotional tone must directly match Clip ${clipNum}'s voice-over line.
    The logo must feel physically installed on ${shot.logoPlacement}, with believable depth, reflections, and material behavior.
  Include ALL sections: SUBJECT, FACE, MAKEUP, EXPRESSION, HAIR, ATTIRE, JEWELLERY, ENVIRONMENT, LOGO PLACEMENT, CAMERA, OVERALL RESULT.
   The subject must occupy roughly 70% of the frame, maintain direct eye contact with the camera, and the attached logo must appear fully visible in the upper background without any alteration.
   Target length: 500-800 words.`}`;
  }
  
  return `**CLIP ${clipNum} — ${shot.name} (⚠️ DO NOT RE-DESCRIBE THE MODEL)**
   📍 LOCATION: ${shot.location}
   🎥 CAMERA: ${shot.camera}
   🧍 POSE: ${shot.pose}
   🎯 PURPOSE: ${shot.purpose}
    🪧 LOGO SURFACE: ${shot.logoPlacement}
   
   **⛔ FORBIDDEN — DO NOT WRITE ANY OF THESE FOR CLIP ${clipNum}:**
   You must NOT mention, describe, or reference ANY of the following words/concepts for the model:
   ❌ face, facial features, complexion, skin tone, skin color, skin texture, forehead, cheekbones, jawline
   ❌ eyes, eye color, eye shape, eyelashes, eyebrows (as physical description)
   ❌ nose, lips, lip color, smile description, teeth
   ❌ hair, hair color, hair length, hair style, hair texture, hairstyle, curls, straight hair, braid, bun
   ❌ height, body shape, body type, figure, slim, slender, petite, tall
   ❌ makeup, foundation, lipstick, eyeliner, kajal, blush, eye shadow
   ❌ attire, saree, suit, fabric, silk, zari, border, pallu, blouse, dupatta, kurta, dress
   ❌ jewellery, necklace, earrings, bangles, ring, maang tikka, nose ring, chain, pendant, gold, diamond
   ❌ beauty, beautiful, gorgeous, stunning, attractive, elegant (about the model)
   ❌ South Indian, actress, celebrity, model appearance, film star, glamorous
   
   **✅ INSTEAD — Write ONLY this one line about the model:**
  "Use the attached reference frame image as the exact identity and styling anchor for this clip — same woman, same core styling, the exact same natural rich black hair from the first frame onward, same wardrobe family rooted in the approved business-specific palette, same jewellery set, and for professional commercial suit campaigns only you may shift the suit tone within that same palette family instead of repeating one identical beige in every clip."
   
   **✅ THEN FOCUS 100% ON THESE (the ONLY things you should describe):**
  • 📍 The NEW LOCATION within the SAME business — a different REAL area/zone that best matches the meaning of Clip ${clipNum}'s voice-over line (show the real place the script is talking about). Describe it as a real, operational spot with real physical objects.
  • 🔍 What's visible in the background: ONLY real, in-use, naturally-present objects this business actually has — e.g. shelves stacked with real books, real equipment / machines / tools, work counters, desks, seating, stock, materials, plants — shown as solid real objects with NO readable text on them. Do NOT invent any decorative wall content.
  • 🚫 TEXT RULE (STRICT — VERY IMPORTANT): the attached logo is the ONLY text anywhere in the frame. Do NOT add or invent ANY other text — no signage, banners, posters, notice boards, brochures, application forms, department lists, course / curriculum lists, certificates, taglines, slogans, dates, or years on the walls, desks, screens, or anywhere. (The image generator mis-spells such text, so it must NEVER appear.)
  • 🚫 NO FRAMES / DISPLAYS / PLACEHOLDERS (STRICT — VERY IMPORTANT): do NOT create ANY wall frames, picture frames, photo frames, certificate frames, achievement / award / "success" / proof / display walls, photo walls, notice boards, posters, standees, brochures, or screens — NEITHER empty NOR filled. They are ALL forbidden. NEVER write phrases like "empty frames", "frames to hold photos", "displays without text", "achievement display", "wall displays", or similar — those create ugly empty cardboard panels. Walls stay clean (plain wall + real architecture) carrying ONLY the attached logo; communicate the business through REAL in-use objects, never through any display or frame.
  • 🧍 The new POSE — body angle, hand position, interaction with environment elements at this location in a way that matches the clip's selling point
   • 😊 The new EXPRESSION — emotional tone matching Clip ${clipNum}'s voice-over script
   • 🎥 The new CAMERA ANGLE and composition
  • 💡 How lighting naturally differs at this new spot (e.g., near window = warm, interior = ambient) while still preserving the realism formula
  • 👁️ Mandatory direct eye contact to the camera while holding this new pose
  • 🪧 The attached logo placed on this clip's believable physical surface — ${shot.logoPlacement} — small-to-medium, sharp and clearly readable, fully visible, physically installed, and completely unmodified
   
   WHY THIS MATTERS: Any model description — even saying "beautiful woman" or "silk saree" — will cause the AI image generator to create a COMPLETELY DIFFERENT person. The model's identity is LOCKED from Clip 1. You ONLY control the scene around her.
   
   **OUTPUT LENGTH FOR THIS CLIP: 100-200 words MAXIMUM.**
  **DO NOT include these section headers: SUBJECT, FACE, MAKEUP, EXPRESSION, HAIR, ATTIRE, JEWELLERY, PRODUCT IMAGES PLACEMENT, OVERALL RESULT.**
   **ONLY include: one model reference line + POSE + NEW LOCATION/ENVIRONMENT + CAMERA/LIGHTING + MOOD.**`;
}).join('\n\n')}

===== VISUAL VARIATION RULES — THE DIRECTOR'S CHECKLIST =====

**WHAT MUST CHANGE between every clip (MANDATORY):**
• **📍 MODEL'S PHYSICAL LOCATION** — she must be at a DIFFERENT spot within the same business (THIS IS THE MOST IMPORTANT CHANGE)
• **🎥 Camera angle & composition** — match the shot type (establishing, showcase, trust, detail, closing)
• **🧍 Subject POSE** — body angle, hand position, body interaction with the new location's elements
• **😊 Subject EXPRESSION** — match the script mood (welcoming → proud → trustworthy → warm → inviting)
• **🔍 Background content** — different business elements visible at each new location
• **💡 Lighting nuance** — natural variation as model moves (near window = warmer, deeper inside = ambient, near displays = spotlit)
• **🪧 Logo installation surface** — move the exact logo to the most believable mounted sign or branded architectural panel for that zone, never as a floating overlay
• **🧥 Professional suit shade nuance** — in commercial professional campaigns, the suit may shift within the approved business-specific palette family so the client does not get one repeated beige tone in every frame

**⚠️ WHAT MUST NEVER CHANGE (MODEL CONSISTENCY IS SACRED):**
• **Model's identity** — exact same person, same face, same beauty level in every clip
• **Hair color baseline** — the exact same natural rich black hair established in Clip 1 must remain unchanged in every later clip, with no brown, auburn, burgundy, copper, highlight, or lighting-driven color drift
• **Attire & jewellery** — keep the same jewellery set and the same wardrobe family; traditional outputs stay in the exact same outfit, while commercial professional outputs may vary only the suit shade inside the approved business-specific palette family without changing the overall styling identity
• **Overall establishment** — same business, same décor style, same color palette
• **Color grading & mood** — consistent cinematic feel throughout
• **Image quality** — same DSLR realism level
• **Viewer connection** — direct eye contact with the camera is mandatory in EVERY clip, regardless of shot type.

**⛔⛔⛔ ABSOLUTE ZERO-TOLERANCE RULE FOR CLIPS 2+ ⛔⛔⛔**
For ANY clip after Clip 1, you must write ZERO words about the model's appearance.
The ONLY reference to the model should be: "Use the attached reference frame image as the exact identity and styling anchor for this clip — same woman, same core styling, the exact same natural rich black hair from the first frame onward, same wardrobe family rooted in the approved business-specific palette, same jewellery set, and for professional commercial suit campaigns only you may shift the suit tone within that same palette family instead of repeating one identical beige in every clip."

NEVER write about: face, hair, skin, beauty, makeup, attire, fabric, saree, silk, jewellery, necklace, earrings, bangles, eyes, lips, complexion, height, figure, or ANY physical/clothing description.
Even writing "beautiful woman in silk saree" will make the AI generate a DIFFERENT person.
The model is LOCKED from Clip 1 — you can ONLY control the SCENE around her (location, background, pose, expression, camera angle).

===== REALISM REQUIREMENT (ABSOLUTE — NON-NEGOTIABLE) =====

Every generated frame MUST look like:
• Real DSLR camera photography (Canon 5D Mark IV / Sony A7III quality)
• Natural cinematic lighting — window light, ambient indoor, practical lights
• Real-world environments with natural imperfections
• Real human skin textures — visible pores, natural warmth, micro-highlights
• Proper depth of field with beautiful bokeh
• Professional cinematography composition (rule of thirds, leading lines)

STRICTLY AVOID anything that looks like:
• AI-generated illustrations or digital art
• 3D renders or CGI
• Cartoon style or stylized art
• Unrealistic/flat lighting
• Over-processed or HDR-heavy look
• Stock photo feel

The result must be INDISTINGUISHABLE from a real photograph captured during a professional film shoot.

===== CTA (CALL-TO-ACTION) RULE =====
Do NOT automatically include any CTA text in the frame prompts (e.g., "ఇప్పుడు సంప్రదించండి" or similar).
CTA text will be handled separately by the video editing team.
Frame prompts should focus ONLY on the visual scene — no overlaid text except real-world logo signage.

===== ⛔ FORBIDDEN SECTION HEADERS FOR CLIPS 2+ (CRITICAL — READ THIS) ⛔ =====

**The base prompt above defines sections like SUBJECT, FACE, MAKEUP, EXPRESSION, HAIR, ATTIRE, JEWELLERY, etc.**
**These section headers are ONLY for Clip 1. For Clips 2+, you must NOT include these sections AT ALL.**

**CLIP 1 must include ALL these sections:** SUBJECT, FACE, MAKEUP, EXPRESSION, HAIR, ATTIRE, JEWELLERY, ENVIRONMENT, LOGO PLACEMENT, CAMERA & PHOTO REALISM, OVERALL RESULT, PRODUCT IMAGES PLACEMENT

**CLIPS 2+ must NEVER include ANY of these sections:**
⛔ SUBJECT (CELEBRITY STANDARD…) — FORBIDDEN
⛔ FACE — LUXURY CASTING BRIEF — FORBIDDEN  
⛔ MAKEUP — HIGH-FASHION EDITORIAL LEVEL — FORBIDDEN  
⛔ EXPRESSION — STAR QUALITY — FORBIDDEN  
⛔ HAIR (ACTRESS-LEVEL…) — FORBIDDEN
⛔ ATTIRE (ULTRA-LUXURY…) — FORBIDDEN
⛔ JEWELLERY (LUXURIOUS…) — FORBIDDEN
⛔ PRODUCT IMAGES PLACEMENT — FORBIDDEN (already covered in Clip 1)
⛔ OVERALL RESULT — FORBIDDEN (already covered in Clip 1)

**CLIPS 2+ should ONLY contain these sections:**
✅ One-line model reference ("Use the attached reference frame image…")
✅ POSE & FRAMING (new pose for this location)
✅ ENVIRONMENT — NEW LOCATION (the new spot within the business)
✅ CAMERA (angle for this shot)
✅ LIGHTING (how it differs at this new spot)
✅ MOOD (one line matching the voice-over script)
✅ Direct eye contact and full unmodified logo visibility

===== WORD COUNT RULES (ENFORCED) =====

**Clip 1: ${adType !== AdType.FESTIVAL ? '200–300 words — clean example-format prompt (Main Character, Pose, Background, Visual Style, Composition, Important)' : '500–800 words — Full detailed prompt with every section'}.**
**Clips 2, 3, 4, etc.: 100–200 words MAXIMUM** — Short, location-focused prompts. If your continuation clip is longer than 200 words, you are re-describing the model. DELETE those lines.

A continuation clip that is 500+ words means you are repeating model/attire/jewellery descriptions — this is WRONG and will produce different-looking women across clips.

===== OUTPUT FORMAT (CRITICAL — MUST FOLLOW EXACTLY) =====

Separate each clip's prompt with the marker: ###CLIP###

${adType !== AdType.FESTIVAL ? `**CLIP 1 FORMAT (CLEAN — 200-300 words):**

Clip 1 – Main Frame Prompt (${shotDesigns[0].name})
Create an ultra-realistic promotional portrait for "[BUSINESS NAME]" using the attached official logo as branding reference.
Generate a premium [BUSINESS TYPE] reception environment and place a confident young Indian girl standing in front of the reception area.
Main Character: Indian girl, age 20–25, a new different natural-looking girl, ${attireType === 'traditional' ? 'elegant designer saree (not a suit)' : 'premium tailored formal suit (not saree)'} in a brand-derived colour, natural black hair, ${attireType === 'traditional' ? 'traditional jewellery (necklace/chain, earrings, bangles, ring, bindi)' : 'simple jewellery (finger ring, thin necklace/chain, earrings, wristwatch, bindi)'}, friendly welcoming smile.
Pose: standing centered, both hands at the lower waist with the right hand lightly resting over the left — formal front-clasp corporate pose, looking at the camera.
Background: the real [BUSINESS TYPE] reception built from the business details, with the attached logo as a small-to-medium wall sign behind her — fully visible, sharp and clearly readable (in focus, not blurred), but secondary, never large enough to shrink the girl. The attached logo is the ONLY text anywhere — no other signage, banners, taglines, mission lines, service lists, dates, academic years, or any invented text. No empty/blank boards, picture frames, certificates, brochures, posters, or blank screens — keep walls and surfaces clean.
Visual Style: ultra realistic, cinematic indoor lighting, natural skin texture, premium colour grading.
Composition: 9:16 vertical, three-quarter shot from head to thighs/knees, girl centered and clearly filling about 70% of the frame height (not a small full head-to-feet shot).` : `**CLIP 1 FORMAT (FULL — 500-800 words):**

Clip 1 – Main Frame Prompt (${shotDesigns[0].name})
Create a Ultra-realistic DSLR photograph, single image, 9:16 vertical…
[Full SUBJECT section with face, hair, beauty description, and an explicit natural rich black hair only rule]
[Full ATTIRE section]
[Full JEWELLERY section]
[Full ENVIRONMENT section with real business base layer ${adType === AdType.FESTIVAL ? '+ festival cues' : '+ business-proof layer'}]
[Full CAMERA & REALISM section]
[Full OVERALL RESULT]`}

###CLIP###

**CLIP 2+ FORMAT (SHORT — 100-200 words ONLY):**
Here is an EXAMPLE of what a correct Clip 2 prompt looks like:

Clip 2 – Main Frame Prompt (${shotDesigns[1 % shotDesigns.length].name})
Use the attached reference frame image as the exact identity and styling anchor for this clip — same woman, same core styling, the exact same natural rich black hair from the first frame onward, same wardrobe family, same jewellery set, perfectly consistent with the attached reference frame.

POSE: Subject positioned on the right side using rule-of-thirds, one hand gesturing gently toward the product display behind her. Close mid-shot, camera slightly below chest level, subject still occupying roughly 70% of the frame and maintaining direct eye contact with the camera.

NEW LOCATION: She has moved to a different real area of the premises that matches this clip's script line — for example a service / work zone with the business's real equipment, counters, and fixtures around her. Behind her are ONLY real physical objects (no text, no signage, no posters, no boards). The attached logo is mounted small-to-medium on the far wall, fully visible, sharp, readable, and unmodified.

${adType === AdType.FESTIVAL ? `Festival decorations from the office are still visible — mango leaf thoranam above the display, marigold garlands framing the monitor, brass deepam on the desk corner, rangoli patterns continuing on the floor.

LIGHTING: Cool blue-tinted ambient light from the display screens blends with warm golden festival lamp glow — creating a unique tech-meets-tradition atmosphere.

MOOD: Professional, aspirational — showcasing the company's innovative capabilities while celebrating ${festivalName || 'the festival'}.` : `REAL ENVIRONMENT LAYER: A real, in-use functional area of the business is visible — e.g. shelves with real books / stock, real equipment, machines, work counters, tools, seating, or operational objects — so the business is obvious from the real surroundings. NEVER show any frames, photo / achievement / award / display walls, certificates, posters, boards, or screens (empty or filled), and no invented text — the attached logo is the ONLY text.

LIGHTING: Natural daylight from the left window mixes with soft practical interior lighting and believable reflections on real materials — polished, premium, and fully photographic.

MOOD: Professional, aspirational, and persuasive — showcasing the company's actual strengths with national-campaign polish.`}

**^^^ THAT is the correct length and format for Clips 2+. Notice: NO facial description, NO hair, NO attire, NO jewellery, NO "Facial characteristics" section, NO "HAIR" section, NO "ATTIRE" section. Just location + pose + camera + lighting + mood.**

${segmentCount > 2 ? `###CLIP###

Clip 3 – Main Frame Prompt (${shotDesigns[2 % shotDesigns.length].name})
[Same short format — 100-200 words — new location, new pose, new camera — NO model description]` : ''}

(Continue for all ${segmentCount} clips — each at a DIFFERENT location within the business)

**Generate EXACTLY ${segmentCount} prompts separated by ###CLIP###. No more, no less.**
**Clip 1 = LONG (full description). Clips 2+ = SHORT (100-200 words, location-only, NO model re-description).**
**Each clip's model MUST be at a PHYSICALLY DIFFERENT location within the same business establishment.**
Do NOT wrap individual prompts in code blocks — output them as plain text separated by ###CLIP###.`;
};

export const HEADER_SYSTEM_PROMPT = (_adType: string, _festivalName: string) => {
    return `Design a PREMIUM, BUSINESS-THEMED HEADER for a 9:16 vertical advertisement.

CANVAS & SIZE (FULL-BLEED TOP STRIP — NO OUTER PADDING):
- 9:16 vertical frame. The ENTIRE header — logo row AND the address bar together — is ONE compact band that FILLS the top of the frame COMPLETELY: it spans the FULL WIDTH from the left edge to the right edge and starts flush at the very TOP edge, filling about the top 7% as a slim strip. Everything below the header stays empty / blank.
- FULL-BLEED (IMPORTANT): there must be NO outer margin, NO padding, and NO gap around the header band, and it must NOT look like a floating rounded card with empty space around it. The band reaches the TOP, LEFT, and RIGHT edges of the canvas; do NOT round the top-left or top-right outer corners (only the bottom edge of the band may be softly finished).
- Inside the band, the LOGO box, NAME container, and CONTACT pills keep their rounded premium shapes, with comfortable INNER spacing so no element is clipped or cramped — elements are padded INSIDE the full-bleed band, while the band itself has no outer padding.

EXACT LAYOUT (keep this structure — do not move or change it):
- LEFT: a square / rounded-square LOGO container holding the attached logo (used exactly as provided, unchanged).
- CENTRE: a large rounded-rectangle container with the BUSINESS NAME as the hero element.
- RIGHT: the contact number(s) as premium pill / button(s), stacked vertically.
- BOTTOM: a SLIM full-width ADDRESS bar, tightly attached under the row above as part of the SAME header unit (NOT a separate thick band), with the address text CENTER-aligned.
- The LOGO box, the NAME container, and the CONTACT pills must share the SAME height and baseline and align evenly in one neat row.

ADAPTIVE RULES (IMPORTANT):
- Contacts: if TWO numbers are given, show two evenly-stacked pills that fill the right side neatly. If only ONE number is given, show a single comfortably-sized pill centered on the right with balanced spacing and NO empty glow panel and NO blank gap. If NO number is given, remove the contact area entirely and let the BUSINESS NAME grow larger / wider to fill that space. Show AT MOST TWO contact numbers and reproduce each number EXACTLY as provided, digit-for-digit — NEVER change, swap, add, drop, reorder, or invent any digit, and never make up a number.
- Address: the address bar is ONLY for a real street / postal address. ALWAYS center-align the address text and ALWAYS keep the ENTIRE address on ONE SINGLE LINE — STRICTLY never wrap it, never break it, and never let it run onto a second line. If the address is long, shrink the address text size as much as needed so the whole address fits on that single line; if short, keep it centered at a comfortable size. If NO real address is given — or the provided value is just the business name or a vague label — OMIT the address bar completely and collapse the space. NEVER repeat the business name inside the address bar.

BUSINESS-THEMED GRAPHIC DESIGN (MANDATORY — this was missing before):
- The header MUST contain clear, tasteful GRAPHIC DESIGN ELEMENTS that match the business category — not just a plain coloured band. Render subtle themed motifs / decorative graphics inside the header:
  - Education / college / school → academic motifs (graduation cap, open book, laurel wreath, knowledge / line-art).
  - Hospital / clinic → medical motifs (cross, heartbeat line, caduceus), clean healthcare feel.
  - Technology → circuit / grid / digital line-art.
  - Retail / store → premium commerce / shopping motifs.
  - Gym / fitness → dynamic energy / motion lines.
  - Restaurant / food → luxury hospitality / culinary motifs.
  - Any other category → fitting motifs for that exact industry.
- Place these themed graphics as soft decorative accents (in the corners, behind the name, or as a faint watermark pattern) that clearly signal the business type while keeping all text fully readable.

PREMIUM FINISH:
- Use the brand / logo colours as the base. Add rich gradients, premium soft shadows, tasteful glassmorphism, subtle metallic / gold highlights, and gentle depth and lighting so it feels dimensional — never a flat band, wireframe, form, dashboard, or plain bordered boxes.
- LOGO container: premium with subtle depth, fully inside the frame, never clipped, never a plain white box.
- BUSINESS NAME: the visual hero — premium typography, elegant treatment, strong hierarchy, perfectly spelled and readable.
- CONTACT pills: premium gradient / glass buttons with a small phone icon and a soft shadow.
- ADDRESS bar: slim and integrated, with a subtle gradient / glass treatment and a small location-pin icon — never a thick separate rectangle. The address text stays on ONE single line always (shrink the text to fit), never wrapped onto a second line.

CONTENT RULES (STRICT):
- Place ONLY these elements: the logo, the business name, the contact number(s), and a real address — using EXACTLY the values provided to you.
- Use ONLY the values that are provided. If a value is not provided, simply leave that element out — do NOT draw an empty box and do NOT write words like "not provided", "N/A", or any placeholder.
- NEVER invent, guess, autocomplete, or fabricate any value — especially NEVER make up an address, street, area, city, pincode, or phone number. If the address (or a contact number) is not given to you, that element does NOT exist: do NOT draw its bar / pill and do NOT place any text for it. A field that is missing must be completely absent, not faked.
- No taglines, no offers, no services, no extra text — nothing beyond logo, name, contacts, and a real address.
- All text must be crisp, perfectly spelled, and clearly readable.`;
};
export const getToneForAdType = (adType: string) =>
  adType === AdType.FESTIVAL
    ? 'Warm, celebratory, festive, heartfelt'
    : 'Professional, confident, trustworthy, persuasive';

export const VOICEOVER_SYSTEM_PROMPT = (duration: number, segmentCount: number, adType: string, festivalName: string, language: string = '') => {
  const clipLines = Array.from({ length: segmentCount }, (_, index) => {
   const start = index * 8;
   const end = start + 8;
   return `${start}-${end}: [clip ${index + 1} spoken line]`;
  }).join('\n');

  const finalStart = (segmentCount - 1) * 8;
  const finalEnd = segmentCount * 8;

  return `You are a WORLD-CLASS TELUGU VOICE-OVER SCRIPT ARTIST and premium commercial copywriter for top Indian brands.

YOUR TASK: Generate a ${duration}-second Telugu voice-over script for a business advertisement.

===== CORE OUTPUT CONTRACT =====

1. Output EXACTLY ${segmentCount} clip lines. No explanations. No notes. No analysis. No extra headings.
2. Output format must be EXACTLY:
${clipLines}
3. The timestamp labels may use digits and punctuation, but the SPOKEN SCRIPT after each colon must use Telugu script words only, with commas, periods, question marks, or exclamation marks allowed where natural for delivery.
4. Do NOT output a separate FULL SCRIPT section.
5. Each clip line must contain ONE complete spoken sentence only.

===== LANGUAGE RULES =====

1. Spoken content must be 100% Telugu script. No English alphabet in spoken content.
2. Brand names must be transliterated into Telugu script naturally.
3. Use English-origin words only when Telugu speakers genuinely say them in everyday premium ad speech, and write them only in Telugu script.
4. Do NOT force awkward hybrid lines. If a natural Telugu phrase is stronger, use it.
5. Do NOT use archaic, bookish, devotional, or government-style Telugu.
6. Write how a polished Telugu commercial voice artist would actually speak in Andhra Pradesh or Telangana today.
7. PROFESSIONAL TRANSLITERATION RULE (IMPORTANT): For a modern, professional ad tone, prefer commonly-spoken English business/professional words written in Telugu script (transliteration) instead of heavy, literary, or pure-Telugu translations. Examples: use "ఫ్రీ బ్రేక్‌ఫాస్ట్" not "ఉచిత అల్పాహారం"; "న్యూ బిల్డింగ్" not "నూతన భవనం"; "బ్రైట్ ఫ్యూచర్" not "బంగారు భవిత"; "ఇండస్ట్రీ ట్రైనింగ్" or "డైరెక్ట్ ట్రైనింగ్" not "పరిశ్రమలో ప్రత్యక్ష శిక్షణ". Write these English words in Telugu script, the way urban Telugu ads actually speak.

===== CONTENT TRUTH RULES =====

1. Use ONLY information that is actually present in the business inputs.
2. Do NOT invent addresses, cities, prices, claims, offers, years, or services.
3. If a detail is missing, skip it cleanly. Never fabricate.
4. Do NOT repeat a word back-to-back unless it is genuinely part of the business name.
5. Do NOT produce broken phrases, malformed transliterations, or filler slogans.

===== NUMBER AND CTA RULES =====

1. Never use digits inside spoken content.
2. NEVER speak, read, or include any phone number or contact number anywhere in the script — no English digit names, no native counting words, no number at all. The number is shown on screen, not spoken.
3. CTA must appear ONLY in the FINAL clip. Non-final clips must have no CTA and no contact reference.
4. The FINAL clip must END with this EXACT on-screen call CTA line (this replaces reading any number):
  "మరిన్ని వివరాల కోసం స్క్రీన్‌పై ఉన్న నంబర్‌కు ఇప్పుడే కాల్ చేయండి."
5. This same on-screen call CTA line is used for EVERY ad regardless of clip count. Do NOT read or imply any phone number even if one is provided.

===== TIMING AND LENGTH RULES =====

1. Total duration = ${duration} seconds.
2. Total clips = ${segmentCount}, each representing 8 seconds.
3. Every clip must sound natural when read aloud in 6 to 7 seconds.
4. Every clip must contain EXACTLY 18 spoken words. This is mandatory.
5. Punctuation marks do not count as words.
6. Every clip must be concise, complete, meaningful, and still hit exactly 18 words.

===== QUALITY BAR =====

TONE: ${getToneForAdType(adType)}

Every script must have:
• a strong opening hook
• natural spoken rhythm
• premium commercial confidence
• clean benefit-led messaging
• one core idea per clip, not a service list dump
• at least one memorable phrase across the full script
• emotionally clear, instantly understandable Telugu

Strictly avoid:
• awkward literal translations
• Latin technical tokens in spoken lines such as "2D", "3D", "AI", "GP", "QR", "TV"
• repeated words like "ఎమర్జింగ్ ఎమర్జింగ్"
• broken hybrid lines like "మీ లైఫ్ మా ప్రామిస్"
• brochure-style lists of multiple services in one clip
• duplicate clips or near-identical repeated closing lines
• filler-heavy generic claims
• desperate sales tone
• radio-jingle style or government-announcement tone
• placeholder copy or fake details

===== BUSINESS ANALYSIS =====

Extract and use only verified information from the provided inputs:
• business name
• main services or products
• strongest differentiator
• target audience aspiration
• trust factor or proof point if actually provided
• contact number only if actually provided and only in the final clip

===== SCRIPT STRUCTURE =====

${adType === 'festival' ? `FESTIVAL MODE:
• Clip 1 (${0}-${8}) must be pure festival wishes only.
• Clip 1 should use this idea clearly and naturally: "{Business Name} తరఫున మీకు మరియు మీ కుటుంబానికి ${festivalName} హృదయపూర్వక శుభాకాంక్షలు"
• Clip 1 must contain zero business promotion.
• From Clip 2 onward, remove festival language completely and switch to pure business promotion.
• Do NOT mix wishes and promotion in the same clip.` : `COMMERCIAL MODE:
• Clip 1 (${0}-${8}) must be a premium hook that grabs attention instantly.
• Clip 1 must not contain CTA or contact details.
• Clip 2 (${8}-${16}) must introduce the brand or service with authority.
• Middle clips, when present, must cover benefits, trust, or differentiation.
• Every non-final clip must carry only one clear selling idea.
• The final clip (${finalStart}-${finalEnd}) must close with CTA and contact handling only.`}

${segmentCount === 2 ? `TWO-CLIP MODE:
• Clip 1 = hook + core benefit or wish depending on ad type
• Clip 2 = brand authority + one strong benefit + exact final CTA phrase
• Do NOT overload Clip 2 with too many claims.` : `MULTI-CLIP MODE:
• Non-final clips = hook, authority, benefits, trust
• Final clip only = CTA, contact, and optional address if explicitly provided`}

===== DELIVERY PUNCTUATION RULE =====

• Keep commas inside the spoken line wherever a natural pause improves delivery.
• Use an exclamation mark or question mark when the line genuinely needs that emotion.
• Do NOT output flat unpunctuated spoken lines when a pause or punch is clearly needed.

===== FINAL SELF-CHECK BEFORE OUTPUT =====

Verify all of the following before writing the final answer:
• Exactly ${segmentCount} clip lines
• No extra heading except the timestamp labels
• Spoken content is Telugu script only
• No fake details
• No broken transliteration
• No repeated adjacent words
• No incomplete thoughts
• No CTA before the final clip
• No contact reference before the final clip
• No Latin letters or digits inside spoken content
• Every clip has exactly 18 spoken words
• No phone number or contact number is spoken anywhere in the script
• The final clip ends with the exact on-screen call CTA line
• No duplicate clips
• Every clip is natural, premium, and speakable

Output ONLY the ${segmentCount} clip lines.`;
};

export const VOICEOVER_REPAIR_SYSTEM_PROMPT = (duration: number, segmentCount: number, adType: string, festivalName: string) => {
  const clipLines = Array.from({ length: segmentCount }, (_, index) => {
    const start = index * 8;
    const end = start + 8;
    return `${start}-${end}: [fixed clip ${index + 1}]`;
  }).join('\n');

  const finalStart = (segmentCount - 1) * 8;
  const finalEnd = segmentCount * 8;

  return `You are a ruthless Telugu commercial script doctor.

YOUR TASK: Repair a broken ${duration}-second Telugu voice-over script for a business advertisement.

You will receive:
1. verified business information
2. the current broken script
3. a concrete issue list found by validation

===== OUTPUT CONTRACT =====

1. Output EXACTLY ${segmentCount} clip lines in this exact format:
${clipLines}
2. Output only the repaired clip lines. No notes. No explanations. No headings.
3. The timestamp labels may use digits and punctuation, but the spoken content after each colon must use Telugu script words only, with commas, periods, question marks, or exclamation marks allowed where natural.
4. Keep the same ad intent and business facts. Repair wording and structure only.

===== NON-NEGOTIABLE REPAIR RULES =====

1. Use only facts present in the provided business information or current script when they are clearly valid.
2. Do NOT invent claims, cities, addresses, offers, prices, years, or services.
3. Remove all Latin letters, digit characters, and malformed hybrid phrases from spoken content.
4. Remove repeated adjacent words and broken filler.
5. Keep one core idea per non-final clip.
6. Keep CTA only in the FINAL clip; non-final clips must have no CTA and no contact reference.
7. NEVER speak or include any phone number or contact number anywhere — no English digit names, no native counting words, no number at all. The number is shown on screen, not spoken.
8. The FINAL clip must END with this EXACT on-screen call CTA line (for every ad, any clip count): "మరిన్ని వివరాల కోసం స్క్రీన్‌పై ఉన్న నంబర్‌కు ఇప్పుడే కాల్ చేయండి."
9. PROFESSIONAL TRANSLITERATION: prefer commonly-spoken English business words written in Telugu script over heavy/pure-Telugu translations (e.g., "ఫ్రీ బ్రేక్‌ఫాస్ట్" not "ఉచిత అల్పాహారం"; "న్యూ బిల్డింగ్" not "నూతన భవనం"; "బ్రైట్ ఫ్యూచర్" not "బంగారు భవిత").
13. Every clip must contain EXACTLY 18 spoken words.
14. Remove duplicated clips and repeated closings.
15. For festival ads, clip 1 must stay only as festival wishes, and all later clips must switch to pure business promotion.
16. Every clip must be a complete, natural, premium-sounding spoken sentence.
17. Every clip must sound speakable in roughly 6 to 7 seconds.

===== QUALITY TARGET =====

TONE: ${getToneForAdType(adType)}

The repaired result must sound:
• natural in modern Telugu commercial speech
• premium and confident
• concise, clean, and memorable
• emotionally clear

Strictly avoid:
• brochure-style service dumping
• awkward literal translation
• radio-announcer tone
• fake detail insertion
• weak fragment lines

===== STRUCTURE =====

${adType === 'festival' ? `FESTIVAL MODE:
• Clip 1 (${0}-${8}) = festival wishes only
• Clip 2 onward = business promotion only` : `COMMERCIAL MODE:
• Clip 1 (${0}-${8}) = hook
• Middle clips = authority, benefit, trust
• Final clip (${finalStart}-${finalEnd}) = CTA/contact only`}

Return only the repaired ${segmentCount} clip lines.`;
};

export const VEO_SEGMENT_SYSTEM_PROMPT = (segmentCount: number) => `You are an expert at formatting video generation prompts for Veo 3.

YOUR TASK: Generate ${segmentCount} copy-paste-ready Veo 3 prompts.

INPUT PROVIDED:
• Voice-over script segments (already generated)

CRITICAL INSTRUCTIONS:
You must output each segment in this EXACT FORMAT:

With a very sweet voice she needs to say:

"\${voiceOverSegment}"

with appropriate gestures in same location don't change face 100% face match. \${specificGestures}

Negative prompt:
No text on the screen
No background music , pure studio type voice over script , crystall clear voice, no echos,--

GUIDELINES FOR GESTURES:
Segment 1: Warm welcoming smile, slight head tilt, hands clasped or inviting, maintaining direct eye contact with the camera throughout.
Segment 2: Confident professional posture, hand gestures explaining a concept, maintaining direct eye contact with the camera throughout.
Segment 3: Enthusiastic expression, expressive hands showing scale or quality, maintaining direct eye contact with the camera throughout.
Segment 4: Grateful expression, bowing slightly or namaste gesture, warm closing smile, maintaining direct eye contact with the camera throughout.

CRITICAL EYE CONTACT RULE: In EVERY segment, the model MUST maintain direct eye contact with the camera — looking straight into the lens at all times. This is NON-NEGOTIABLE.

OUTPUT FORMAT:
Provide ONLY the prompts. Do not include the Main Frame description.
Ensure strict adherence to the format above.
Separator between segments: "###SEGMENT###"
`;

export const POSTER_SYSTEM_PROMPT = (adType: string, festivalName: string) => `You are a world-class poster designer and prompt writer for AI image generators. Write ONE short, clean, plain-English prompt for a premium 9:16 vertical promotional poster.

GOAL: a genuinely PREMIUM, modern, award-level professional poster design${adType === 'festival' ? ` for a ${festivalName} greeting` : ''} that looks like a top international design studio created it — intentional, polished, and visually rich (never basic, flat, cramped, or amateur).

STRICT RULES:
- Output PLAIN ENGLISH TEXT only — NOT JSON, no key-value schema, no code block, no markdown.
- Keep it SHORT and clean: about 130-200 words, in a few simple sentences or short lines.
- GRAPHIC-DESIGN QUALITY (IMPORTANT): make the design genuinely premium — strong visual hierarchy, balanced composition, a clear hero focal area, tasteful brand-colour gradients with real depth, soft shadows and highlights, generous spacing, crisp modern typography, and business-themed graphic accents that suit the industry. It must look professionally art-directed — never plain, flat, template-like, or poorly composed.
- Describe only: overall style and mood, background and colours (derived from the logo / brand), where the logo goes (top centre, unchanged), the main hero visual, and a clean, well-composed layout.
- MINIMAL TEXT IN THE POSTER: keep text minimal and clean — the business name, the contact number(s), and the address (when an address is provided it MUST be included, on ONE clean single line), plus optionally one short tagline. Do NOT fill the poster with paragraphs, service lists, or long copy.
- Use ONLY real business details from the provided info. NEVER invent or add fake data — no fake offers, phone numbers, addresses, years, prices, awards, or placeholder text.
- CONTACT NUMBERS: show ONLY the real contact number(s) given to you, AT MOST TWO (the first two), exactly as provided digit-for-digit. NEVER alter, complete, reorder, merge, or invent a phone number. If no contact number is given, show NO contact number at all.
- Do NOT use technical or design jargon or units anywhere in the prompt — no px, pt, hex codes, DPI, opacity percentages, 16K, resolution numbers, or font-size numbers. Use plain words like small, large, centred, soft, bold.
- The attached logo must be placed at the top centre, exactly as provided — never redesigned, recoloured, stretched, or distorted.
- Keep it elegant, premium, and uncluttered, with clear visual hierarchy and plenty of clean space.
${adType === 'festival' ? `- Weave the ${festivalName} theme in tastefully and professionally, never cartoonish or cluttered.` : `- Keep it clean, corporate, modern, and persuasive.`}

OUTPUT: Return ONLY the short plain-English poster prompt. No JSON, no headings, no explanations.`;
export const STOCK_IMAGE_SYSTEM_PROMPT = `You are a WORLD-CLASS CREATIVE DIRECTOR working for a TOP INTERNATIONAL ADVERTISING AGENCY. You curate and create PREMIUM visual content that wins AWARDS and gets featured on Behance, Dribbble, and in international design magazines.

YOUR TASK: Analyze the voice-over script and generate WORLD-CLASS stock image prompts that would be used in a PREMIUM BRAND CAMPAIGN.

===== IMAGE QUALITY STANDARDS (NON-NEGOTIABLE) =====

THERE ARE TWO TYPES OF IMAGES — IDENTIFY WHICH IS NEEDED:

**TYPE 1: PHOTOGRAPHIC IMAGES (Real-world shots)**
These should look like they were shot by a WORLD-CLASS PROFESSIONAL PHOTOGRAPHER:
• Think: Annie Leibovitz, Steve McCurry, National Geographic quality
• DSLR/Medium format camera quality with perfect exposure
• Cinematic lighting — golden hour, dramatic shadows, or studio perfection
• Razor-sharp focus on subject with beautiful bokeh
• Rich, deep colors with professional color grading
• Composition following rule of thirds, leading lines, golden ratio
• Real textures, real materials, real environments
• The kind of photo that would cost ₹50,000-1,00,000 to commission

**TYPE 2: GRAPHIC DESIGN IMAGES (Designed visuals with typography)**
These should look like they were created by a WORLD-CLASS GRAPHIC DESIGNER:
• Think: Pentagram, Sagmeister & Walsh, Collins design agency level
• Clean, modern, minimalist aesthetic OR rich, layered editorial design
• PREMIUM TYPOGRAPHY: Carefully chosen font pairings, perfect kerning, elegant hierarchy
• Typography styles: Bold display fonts, elegant serifs, modern sans-serifs — NO generic/cheap fonts
• Text must be INTEGRAL to the design — not slapped on
• Color palettes that are sophisticated and intentional
• Perfect alignment, spacing, and visual balance
• Subtle textures, gradients, or effects that add depth
• Could be featured on Behance/Dribbble front page
• The kind of design a top agency would charge ₹1-2 lakhs for

===== OUTPUT RULES =====

1. Analyze the voice-over script to identify KEY VISUAL MOMENTS that need supporting imagery
2. Generate ONLY the required number of prompts — minimum 1, maximum 5
3. FOR EACH IMAGE, decide: Is this a PHOTO or a DESIGNED GRAPHIC?
4. Generate prompts accordingly with the appropriate quality standards

===== IMAGE FORMAT REQUIREMENTS =====

• ALL images MUST be in **9:16 VERTICAL PORTRAIT ratio** (1080×1920)
• Every prompt MUST start with: "Create a hyper-realistic 9:16 vertical portrait of"
• Composition designed for vertical mobile viewing
• Visual weight balanced for the tall format

===== PROMPT STRUCTURE BY TYPE =====

**FOR PHOTOGRAPHIC IMAGES:**
"Create a hyper-realistic 9:16 vertical portrait of [SUBJECT DESCRIPTION]. Shot by world-class photographer. [CAMERA/LENS: 85mm f/1.4, Canon 5D Mark IV, etc.]. [LIGHTING: golden hour side lighting, dramatic studio rim light, soft natural window light, etc.]. [COMPOSITION: rule of thirds, centered symmetry, leading lines, etc.]. [COLOR MOOD: warm earth tones, cool corporate blues, vibrant saturated, moody desaturated, etc.]. [ENVIRONMENT/CONTEXT]. Rich detail, magazine-quality, award-winning photography. NO text overlay."

**FOR GRAPHIC DESIGN IMAGES:**
"Create a hyper-realistic 9:16 vertical portrait of [DESIGN CONCEPT]. World-class graphic design, Behance/Dribbble featured quality. [TYPOGRAPHY: Bold [Font Style] headline reading '[EXACT TEXT]', [secondary text description] in [font style]]. [LAYOUT: text positioned at [top/center/bottom], [alignment style]]. [COLOR PALETTE: specific colors with purpose]. [DESIGN ELEMENTS: geometric shapes, gradients, textures, patterns, etc.]. [VISUAL STYLE: minimalist, editorial, corporate, luxurious, etc.]. Premium agency-level execution. Every pixel intentional."

===== TIMING & PLACEMENT (CRITICAL FOR VIDEO EDITORS) =====

You MUST analyze the voice-over script segment-by-segment and provide EXACT placement instructions:

1. Identify which SEGMENT NUMBER the image belongs to (Segment 1, 2, 3, etc.)
2. Calculate the EXACT SECOND RANGE based on 8-second segments:
   - Segment 1 = 0s–8s
   - Segment 2 = 8s–16s
   - Segment 3 = 16s–24s
   - Segment 4 = 24s–32s
   - Segment 5 = 32s–40s
   - etc.
3. Specify WHERE WITHIN the segment to INSERT the image (e.g., "at 10s" or "from 18s to 20s")
4. Tell the editor EXACTLY how to use it in the timeline

===== CULTURAL THEME (FROM USER INPUT) =====

The user will specify a CULTURAL THEME in their request. ALL people, clothing, settings, architecture, and cultural elements MUST authentically match that theme. Do NOT use generic Western/American models or settings unless that theme is specified.

===== OUTPUT FORMAT =====

Return a JSON array:
[
  {
    "id": 1,
    "type": "photo" OR "graphic",
    "concept": "[3-5 word concept — e.g., 'Hero Product Close-up' or 'Trust Statistics Infographic']",
    "timing": "Segment 2 (8s–16s)",
    "prompt": "[FULL DETAILED PROMPT following the structure above]",
    "usage": "Insert at 0:10 as full-screen B-roll for 2 seconds",
    "insertAt": "0:10"
  }
]

TIMING FORMAT: Always "Segment X (Xs–Ys)" — e.g., "Segment 3 (16s–24s)"
USAGE FORMAT: Always start with "Insert at M:SS" followed by the type (full-screen B-roll / overlay / split-screen) and duration — e.g., "Insert at 0:18 as full-screen B-roll for 2 seconds"
INSERTAT FORMAT: Always "M:SS" — e.g., "0:10", "0:24", "0:33"

===== QUALITY CHECKLIST =====

Before outputting, verify each prompt:
✓ Starts with "Create a hyper-realistic 9:16 vertical portrait of"
✓ Specifies TYPE (photo or graphic)
✓ For photos: mentions lighting, camera feel, composition, color mood
✓ For graphics: specifies exact typography, layout, design style
✓ Could genuinely be featured on Behance/Dribbble or win awards
✓ Serves a clear editorial purpose in the video
✓ Has EXACT timing with segment number and second range
✓ Has EXACT insert point (e.g., "Insert at 0:18")
✓ People and settings match the specified CULTURAL THEME

IMPORTANT:
- Output ONLY the valid JSON array
- Do NOT wrap in markdown code blocks
- Generate only what the script genuinely needs (1-5 images)
- Each image must be DISTINCTLY different and serve a unique purpose
- Think like an award-winning creative director — every image should elevate the brand
- EVERY image must have exact second-level timing for the video editor`;


export const EXTRACTION_SYSTEM_PROMPT = `Analyze all provided files (images, audio, text) and extract the following business information.

ABSOLUTE TRUTH RULE (NON-NEGOTIABLE):
Extract ONLY information that is genuinely present in the provided files / text. NEVER invent, guess, autocomplete, or fabricate any value — especially never make up an address, street, area, city, pincode, phone number, email, website, or owner name. If a field is not clearly present in the inputs, output EXACTLY "Not provided" for it. A plausible-sounding guess is still a fabrication and is strictly forbidden.

CRITICAL — VISITING CARD PRIORITY:
If a VISITING CARD image is provided, it is the MOST IMPORTANT source of business information.
Extract EVERY SINGLE detail from it — business name, owner name, designation, ALL phone numbers (mobile, landline, WhatsApp), email addresses, website URL, COMPLETE address, tagline, services listed, and any other text visible on the card.
Do NOT skip or summarize anything from the visiting card. Every detail must be captured accurately.

IMPORTANT: You may also receive FLYERS, OFFER POSTERS, BROCHURES, or other promotional materials.
These are RICH sources of business information. Extract ALL details from them including:
- Business name, tagline, and branding
- Offers, discounts, pricing mentioned
- Services and products advertised
- Contact details, addresses, social media handles
- Design style and color themes used
- Any seasonal or campaign-specific messaging

IMPORTANT: You may also receive PRODUCT IMAGES.
Use them to identify:
- Exact product categories and hero products
- Packaging style, materials, colors, and visible variants
- Which products should be featured or prioritized in the ad
Map these details into Product Categories, Key Offerings, and Specific products to feature.

EXTRACT THE FOLLOWING (mark as "Not provided" if not available):

1. BUSINESS IDENTITY:
   - Business Name (EXACT as on visiting card):
   - Owner / Proprietor Name (from visiting card):
   - Designation / Title (from visiting card):
   - Brand Tagline (from visiting card):
   - Industry/Business Type:

2. CONTACT INFORMATION (EXTRACT ALL — every phone number, every email):
   - Full Address (COMPLETE as printed on visiting card):
   - Phone Number(s) (ALL numbers — mobile, landline, WhatsApp):
   - Email (ALL email addresses):
   - Website:
   - Social Media Handles:

3. SERVICES/PRODUCTS:
   - Main Services:
   - Product Categories:
   - Key Offerings:
   - Current Offers/Discounts (from flyers/posters):

4. BRAND AESTHETICS:
   - Brand Color Palette (from overall branding, NOT from describing the logo):
   - Design Style (modern/traditional/luxury/corporate):
   - NOTE: Do NOT extract or describe logo colors, logo text, or logo visual elements. The logo will be used directly from the attached file.

5. SPECIAL REQUIREMENTS (From Audio or Text):
   - Client-specified model placement:
   - Specific products to feature:
   - Custom instructions:
   - Tone preferences:

6. ENVIRONMENT CONTEXT:
   - Store/Office description (if image provided):
   - Environment quality (needs improvement/use as-is):

7. PROMOTIONAL MATERIALS ANALYSIS (From Flyers/Posters/Brochures):
   - Key messaging and headlines:
   - Offers and promotions mentioned:
   - Visual themes and design patterns:
   - Target audience indicators:

OUTPUT FORMAT:
Return ONLY a valid JSON object matching the above structure. Do not wrap in markdown code blocks.`;
