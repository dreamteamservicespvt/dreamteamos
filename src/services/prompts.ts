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
      palette: 'rich maroon-taupe, oxblood-mocha, muted wine-beige, or rose-bronze suiting lifted from the client brand palette'
    },
    {
      keywords: ['emerald', 'green', 'sage', 'olive', 'mint'],
      palette: 'sage-greige, muted olive-taupe, eucalyptus stone, or warm sand tailoring with controlled green brand accents'
    },
    {
      keywords: ['navy', 'blue', 'teal', 'cyan', 'azure', 'royal blue'],
      palette: 'cool stone, steel greige, mist taupe, or pearl beige tailoring shaped by navy-teal brand accents'
    },
    {
      keywords: ['gold', 'champagne', 'mustard', 'amber'],
      palette: 'champagne taupe, warm almond, soft camel, or luxe cream tailoring with restrained gold undertones'
    },
    {
      keywords: ['pink', 'rose', 'blush', 'peach', 'coral'],
      palette: 'blush taupe, rose-beige, powder mocha, or champagne blush tailoring with polished feminine warmth'
    },
    {
      keywords: ['black', 'charcoal', 'graphite', 'slate', 'grey', 'gray', 'silver'],
      palette: 'graphite greige, slate taupe, metallic stone, or smoke-beige tailoring with restrained charcoal depth'
    },
    {
      keywords: ['purple', 'plum', 'violet', 'lavender', 'lilac'],
      palette: 'mauve-taupe, plum-beige, soft truffle, or couture lavender-greige tailoring with editorial restraint'
    },
    {
      keywords: ['orange', 'terracotta', 'rust'],
      palette: 'caramel beige, terracotta-taupe, honey stone, or warm sand tailoring with refined amber warmth'
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
    return 'real, operational, premium education consultancy office. Counseling desks, application review tables, brochure stands, university partnership walls, passport or document-review counters, success-story displays, and branded admissions guidance surfaces should define the background. The space should instantly communicate education guidance, admissions support, and counseling credibility';
  }

  return 'real, operational college, school, or educational institute environment. Campus entrance branding, admissions desk, academic reception, classroom or lecture hall depth, seminar hall cues, library shelves, lab stations, corridor notice boards, student interaction zones, and institutional signage should define the background. The space should instantly communicate live campus energy, education trust, student ambition, and real institutional credibility';
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
    medical: 'soft ivory, pearl white, or sterile beige with subtle blue-grey accents for a clean healthcare-trust feel',
    realestate: 'sandstone beige, camel, mocha, muted gold-beige, or warm taupe for authority and premium trust',
    fashion: 'blush-beige, rosy taupe, champagne blush, warm nude, or couture pastel neutrals with polished femininity',
    food: 'warm cream, honey beige, latte, caramel beige, or tasteful hospitality neutrals with inviting warmth',
    tech: 'cool stone beige, mist grey-beige, champagne-taupe, soft steel greige, or muted blue-grey accents for modern polish',
    education: getEducationSuitPalette(businessContext),
    solar: 'soft sand, sunlit beige, warm khaki-beige, muted sage-beige, or clean-energy neutrals',
    laundry: 'fresh ivory, soft sand, pearl beige, clean greige, or airy blue-grey neutrals that still feel premium',
    mattress: 'soft cream, almond beige, powder taupe, serene greige, or comfort-led pastel neutrals',
    electrical: 'graphite-beige, steel greige, sand-taupe, muted slate-beige, or precise service-led neutrals',
    tea: 'warm cream, leaf-tinted beige, honey sand, soft caramel, or earthy premium neutrals',
    jewellery: 'champagne gold-beige, blush taupe, rose-beige, luxe cream, or refined mocha-glow tones',
    security: 'commanding taupe-charcoal, graphite-beige, muted metallic greige, or disciplined stone neutrals',
    automobile: 'graphite-beige, metallic greige, sand-taupe, espresso-beige, or showroom-grade premium neutrals',
    pharma: 'clean ivory, sterile cream, pearl beige, or subtle clinical blue-grey neutrals',
    transport: 'structured stone beige, muted khaki, cool taupe, or logistics-grade premium neutrals with restrained blue accents',
    fitness: 'sculpted greige, athletic sand, warm stone, or energetic premium neutrals with subtle slate accents',
    beauty: 'blush-beige, rosy taupe, champagne blush, soft nude, or elegant pastel neutrals with luxury glow',
    default: 'a premium business-specific suit palette derived from the logo colors, brand mood, and interior materials rather than a reusable default beige'
  };

  const sectorPalette = palettes[businessType] || palettes.default;
  const brandPalette = getBrandDrivenSuitPaletteFromContext(businessContext);
  const paletteFamilyRule = 'Treat this as an approved palette family with multiple valid premium beige or pastel shades, not one fixed suit color. Different businesses must not collapse into the same reusable beige. Within one campaign, the suit may shift shade only inside this approved family when the script, business zone, or lighting supports it.';

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
${!isFestival ? `
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
  polished, intentional, flawless but human
${isProfessional ? `
PROFESSIONAL SUIT BEAUTY OVERRIDE (MANDATORY):
CASTING OVERRIDE — SUIT BRANCH (MANDATORY):
- She must be strictly 20 to 25 years old only in this suit branch — youthful, fresh, modern, and unmistakably in that age band
- This is NOT a corporate headshot. This is NOT a stock photo shoot.
- This is a HIGH-BUDGET NATIONAL BRAND CAMPAIGN.
- The model must feel like the luxury campaign face selected after 500 auditions — top 0.1% beauty tier, stop-scrolling presence, star quality, and clearly above normal office-beauty level.
- She must still read as youthful, radiant, camera-ready, and actress-level beautiful inside the professional styling — never plain, severe, matronly, forgettable, or generic.
- HARD NEGATIVE RULE: reject plain receptionist energy, HR portrait energy, employee ID-photo look, LinkedIn headshot energy, bank-uniform vibe, startup-office casualness, and generic stock corporate beauty.

FACE — LUXURY CASTING BRIEF (SUIT BRANCH):
- Perfect oval face with soft feminine harmony and refined screen-ready structure
- Large almond-shaped deep brown eyes with bright whites, natural depth, magnetic pull, and expressive premium Indian screen presence
- Naturally full arched brows that frame the eyes strongly without looking drawn-on
- Slender photogenic nose with refined bridge and delicate tip
- Softly full lips with a defined cupid's bow, natural softness, and a polished campaign finish
- Subtly high cheekbones, clean feminine jawline, and a delicate refined chin
- Fresh radiant Indian complexion with visible pores, true micro-texture, smooth clear skin, natural glow on the high points, and absolutely no plastic skin or filter finish

MAKEUP — HIGH-FASHION COMMERCIAL LEVEL (SUIT BRANCH):
- Dewy perfected-real skin with believable texture, never waxy and never over-smoothed
- Softly defined warm-brown eyes with subtle kajal presence and refined lash definition
- Structured clean brows, refined blush warmth, and gentle contour only where natural
- Intentional nude-rose or soft warm lip tone that still looks realistic and premium on camera
- No spectacles, no eyewear, no harsh contour, no loud editorial drama, no frozen expression, and no beauty-filter finish

EXPRESSION — STAR QUALITY (SUIT BRANCH):
- Real warm smile only — never blank, never cold, never stiff, never corporate-neutral
- Alive direct eyes only — she must look straight into the lens as if she owns the shoot
- Subtle laugh-line realism is allowed because she must feel human and premium, not frozen
- Relaxed star-quality confidence, aspirational warmth, and trust-building charisma are mandatory

COMMERCIAL REALISM FORMULA (ABSOLUTE — EVERY CHEMICAL MUST BE PRESENT):
- FACE ANCHOR: Bollywood-heroine quality, brand-ambassador face, photogenic sharp attractive features, premium Indian screen presence, and memorable beauty that still feels human and believable
- LIGHT SOURCE: natural daylight from the left window OR a believable left-side daylight source with soft cinematic fill light — never flat front lighting, never harsh synthetic glam light
- SKIN TRUTH: natural skin texture, visible real pores, dewy complexion, soft tonal variation, natural micro-highlights, no filter, no smoothing, no waxy finish, no plastic retouching
- SCENE DEPTH: real architectural interior of the client's actual business, background softly blurred with natural depth of field, never a studio backdrop, never a fake luxury hall, never a generic set
- CAMERA PHYSICS: Canon EOS R5 realism, 85mm f/1.8 portrait look, shallow depth of field, natural color science, sharp eye focus, and premium DSLR lens falloff
- If even one of these realism chemicals is missing, the result has FAILED and must be regenerated` : ''}` : `
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

POSE ANCHOR FOR THE HERO MAIN FRAME (MANDATORY):
- The hero or anchor image must be EXACTLY centered with
  balanced left-right spacing
- Hands gently folded at the waist or lower abdomen, one
  hand resting over the other, fingers relaxed
- Camera at chest level, mid-shot framing only, with a calm,
  premium, welcoming posture` : `POSE & FRAMING (PREMIUM COMMERCIAL PHOTOGRAPHY — NATURAL VARIATION ALLOWED):
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
• HARD NEGATIVE: no wedding-stage styling, no temple-jewellery overload, no festive garlands, no bridal makeup, and no generic "traditional wear" shortcut that ignores the actual business identity` : `ATTIRE (PREMIUM BEIGE/PASTEL SUIT — LUXURY CAMPAIGN REALISM — MANDATORY):
This is NOT generic officewear and NOT a stock corporate portrait.
It must feel like a luxury Indian commercial campaign where a youthful, exceptionally beautiful actress-level ambassador is styled in a premium feminine suit.
This branch is for COMMERCIAL AD TYPE behavior only — never festival-themed, never celebratory, never saree-led, and never decorated with garlands, diyas, rangoli, or cultural-event props.
• The professional suit color MUST be DYNAMIC and BUSINESS-SPECIFIC — do NOT keep giving the same beige or same neutral suit to every client
• First derive the suit palette from the actual business type, logo colors, brand mood, and interior material cues — the outfit should feel chosen for THIS exact client campaign, not reused from a universal template
• Within one commercial campaign, keep the tailoring silhouette premium and consistent but allow clip-to-clip suit shade variation inside the approved business-specific palette when the script, business zone, or lighting makes that version feel more authentic
• Suit palette direction by business type:
  - Medical/Healthcare: soft ivory, pearl white, sterile beige with subtle blue-grey accents
  - Real Estate: sandstone beige, camel, mocha, muted gold-beige, or warm taupe with authority
  - Tech/Software/Agency: cool stone beige, mist grey-beige, champagne-taupe, soft steel greige, or muted blue-grey accents
  - Education/Consultancy: elegant almond, parchment beige, academic taupe, muted forest-beige, or dignified cream tones
  - Solar/Energy: soft sand, sunlit beige, warm khaki-beige, muted sage-beige, or clean energy neutrals
  - Food/Catering/Hospitality: warm cream, honey beige, latte, caramel beige, or tasteful hospitality warm neutrals
  - Jewellery/Luxury Retail: champagne gold-beige, blush taupe, rose-beige, luxe cream, or refined mocha-glow tones
  - Automobile: graphite-beige, metallic greige, sand-taupe, espresso-beige, or premium showroom neutrals
  - Beauty/Fashion: blush-beige, rosy taupe, champagne blush, warm nude, or couture pastel neutrals
  • Education institutions/campuses: parchment beige, sandstone cream, academic stone, cedar taupe, or soft sage-beige tones with premium campus polish
  • Education consultancies: elegant almond, dignified cream, polished latte-stone, parchment taupe, or muted olive-beige tones with counseling-office polish
  - Default: derive a premium suit tone from the logo and brand mood while staying elegant, feminine, and campaign-worthy
  • Treat the selected colors as an approved business-specific palette family with multiple valid shades — never one flat beige repeated for every client or every clip
• Avoid repeating the same suit color across different businesses unless the business palette genuinely demands it
• CASTING RULE FOR SUIT OUTPUTS: choose a premium Indian woman with youthful softness, bright expressive eyes, gentle rosy warmth, and believable campaign-level beauty — never a repeated default face, never a copied stock-model look, never a severe western executive archetype
• BUSINESS-SPECIFIC MODEL VARIATION: the face, complexion depth, styling nuance, and casting energy must change according to the specific [BUSINESS TYPE], brand personality, and client context so different businesses do NOT keep getting the same woman in a different suit
• BLAZER: premium well-tailored blazer in the chosen business-specific palette with elegant waist definition, refined shoulder structure, clean lapel roll, believable seam tension, and expensive matte-luxe suiting texture
• BLOUSE: crisp white fitted blouse or shirt under the blazer — clean collar line, fresh bright contrast, polished professional finish, and real fabric structure
• TROUSERS: slim formal trousers in the same business-specific suit family — straight or gently tapered cut, graceful premium drape, clean hem, and a sharp luxury-commercial silhouette
• Fabric: expensive matte-luxe suiting with believable weight, texture, sleeve fall, trouser break, lapel structure, and natural movement — never shiny polyester, never stiff costume fabric
• The tailoring must feel expensive because of real structure, real fabric behavior, and commercial styling polish — not because of theatrical costume exaggeration
• Styling must preserve beauty and femininity: the woman should still feel glamorous, attractive, warm, actress-level beautiful, youthful, and intelligent in the suit — never harsh, lifeless, plain, or overly stern
• Suit-girl casting must follow luxury beauty logic: stop-scrolling face value, star-quality smile, alive direct eyes, and the kind of premium photogenic appeal associated with top Indian national campaigns
• The suit must read as a luxury fashion-commercial look, not HR portrait clothing, not a bank-uniform vibe, not startup officewear, and not stock-photo executive styling
• HARD NEGATIVE BAN: no plain receptionist look, no HR portrait look, no employee ID-photo look, no LinkedIn headshot energy, and no generic office-worker prettiness
• Keep the chosen palette rich, dimensional, creamy, and expensive — never flat beige, never chalky, never washed out, never lifeless under indoor lighting
• Face and grooming direction: soft youthful facial features, perfect oval harmony, large expressive almond eyes, clean strong brows, elegant nose, softly full lips, fresh natural glow, subtle rosy warmth in the cheeks, refined lip color, no spectacles, no eyewear, no harsh retouching, no bridal heaviness, no waxy or synthetic skin finish
• The overall impression should feel like a premium young corporate professional portrait with approachable confidence, modern elegance, and inspiring energy
• Hair should feel premium and feminine with silky dark black hair only, healthy shine, and polished movement that flatters the face — refined blowout, elegant straight finish, or controlled soft waves are preferred over stiff corporate hair
• Pose and styling should feel soft-confident and premium: graceful posture, subtle elegance, poised warmth, camera-ready polish — not rigid boardroom stiffness
• Preserve true photographic realism: visible pores · natural warm Indian complexion · real fabric tension · authentic tailoring details · no plastic beauty-filter skin · no synthetic fashion-render feel
• The final suit impression must feel like a real luxury beauty-fashion campaign shot inside the best executive-facing or consultation-facing zone of the actual business — beautiful woman first, premium tailoring second, business truth always
• The suit branch must NEVER drift into a plain corporate employee look — if the model does not still feel top-tier beautiful and campaign-worthy, regenerate`}

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
${!isFestival && businessContext ? `• For this client, prioritize these realistic installation surfaces: ${clientLogoPlacementGuidance}
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
      camera: 'Close mid-shot, straight-on at chest or eye level, subject perfectly centered in frame with balanced left-right spacing and roughly 70% frame presence — classic brand ambassador establishing shot',
      pose: 'Hands gently folded at waist, one hand resting over the other, confident welcoming posture — brand ambassador stance',
      purpose: 'Introduce the brand ambassador and the business atmosphere. The viewer sees the model AND instantly recognizes the business type from the environment.',
      logoPlacement: getShotLogoPlacementForBusiness('hero', detectedBusinessType, businessContext),
    },
    {
      key: 'showcase' as const,
      name: 'SHOWCASE / PRODUCT SHOT',
      location: 'Product display area / service showcase zone / core business section — where the actual products, services, or offerings are visible',
      camera: 'Close mid-shot with slight low-angle polish (camera slightly below chest), subject still occupying roughly 70% of frame while products/services remain visible on the other side',
      pose: 'One hand gesturing gently toward the products/services behind her, or resting on a display counter — naturally interacting with the business environment',
      purpose: 'Show what the business DOES. The model guides the viewer\'s attention to products, equipment, or services displayed behind/around her.',
      logoPlacement: getShotLogoPlacementForBusiness('showcase', detectedBusinessType, businessContext),
    },
    {
      key: 'credibility' as const,
      name: 'CREDIBILITY / TRUST SHOT',
      location: 'Near the business logo wall / achievement display / certification area / consultation zone — the trust-building section of the establishment',
      camera: 'Close mid-shot with a gentle 10-15° body angle while the face still addresses camera directly, creating depth with the logo/achievements visible in the background',
      pose: 'Confident stance with slight body turn toward the logo/achievements, warm authoritative expression — exuding trust and credibility',
      purpose: 'Build trust and brand authority. The logo is prominently visible, along with any awards, certifications, or trust signals.',
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
   
   Generate a COMPLETE, detailed image generation prompt following ALL the rules/sections from the base prompt above.
   This frame sets the visual foundation — character face, hair, skin, beauty, attire, jewellery, AND this specific location within the business.
   This is the ONLY clip where you fully describe the model's physical appearance.
  The chosen location, visible business cues, pose energy, and emotional tone must directly match Clip ${clipNum}'s voice-over line.
    The logo must feel physically installed on ${shot.logoPlacement}, with believable depth, reflections, and material behavior.
  Include ALL sections: SUBJECT, FACE, MAKEUP, EXPRESSION, HAIR, ATTIRE, JEWELLERY, ENVIRONMENT, LOGO PLACEMENT, CAMERA, OVERALL RESULT.
   The subject must occupy roughly 70% of the frame, maintain direct eye contact with the camera, and the attached logo must appear fully visible in the upper background without any alteration.
   Target length: 500-800 words.`;
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
  • 📍 The NEW LOCATION within the business (a completely different spot from previous clips — describe the area in rich detail, and make sure it is the best fit for Clip ${clipNum}'s voice-over message)
  • 🔍 What's visible in the background at this new location (business-specific elements, furniture, displays, signage, and proof points that directly support the script line)
  • 🧍 The new POSE — body angle, hand position, interaction with environment elements at this location in a way that matches the clip's selling point
   • 😊 The new EXPRESSION — emotional tone matching Clip ${clipNum}'s voice-over script
   • 🎥 The new CAMERA ANGLE and composition
  • 💡 How lighting naturally differs at this new spot (e.g., near window = warm, interior = ambient) while still preserving the realism formula
  • 👁️ Mandatory direct eye contact to the camera while holding this new pose
  • 🪧 The attached logo placed on this clip's believable physical surface — ${shot.logoPlacement} — fully visible, physically installed, and completely unmodified
   
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

**Clip 1: 500–800 words** — Full detailed prompt with every section.
**Clips 2, 3, 4, etc.: 100–200 words MAXIMUM** — Short, location-focused prompts. If your continuation clip is longer than 200 words, you are re-describing the model. DELETE those lines.

A continuation clip that is 500+ words means you are repeating model/attire/jewellery descriptions — this is WRONG and will produce different-looking women across clips.

===== OUTPUT FORMAT (CRITICAL — MUST FOLLOW EXACTLY) =====

Separate each clip's prompt with the marker: ###CLIP###

**CLIP 1 FORMAT (FULL — 500-800 words):**

Clip 1 – Main Frame Prompt (${shotDesigns[0].name})
Create a Ultra-realistic DSLR photograph, single image, 9:16 vertical…
[Full SUBJECT section with face, hair, beauty description, and an explicit natural rich black hair only rule]
[Full ATTIRE section]
[Full JEWELLERY section]
[Full ENVIRONMENT section with real business base layer ${adType === AdType.FESTIVAL ? '+ festival cues' : '+ business-proof layer'}]
[Full CAMERA & REALISM section]
[Full OVERALL RESULT]

###CLIP###

**CLIP 2+ FORMAT (SHORT — 100-200 words ONLY):**
Here is an EXAMPLE of what a correct Clip 2 prompt looks like:

Clip 2 – Main Frame Prompt (${shotDesigns[1 % shotDesigns.length].name})
Use the attached reference frame image as the exact identity and styling anchor for this clip — same woman, same core styling, the exact same natural rich black hair from the first frame onward, same wardrobe family, same jewellery set, perfectly consistent with the attached reference frame.

POSE: Subject positioned on the right side using rule-of-thirds, one hand gesturing gently toward the product display behind her. Close mid-shot, camera slightly below chest level, subject still occupying roughly 70% of the frame and maintaining direct eye contact with the camera.

NEW LOCATION: She has moved to the product showcase area of the office. Behind her, a large sleek monitor displays website designs and AI-powered tools. Modern display shelving with tech awards and client project samples visible. The attached logo signage is mounted in the upper background on the far wall, fully visible and unmodified.

${adType === AdType.FESTIVAL ? `Festival decorations from the office are still visible — mango leaf thoranam above the display, marigold garlands framing the monitor, brass deepam on the desk corner, rangoli patterns continuing on the floor.

LIGHTING: Cool blue-tinted ambient light from the display screens blends with warm golden festival lamp glow — creating a unique tech-meets-tradition atmosphere.

MOOD: Professional, aspirational — showcasing the company's innovative capabilities while celebrating ${festivalName || 'the festival'}.` : `BUSINESS PROOF LAYER: The strongest commercial proof surfaces are clearly visible — branded presentation materials, premium product/service displays, certification frames, consultation assets, or operational fixtures that make the business instantly legible without looking staged.

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
  return `Create a 9:16 vertical 4K advertisement poster.

STRICT CANVAS RULE:

* Design ONLY the top 7% horizontal strip as the header. The remaining area must be empty.
* Do NOT place any elements below the top 7% boundary.

HEADER OUTPUT CONTRACT (MUST FOLLOW EXACTLY):

1) The header may contain ONLY the following items, and ONLY if they are present in the extracted business data:
   - Logo (use the attached logo image exactly if provided)
   - Business name
   - Address (shortened intelligently if needed)
   - Contact numbers (one or more)
   - Email
   - Website

2) Do NOT add, invent, or imply any other content (no headlines, offers, CTAs, urgency, product images, decorative micro-tags, pricing, or promotional copy).

3) If any of the listed fields are missing from the extracted data, OMIT that field — do NOT fabricate or substitute values.

4) Layout guidance (informational only): keep the header minimal and readable inside the 7% strip. Prioritize clear visibility and contrast for contact numbers and business name. Do not include extra icons, badges, or decorative illustrations beyond a simple location icon for address if absolutely needed.

5) Output requirement: return a short, plain-text prompt describing the header composition and exact content to place. The prompt must list only the present fields and their exact values (no extra commentary). Example formats accepted:

   - If all fields present: "LOGO: <inline image>; NAME: <Business Name>; CONTACT: <numbers>; EMAIL: <email>; WEBSITE: <url>; ADDRESS: <short address>"
   - If some fields missing: include only the available fields in the same concise key-value style.

6) Never wrap the output in code blocks and do not output explanations. Output must be copy-paste ready and truthful to the provided extracted business info.`;
LEFT:

* Logo OR premium badge
* Subtle glow / embossed effect

CENTER (MAIN HOOK):

* Strong, short, high-impact headline
* Highlight numbers (₹, %, benefits)
* Maintain strong readability and hierarchy

TOP RIGHT (PRIMARY CTA – HIGHEST PRIORITY):

* Place ALL contact numbers here
* Large, bold typography (high visibility)
* Add phone icon
* Place inside highlighted container (pill / glow box)
* Ensure maximum contrast
* Support multiple numbers with clean separators ( | )

RIGHT (BELOW CONTACT):

* Show urgency (date / limited / closing soon)
* Smaller than contact but clearly visible

BOTTOM STRIP INSIDE HEADER (MANDATORY FOR ADDRESS):

* If address/location is present → MUST display here
* Use short, clean version (area + city preferred)
* Add location icon
* Keep font smaller than contact but readable
* Do NOT overcrowd or wrap excessively
* If address is long → intelligently shorten while preserving clarity

OPTIONAL MICRO TAG:

* Add small trigger like “Limited”, “Offer”, “2 Chances” if space allows

DESIGN QUALITY (WORLD-CLASS):

* Cinematic lighting and depth
* Premium color grading
* Strong contrast for mobile ads
* Clean spacing, no clutter
* CTA (contact) remains visually dominant

COLOR STRATEGY:

* Adapt based on business type
* Ensure contact CTA has highest contrast

TYPOGRAPHY:

* Max 1–2 fonts
* Clear hierarchy:

  1. Contact (CTA)
  2. Headline (Hook)
  3. Address / urgency

LAYOUT RULES:

* Everything strictly inside top 7%
* Perfect alignment and spacing
* No overlapping elements
* Maintain clean premium feel

OUTPUT:
Ultra-premium, high-conversion Meta Ads header with dominant contact CTA and clearly visible address, strictly confined to top 7%.`;
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

===== CONTENT TRUTH RULES =====

1. Use ONLY information that is actually present in the business inputs.
2. Do NOT invent addresses, cities, prices, claims, offers, years, or services.
3. If a detail is missing, skip it cleanly. Never fabricate.
4. Do NOT repeat a word back-to-back unless it is genuinely part of the business name.
5. Do NOT produce broken phrases, malformed transliterations, or filler slogans.

===== NUMBER AND CTA RULES =====

1. Never use digits inside spoken content. Use Telugu-script spoken forms only.
2. Contact number must appear ONLY in the FINAL clip.
3. CTA must appear ONLY in the FINAL clip.
4. For a 2-clip ad, the FINAL clip must use this exact phrase for contact handling instead of reading digits:
  "స్క్రీన్ పై ఉన్న నంబర్ కి ఇప్పుడే కాల్ చేయండి"
5. For ads longer than 2 clips, only the FINAL clip may include the contact number, read only as English digit names transliterated into Telugu script:
  జీరో, వన్, టూ, త్రీ, ఫోర్, ఫైవ్, సిక్స్, సెవెన్, ఎయిట్, నైన్
6. NEVER read a spoken phone number using native counting words like ఒకటి, రెండు, మూడు, నాలుగు, ఐదు, ఆరు, ఏడు, ఎనిమిది, తొమ్మిది.
7. When a phone number is spoken, group the digit names mainly in pairs.
8. Commas are allowed only between digit groups when they genuinely help delivery.
9. NEVER put a comma after every single digit. That creates robotic pronunciation.
  Example: "ఎయిట్ సెవెన్, వన్ టూ, సిక్స్ వన్, ఫైవ్ వన్, త్రీ నైన్"
  Wrong: "ఎయిట్, సెవెన్, వన్, టూ, సిక్స్, వన్, ఫైవ్, వన్, త్రీ, నైన్"
10. If no valid contact number is provided, do NOT invent one.

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
• Spoken phone numbers use only transliterated English digit names in Telugu script
• Spoken phone numbers are grouped naturally, mainly in pairs
• Spoken phone numbers never use comma-after-every-digit delivery
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
6. Keep CTA and contact handling only in the final clip.
7. For a 2-clip ad, the final clip must use this exact phrase: "స్క్రీన్ పై ఉన్న నంబర్ కి ఇప్పుడే కాల్ చేయండి"
8. For ads longer than 2 clips, if a phone number is spoken, use only these digit names in Telugu script: జీరో, వన్, టూ, త్రీ, ఫోర్, ఫైవ్, సిక్స్, సెవెన్, ఎయిట్, నైన్.
9. Never speak a phone number using native counting words like ఒకటి, రెండు, మూడు, నాలుగు, ఐదు, ఆరు, ఏడు, ఎనిమిది, తొమ్మిది.
10. If a phone number is spoken, group the digit names mainly in pairs.
11. Use commas only between digit groups when they help the spoken rhythm.
12. Never place a comma after every single digit.
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

---

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

export const POSTER_SYSTEM_PROMPT = (adType: string, festivalName: string) => `You are a 30-years-experience world-class poster designer, graphic designer, premium visual director, and elite prompt engineer for AI image generators. You are 100% graphic designer, 100% creativity-focused, and specialized in creating INTERNATIONAL-LEVEL promotional poster designs for businesses. You generate the best possible poster prompts every time in ATOMIC-LEVEL structured JSON format so the result feels like a luxury-agency poster created by a top global design studio.

YOUR TASK: Generate ONE world-class poster design prompt as a structured JSON object.

POSTER GOAL:
- Create a world-class premium poster design prompt in 9:16 ratio
- Push ultra-premium professional graphic design quality with highly refined graphical elements
- Target 16K-quality visual richness in the prompt direction while preserving clean professional execution
- Always write the best possible prompt, never a basic or average design prompt
- Never invent fake business data, never insert dummy values, never use empty placeholder text in the actual design instructions
- Use only real extracted business information from the provided inputs
- If a required business field is unavailable, design around the missing field cleanly instead of fabricating text
- The attached logo must be placed at the top center
- If the attached logo has a non-transparent background, remove only the background cleanly and place the logo perfectly
- Never change the logo's structure, layout, proportions, design, colors, or visual identity

THE JSON OUTPUT MUST FOLLOW THIS EXACT SCHEMA:

{
  "posterType": "${adType === 'festival' ? `Festival Greeting — ${festivalName}` : 'Commercial / Promotional'}",
  "dimensions": {
    "ratio": "9:16",
    "orientation": "vertical",
    "resolution": "4K print-ready"
  },
  "canvas": {
    "primaryBackground": "[Exact gradient/color/texture — e.g., 'Rich radial gradient from #1a1a2e center to #0f0f23 edges']",
    "secondaryLayer": "[Overlay pattern or texture — e.g., 'Subtle geometric mesh pattern at 8% opacity, hexagonal grid']",
    "ambientEffects": "[Light effects — e.g., 'Soft golden bokeh orbs scattered, 3 large (60px), 8 medium (30px), diagonal light streak from top-right at 15% opacity']",
    "mood": "[Overall visual mood — e.g., 'Premium luxurious, warm sophisticated, high-trust corporate']"
  },
  "header": {
    "position": "top 8-12% of canvas",
    "brandLogo": {
      "placement": "[exact position — top-center only, horizontally centered, premium balanced spacing from top edge]",
      "size": "[e.g., '120x120px maximum']",
      "treatment": "[Original logo structure preserved exactly, background removed only if the uploaded logo lacks transparency, no redesign, no stretching, no layout change, no color change, subtle premium finishing only if needed]"
    },
    "headline": {
      "text": "[Primary headline — extracted from business info${adType === 'festival' ? `, include ${festivalName} greetings` : ''}]",
      "font": "[e.g., 'Bold sans-serif, Montserrat Black or equivalent']",
      "size": "[e.g., '48-56pt']",
      "color": "[exact hex or description]",
      "effects": "[e.g., 'Subtle text shadow, letter-spacing: 2px']",
      "alignment": "[e.g., 'center']"
    },
    "subHeadline": {
      "text": "[Secondary line — tagline or business type]",
      "font": "[e.g., 'Light weight, 18-22pt']",
      "color": "[exact color]",
      "spacing": "[e.g., 'letter-spacing: 4px, uppercase']"
    }
  },
  "heroSection": {
    "position": "12-65% of canvas height",
    "layout": "[e.g., 'Center-dominant with flanking elements']",
    "primaryVisual": {
      "type": "[e.g., 'Product showcase / Service illustration / Brand imagery']",
      "description": "[ULTRA-DETAILED description of what to show — be extremely specific about composition, objects, arrangement]",
      "style": "[e.g., 'Photorealistic, studio-lit, floating 3D arrangement']",
      "colorTreatment": "[e.g., 'Brand colors applied to accents, warm lighting']",
      "effects": "[e.g., 'Soft reflection underneath, ambient glow, subtle shadow']"
    },
    "decorativeElements": [
      {
        "element": "[e.g., 'Geometric accent shapes']",
        "position": "[exact placement]",
        "style": "[e.g., 'Thin gold lines, abstract flowing curves']",
        "opacity": "[e.g., '20%']"
      }
    ]${adType === 'festival' ? `,
    "festiveElements": {
      "decorations": "[Specific festival decorations — e.g., diyas for Diwali, rangoli, flowers]",
      "placement": "[exact positions]",
      "style": "[e.g., 'Realistic golden diyas with warm flame glow, scattered around hero section']",
      "colorTheme": "[festival-appropriate colors]"
    }` : ''}
  },
  "contentSection": {
    "position": "55-80% of canvas height",
    "services": {
      "layout": "[e.g., 'Horizontal icon-row with 3-4 items' or 'Vertical list with checkmarks']",
      "items": [
        {
          "icon": "[Describe icon — e.g., 'Minimalist line-art medical cross, white, 24px']",
          "text": "[Service name]",
          "font": "[e.g., 'Medium weight, 14pt, white']"
        }
      ],
      "separator": "[e.g., 'Thin vertical gold lines between items']",
      "background": "[e.g., 'Semi-transparent dark panel with 60% opacity, rounded corners 12px']"
    },
    "offers": {
      "visible": true,
      "badge": "[e.g., 'Diagonal ribbon in top-right corner, gradient red-to-orange']",
      "text": "[Offer text extracted from business info]",
      "urgency": "[e.g., 'Limited Time! / Festival Special!']"
    }
  },
  "footer": {
    "position": "bottom 15-20% of canvas",
    "contactStrip": {
      "background": "[e.g., 'Darker gradient strip, slightly transparent']",
      "phone": {
        "icon": "Phone icon, 16px, white",
        "text": "[Phone number]",
        "font": "[e.g., 'Bold, 16pt, white']"
      },
      "address": {
        "icon": "Location pin icon, 16px, white",
        "text": "[Address — keep concise]",
        "font": "[e.g., 'Regular, 12pt, white/80% opacity']"
      },
      "website": {
        "icon": "Globe icon, 16px, white",
        "text": "[Website URL]",
        "font": "[e.g., 'Regular, 12pt']"
      },
      "socialMedia": "[Any social handles if available]"
    },
    "callToAction": {
      "text": "[e.g., 'Visit Us Today!' or 'Call Now!']",
      "style": "[e.g., 'Pill-shaped button, gradient gold, bold white text 14pt']",
      "position": "[e.g., 'Center, 20px above contact strip']"
    }
  },
  "typography": {
    "primaryFont": "[e.g., 'Montserrat']",
    "secondaryFont": "[e.g., 'Playfair Display']",
    "bodyFont": "[e.g., 'Inter or Roboto']",
    "colorPalette": {
      "primary": "[hex]",
      "secondary": "[hex]",
      "accent": "[hex]",
      "text": "[hex]",
      "background": "[hex]"
    }
  },
  "qualityDirectives": {
    "resolution": "Ultra-high premium poster quality with 16K-grade detailing direction, print-ready 300 DPI equivalent, ultra-crisp professional finish",
    "style": "Premium international graphic design, Behance/Dribbble award-level quality, luxury-agency poster direction, world-class professional graphical elements",
    "noArtifacts": "Zero pixelation, no blurry elements, crisp edges on all text and icons",
    "brandConsistency": "All colors derived from logo palette, cohesive visual identity",
    "negativePrompt": "No clip-art, no stock photo watermarks, no cheap gradients, no Comic Sans, no crowded layouts, no low-resolution elements, no amateur design patterns, no fake data, no lorem ipsum, no placeholder text, no empty labels, no mismatched business details, no weak layout hierarchy, no poor spacing, no incorrect logo placement, no logo distortion"
  }
}

===== CRITICAL RULES =====

1. EVERY field must be filled with SPECIFIC, ACTIONABLE values — no vague descriptions
2. Colors must be EXACT (hex codes preferred, or precise descriptions)
3. Sizes, positions, and spacing must be NUMERICALLY PRECISE
4. The design must feel INTERNATIONAL AWARD-WINNING — Behance/Dribbble featured quality
5. Typography must be premium — no generic fonts, specify exact font families and weights
6. The poster must instantly communicate the BUSINESS TYPE through visual language
7. All extracted real business info (name, services, contact, offers) MUST be incorporated whenever available
8. NEVER generate fake data, dummy values, lorem ipsum, placeholder copy, empty sample text, fake phone numbers, fake addresses, fake offers, or made-up business claims
9. If any information is missing, do not fabricate it — instead reduce that section cleanly or keep it minimal while preserving premium design integrity
10. The logo must be placed at the top center only, aligned correctly, with premium spacing and perfect visual balance
11. If the uploaded logo has a solid or non-transparent background, remove only the background cleanly and preserve the exact logo design without alteration
12. Never change the logo design, structure, layout, proportions, brand colors, icon arrangement, or typography styling
13. ${adType === 'festival' ? `Festival theme (${festivalName}) must be elegantly woven into the design — festive but professional, NOT cartoonish or tacky` : 'Commercial/promotional focus — clean, corporate, persuasive'}
14. Output ONLY the JSON object — no explanations, no markdown wrapping, no commentary
15. The JSON must be VALID and parseable

OUTPUT: Return ONLY a valid JSON object following the schema above. Fill ALL fields with extracted business information. No explanations.`;

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
