import { AdType } from '@/types/aiPlatform';

// Business type detection for environment and color matching
export const detectBusinessType = (businessInfo: string): string => {
  const info = businessInfo.toLowerCase();
  if (info.includes('medical') || info.includes('hospital') || info.includes('clinic') || info.includes('doctor') || info.includes('physician') || info.includes('health')) return 'medical';
  if (info.includes('real estate') || info.includes('realty') || info.includes('property') || info.includes('builders') || info.includes('construction')) return 'realestate';
  if (info.includes('fashion') || info.includes('boutique') || info.includes('saree') || info.includes('clothing') || info.includes('couture') || info.includes('garment')) return 'fashion';
  if (info.includes('food') || info.includes('restaurant') || info.includes('catering') || info.includes('caterer') || info.includes('hotel')) return 'food';
  if (info.includes('tech') || info.includes('software') || info.includes('app') || info.includes('digital') || info.includes('it ')) return 'tech';
  if (info.includes('education') || info.includes('school') || info.includes('college') || info.includes('study') || info.includes('abroad') || info.includes('consultant')) return 'education';
  if (info.includes('solar') || info.includes('energy') || info.includes('power') || info.includes('renewable')) return 'solar';
  if (info.includes('laundry') || info.includes('wash') || info.includes('dry clean') || info.includes('fabric care')) return 'laundry';
  if (info.includes('mattress') || info.includes('sleep') || info.includes('furniture') || info.includes('bed')) return 'mattress';
  if (info.includes('electrical') || info.includes('plumbing') || info.includes('hardware') || info.includes('ac ') || info.includes('air conditioner') || info.includes('appliance')) return 'electrical';
  if (info.includes('tea') || info.includes('coffee') || info.includes('beverage')) return 'tea';
  if (info.includes('jewel') || info.includes('gold') || info.includes('diamond')) return 'jewellery';
  if (info.includes('security') || info.includes('guard') || info.includes('manpower') || info.includes('detective') || info.includes('surveillance') || info.includes('patrol')) return 'security';
  if (info.includes('automobile') || info.includes('car') || info.includes('bike') || info.includes('vehicle') || info.includes('motor') || info.includes('auto')) return 'automobile';
  if (info.includes('pharma') || info.includes('medicine') || info.includes('drug') || info.includes('chemist')) return 'pharma';
  if (info.includes('transport') || info.includes('logistics') || info.includes('courier') || info.includes('cargo') || info.includes('shipping')) return 'transport';
  if (info.includes('gym') || info.includes('fitness') || info.includes('yoga') || info.includes('sport')) return 'fitness';
  if (info.includes('beauty') || info.includes('salon') || info.includes('spa') || info.includes('parlour') || info.includes('parlor') || info.includes('cosmetic')) return 'beauty';
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

// Get environment description based on business type
export const getEnvironmentForBusiness = (businessType: string, businessName: string): string => {
  const environments: Record<string, string> = {
    medical: `real, operational, premium medical clinic / hospital reception area. Clean modern interiors with spotless counters, soft warm-toned walls, subtle blue highlights suggesting healthcare trust. Behind her, organized medical signage, clean waiting area visible. Space should instantly communicate healthcare, trust, and professionalism`,
    realestate: `real, operational, premium real-estate office or experience center. Elegant reception desk, wall-mounted project visuals, building elevations, floor-plan displays, or miniature building models visible. Sophisticated color palette with deep blues, muted greens, warm neutrals. Space should instantly communicate real estate, trust, growth, and success`,
    fashion: `real, operational, premium fashion boutique interior. Elegant displays, designer clothing visible, luxury retail ambiance. Rich textures, soft lighting, boutique-style finish. Space should instantly communicate fashion, elegance, and premium quality`,
    food: `real, operational, premium restaurant or catering service reception. Warm hospitality décor, elegant setup visible, appetizing and welcoming ambiance. Space should instantly communicate food, hospitality, and quality service`,
    tech: `real, modern, premium tech office or startup space. Clean reception-style setup with soft curves and contemporary design. Subtle gradient elements, natural indoor lighting. Space should instantly communicate innovation, professionalism, and trust`,
    education: `real, operational, premium education consultancy office. Modern professional interiors, achievement displays, global study visuals. Space should instantly communicate education, guidance, and success`,
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

export const getAttireMode = (attireType: string, businessType: string = 'default') => {
  if (attireType === 'traditional') {
    const sareeColor = getSareeColorForBusiness(businessType);
    return `Attire: premium traditional Indian saree — ${sareeColor}. High-quality fabric, crisp pleats, natural realistic folds, elegant and luxurious advertising look.`;
  } else {
    return `Attire: high-fashion premium corporate suit with "Old Money" aesthetic.
Preferred Colors: Beige, Cream, Pastel Pink, or Soft Grey.
Style: Structured blazer, crisp white shirt, minimalist gold chain.
Look: CEO / Founder / Brand Ambassador vibe.`;
  }
};

export const getAdTypeMode = (adType: string, festivalName = '') => {
  if (adType === AdType.FESTIVAL) {
    return `Overall look & mood: premium **${festivalName} business greeting** start image — powerful, celebratory, trustworthy, aspirational. Feels like a national-level brand advertisement.`;
  } else {
    return `Overall look & mood: premium **business brand-intro start image** — powerful, aspirational, authoritative, trustworthy. Feels like a national-level brand advertisement.`;
  }
};

export const MAIN_FRAME_SYSTEM_PROMPT = (attireType: string, adType: string, festivalName: string, aspectRatio: string = '1:1') => {
  const isFestival = adType === AdType.FESTIVAL && festivalName;
  const festivalTheme = isFestival ? getFestivalTheme(festivalName) : null;

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

Create a Ultra-realistic DSLR photograph, single image, 9:16 vertical — must look like a real, high-budget national [BUSINESS TYPE] ${isFestival ? `**${festivalName} celebration** ` : ''}photoshoot, absolutely no AI-art, no rendering, no stock-photo feel. Indistinguishable from a real professional photograph.${isFestival ? `
**THIS IS A ${festivalName.toUpperCase()} THEMED IMAGE — the entire frame must BREATHE the festival. Every element — attire, decorations, environment, lighting, colors — must work together to create an IMMERSIVE ${festivalName} celebration feel.**` : ''}

SUBJECT (CELEBRITY STANDARD — NON-NEGOTIABLE — MUST LOOK LIKE A-LIST CELEBRITY):
One **exceptionally beautiful young Indian woman (early-20s)** with **true celebrity-level presence**, like a top national brand ambassador or A-list South Indian film actress hired to represent a premium [BUSINESS TYPE] brand${isFestival ? ` during their ${festivalName} celebrations` : ''}.
Her beauty must feel **STUNNING, premium, magnetic, and instantly attention-grabbing** — the kind of face that stops you mid-scroll on Instagram. Think top-tier South Indian film actress level beauty — the kind of woman premium national brands pay crores to front their campaigns. Do NOT name any specific celebrity.

Facial characteristics (MANDATORY — CELEBRITY BEAUTY LEVEL):
• Perfect natural facial symmetry — stunning model-like proportions
• DIRECT EYE CONTACT WITH CAMERA — the model must look DIRECTLY into the camera lens, making eye contact with the viewer. Sharp, expressive deep eyes with confident, powerful gaze — eyes that captivate. This is NON-NEGOTIABLE
• Well-sculpted, perfectly shaped eyebrows — professionally groomed
• Soft but powerful warm smile showing confidence, trust, and authority — million-dollar smile
• **NATURAL HEALTHY COMPLEXION — IMPORTANT** — soft subtle warmth on cheekbones, like a healthy natural glow. The blush must be VERY SUBTLE and NATURAL — NOT pink, NOT rosy, NOT flushed. Think natural Indian skin tone with gentle warmth, not makeup blush. Avoid any pink/red tones on the face.
• **SKIN TONE MUST BE NATURAL INDIAN** — warm golden-brown undertones, NOT pink, NOT pale, NOT overly fair. The face should have natural warm tones, NOT cool pink tones.
• Small elegant sharp nose — perfectly proportioned
• Clean, refined defined jawline — sharp and attractive
• **Flawless luminous skin** — visible pores for realism, micro highlights, natural unevenness, BUT overall glowing and radiant complexion like she just had a facial
• Subtle natural makeup — defined eyes, soft natural lip color (NOT pink lipstick), healthy glow
• She must look like she could be on a magazine cover or billboard
• No plastic skin, no airbrushing, no over-smoothing, no AI glow, no beautification filters
• **STRICTLY AVOID pink/red/rosy coloring on face — use warm golden natural tones only**

POSE & FRAMING (LOCKED — NON-NEGOTIABLE — HIGHEST PRIORITY):
**THIS IS THE MOST CRITICAL SECTION — CENTERING AND POSTURE MUST BE PERFECT.**
• MID SHOT only (head to just below waist)
• Subject must be **EXACTLY IN THE CENTER** of the frame — **perfect symmetry, EQUAL space on left and right**
• Camera at chest level, straight-on (no tilt, no angle, no dutch angle)
• **Hands gently folded at the waist / lower abdomen, one hand resting naturally over the other, fingers relaxed**
• This EXACT hand posture is MANDATORY — zero variation, every single time
• The model must occupy approximately 70% of the frame height
• Her presence must be commanding and dominant — she is the HERO of the image
• The remaining space shows the business environment and logo behind/around her
• **If the centering is off by even 5%, the entire image is REJECTED**
• **The model's eyes must be looking DIRECTLY AT THE CAMERA — straight into the lens. No looking away, no side glances, no downcast eyes. Eye contact with the viewer is MANDATORY.**

HAIR (ACTRESS-LEVEL GROOMING):
Silky smooth jet-black hair with natural volume, professionally styled like a leading South Indian film actress.
Soft elegant waves or sleek traditional styling.
Glossy but natural shine, slight flyaways allowed for realism.
Looks like it was done by a celebrity stylist — expensive, natural, and real.

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
Jewellery must be ALWAYS EXPENSIVE, LUXURIOUS gold and diamond celebrity-level jewellery — NOT festival-themed items.
NEVER use festival-specific items like rudraksha, minimal jewellery, or religious accessories.
The jewellery should look like expensive red-carpet level worth lakhs — pure gold with diamonds/kundan only.` : `ATTIRE (BUSINESS-THEMED COLOR — MANDATORY — MUST BE DYNAMIC PER BUSINESS):
${attireType === 'traditional' ? `**ULTRA-LUXURY** traditional Indian silk saree — the saree MUST be **OUTRAGEOUSLY EXPENSIVE-LOOKING** and **UNIQUELY DYNAMIC** based on the specific business type and brand colors. Do NOT use the same saree for different businesses.

Color guide by business type (each MUST feel like a different designer collection):
• Medical/Healthcare: Elegant soft ivory / pearl white Kanchipuram silk with subtle blue-and-gold zari border — clinical elegance meets luxury
• Real Estate: Deep royal blue OR rich emerald green Kanjeevaram with heavy gold zari temple border — conveys power, prosperity
• Fashion/Boutique: Rich royal purple OR deep wine Banarasi silk with intricate gold brocade all-over — pure couture luxury
• Food/Catering: Warm maroon OR golden yellow pure silk with traditional paisley/mango motifs in real gold zari — warm, rich, inviting
• Tech/Software/Agency: Modern navy blue OR charcoal tissue silk with subtle silver-platinum zari geometric patterns — futuristic elegance
• Education: Deep blue OR forest green Kanchipuram with classic gold temple border — academic prestige meets tradition
• Solar/Energy: Deep green with solar-blue tones, gold zari with contemporary motifs — progressive luxury
• Laundry/Wash: Soft pearl ivory / champagne beige Banarasi with subtle blue and copper zari — pristine, fresh, elegant
• Tea/Beverage: Rich leaf-green Kanjeevaram with warm golden zari paisley motifs — earthy opulence
• Jewellery: Rich royal maroon OR deep purple with heavy gold Kanchipuram temple border — jewellery-showroom worthy
• Electrical/Hardware: Professional deep blue OR steel grey silk with subtle silver zari — industrial premium
• Default: Premium colors extracted from the brand logo palette in Kanchipuram/Banarasi silk with gold zari

**CRITICAL: Each business MUST get a VISUALLY DIFFERENT saree based on its business sector.**

**FABRIC MUST LOOK OUTRAGEOUSLY EXPENSIVE** — pure handwoven Kanchipuram / Banarasi / Kanjeevaram silk with real gold zari work, heavy temple borders or intricate brocade. The saree must look like it costs ₹50,000–₹2,00,000 — the kind worn at film premieres or luxury brand launches.
Pallu drape must be elegant, heavy, and gravity-realistic — NOT flat, NOT stiff.
Fabric should show natural gravity, deep realistic folds, and creases with **visible silk sheen under lighting**.
Styling must feel film-industry celebrity level, not catalog or wedding shoot.` : `High-fashion premium corporate suit with "Old Money" aesthetic.
Color MUST complement the [BUSINESS TYPE]:
• Preferred Colors: Beige, Cream, Pastel Pink, Soft Grey, Navy Blue
• Structured blazer, crisp white shirt, minimalist styling
• Fabric must look premium — Italian wool, fine cashmere blend, or luxury linen
• Looks CEO / Founder / Brand Ambassador level — red carpet ready
• The suit must look like it was custom-tailored by a luxury designer — think ₹1–2 lakh executive couture`}

JEWELLERY (MANDATORY — ALWAYS REQUIRED):
**Jewellery is NON-NEGOTIABLE and must ALWAYS be present:**
• One ultra-thin elegant gold chain necklace — premium, delicate
• Small premium stud earrings OR tiny elegant jhumkas — visible and classy
• Optional: One thin gold bangle on one wrist (subtle, not heavy)
• NO heavy temple jewellery
• NO layered chains
• NO chunky pieces
Jewellery must feel understated, expensive, and actress-style — the kind worn by celebrities in brand endorsements.`}

${isFestival && festivalTheme ? `ENVIRONMENT (REAL [BUSINESS TYPE] OFFICE/STORE WITH ${festivalName.toUpperCase()} DECORATIONS — MOST CRITICAL SECTION):
**The background MUST look like the REAL office/store of this specific [BUSINESS TYPE] business — with ${festivalName} festival decorations added on top of it.**

**STEP 1 — BUILD THE REAL BUSINESS ENVIRONMENT FIRST (BASE LAYER):**
The background must FIRST look like a REAL, OPERATIONAL [BUSINESS TYPE] office/store/establishment.
Business-specific elements MUST be clearly visible so anyone looking at the background can INSTANTLY tell what type of business this is:
• **Medical/Healthcare:** Clinic reception counter, medical equipment, health posters, clean white/blue interiors
• **Real Estate:** Property display boards, building models, floor-plan frames on walls
• **Fashion/Boutique:** Clothing displays, designer outfits on mannequins/racks, luxury retail setup
• **Food/Restaurant/Catering:** Kitchen setup, food displays, serving counters, hospitality décor
• **Tech/Software/Agency:** Modern office setup, computers, creative workspace, contemporary design
• **Education/Consultancy:** Achievement boards, global study visuals, professional counseling setup
• **Solar/Energy:** Solar panel displays, energy system models, green tech elements
• **Laundry/Wash:** Washing machines, folded linens, neatly organized racks, clean counters
• **Tea/Beverage:** Tea packet shelves, wooden counters, distribution setup
• **Jewellery:** Display cases, elegant showcases, luxury interior
• **Electrical/Hardware:** Equipment displays, organized tools, service counter
• **Default:** Professional reception area appropriate to the detected business type
This business-type environment is the FOUNDATION — the photo should look like it was genuinely taken INSIDE their actual premises.

**STEP 2 — ADD ${festivalName.toUpperCase()} FESTIVAL DECORATIONS ON TOP (DECORATION LAYER):**
Now, ON TOP of this real business environment, add ${festivalName} festival decorations as if the employees decorated their own office/store for the festival.

**${festivalName.toUpperCase()} DECORATIONS TO ADD:**
${festivalTheme.environmentDecorations}

**FLOOR DECORATION:**
${festivalTheme.floorDecor}

**FESTIVAL CULTURAL ELEMENTS (MUST BE VISIBLE):**
Key cultural elements: ${festivalTheme.culturalElements}
These elements make the image INSTANTLY recognizable as a ${festivalName} celebration — they CANNOT be omitted.

**FESTIVAL LIGHTING:**
${festivalTheme.lightingStyle}

**LOGO PLACEMENT (NATURAL ON THE WALL):**
${festivalTheme.backgroundElements}
• Take the ATTACHED LOGO image and place it exactly as-is on the wall — as if it was ALREADY mounted there as the business signage
• The logo must appear as real physical signage — naturally part of the office/store
• Festival decorations (garlands, flowers) may surround or frame the logo — this is expected and natural
• Do NOT generate, recreate, or design a new logo — use ONLY the attached logo image file
• ⚠️ CRITICAL: The logo must be a PIXEL-PERFECT copy of the attached image — same colors, same shapes, same text, same proportions
• Do NOT simplify, stylize, redraw, reinterpret, add text to, remove text from, or alter the logo in ANY way
• If the logo has specific text/font/colors, those MUST appear EXACTLY as in the attached file

**THE GOLDEN RULE — REAL OFFICE + FESTIVAL DECORATION:**
The final image should look like a photographer walked into THIS SPECIFIC BUSINESS and took a photo of their ${festivalName}-decorated premises.
• The business identity (what they do) must be CLEARLY visible from the environment
• The festival decorations are ADDED on TOP of the existing business space
• It should feel like the real owners decorated their real office for ${festivalName}
• NOT a generic festival scene — NOT a studio setup — it must feel like THEIR actual place
• Anyone who knows this business should be able to say: "Yes, that looks like their office/store with ${festivalName} decorations"

**FESTIVAL MOOD & ATMOSPHERE:**
${festivalTheme.mood}
The viewer should feel: "This business decorated their actual office beautifully for ${festivalName}."` : `ENVIRONMENT (BUSINESS-THEMED OFFICE — VERY IMPORTANT):
Photographed **inside a real, operational, premium [BUSINESS TYPE] office/store/establishment** — the environment must INSTANTLY communicate the business type.

[Generate DETAILED environment description based on detected business type:]
• **Medical/Healthcare:** Premium clinic/hospital reception, clean white & blue interiors, subtle medical signage, health trust elements
• **Real Estate:** Elegant office with property displays, building models, floor-plan frames, architectural elements on walls
• **Fashion/Boutique:** Luxury boutique interior, elegant displays, designer clothing visible, rich textures
• **Food/Restaurant/Catering:** Warm hospitality décor, premium ambiance, appetizing setup hints
• **Tech/Software/Agency:** Modern startup office, clean contemporary design, soft curves, tech aesthetic
• **Education/Consultancy:** Professional office with achievement displays, global study visuals, success imagery
• **Solar/Energy:** Modern energy office, solar panel displays visible, green tech aesthetic
• **Laundry/Wash:** Premium laundry reception, washing machines/dryers visible, folded white linens, clean fresh aesthetic
• **Tea/Beverage:** Tea distribution office, wooden counters, tea packet shelves in green/gold tones
• **Jewellery:** Luxurious showroom, elegant display cases, soft spotlighting
• **Electrical/Hardware:** Professional service center, organized equipment displays

Environment Requirements:
• Clean, modern reception/counter area with premium finishes
• **Business-specific elements MUST be clearly visible in background** — these elements should make it INSTANTLY obvious what type of business this is, even without reading the logo
• **Brand colors subtly present in the space** matching the logo identity
• Natural indoor lighting from windows and ceiling fixtures — NO studio lighting
• DSLR depth-of-field — subject razor sharp, background softly blurred but identifiable
• Space must feel authentic, operational, and successful — NOT staged, NOT showroom-like
• The background alone should clearly communicate "[BUSINESS TYPE]" even without the logo
• The background must look like the REAL business premises — as if the photo was taken at the ACTUAL location

LOGO PLACEMENT (CRITICAL — DO NOT MODIFY THE LOGO):
Take the ATTACHED LOGO image and place it exactly as-is in the scene.

Placement Rules:
• Place the attached logo image as **real physical signage** on the wall or reception panel behind the subject
• Mounted on a clean wall board, acrylic panel, or reception backdrop
• Do NOT generate, recreate, or design a new logo — use ONLY the attached logo image file
• Do NOT describe or interpret what the logo looks like — just place the attached image directly
• Do NOT change, modify, redesign, or recolor the logo in any way
• Do NOT simplify, stylize, redraw, add text to, remove text from, or reinterpret the logo
• ⚠️ The logo must be a PIXEL-PERFECT reproduction of the attached image — same colors, fonts, shapes, proportions, and layout
• If the attached logo contains specific text, that EXACT text must appear — do NOT substitute, translate, or rephrase it
• Logo should be properly sized — visible and recognizable but not oversized
• Natural office lighting falling on it realistically`}

CAMERA & PHOTO REALISM:
• Professional DSLR (85mm or 50mm portrait lens look)
• Natural color science and grading
• Real indoor shadows, realistic highlights
• Slight lens softness and beautiful depth-of-field
• No HDR exaggeration, no cinematic grading, no artificial sharpness
• Looks like a ₹2–5 lakh real professional photoshoot
${isFestival && festivalTheme ? `• Color temperature should lean warm/golden matching ${festivalName} festive atmosphere
• Capture the warm glow from festival lamps, diyas, and decorations naturally` : ''}

OVERALL RESULT:
${isFestival ? `A **real, premium ${festivalName} celebration photograph at a [BUSINESS TYPE] establishment** featuring a **top-class celebrity-level beautiful Indian woman** representing [BUSINESS NAME] celebrating ${festivalName}.
The image must look like a **REAL ${festivalName} celebration at a premium office** — with LAVISH festival decorations, culturally authentic elements, and a model who looks like she was hired for a national-level festival campaign.
The ${festivalName} theme must be OVERWHELMING and UNMISTAKABLE — any viewer should INSTANTLY identify this as a ${festivalName} celebration.
Viewer reaction should be: **"This company threw an incredible ${festivalName} celebration and hired a celebrity for their festival campaign photo — and it looks absolutely REAL."**` : `A **real, premium [BUSINESS TYPE] campaign photograph** featuring a **top-class celebrity-level beautiful Indian woman** representing [BUSINESS NAME].
The image must look like it was shot for a **national-level brand campaign** with a real celebrity.
Viewer reaction should be: **"This looks like a real high-end brand shoot with an actual celebrity, not AI."**`}

STRICTLY NO TEXT anywhere except the exact real-world logo signage.

PRODUCT IMAGES PLACEMENT (ONLY WHEN PRODUCT IMAGES ARE ATTACHED — STORE BACKGROUND INTEGRATION):
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
• This makes the image feel like a REAL photo taken at the ACTUAL business location

---END OF PROMPT FORMAT---

===== INSTRUCTIONS FOR FILLING THE FORMAT =====

1. Replace [BUSINESS TYPE] with detected business type (e.g., "advertising agency", "medical clinic", "real estate office", "tea distribution agency", "laundry service", etc.)

2. Replace [BUSINESS NAME] with extracted business name

${isFestival ? `3. For ATTIRE section: The saree must BLEND the ${festivalName} festival theme WITH the business sector colors. Each business should get a UNIQUE saree — a medical clinic and a real estate company celebrating the SAME festival must have DIFFERENT saree colors/styles. The business brand identity should be visible in the attire choice.

4. For ENVIRONMENT section: The background must clearly indicate the BUSINESS SECTOR — a medical clinic should look like a medical clinic, a real estate office should look like a real estate office. The ${festivalName} festival decorations are ADDED ON TOP of this business environment. Think: "What would THIS specific [business type] office look like if they decorated for ${festivalName}?"

5. CRITICAL: Every single decoration, cultural element, and festival-specific item listed in the ENVIRONMENT section must appear in the generated prompt. DO NOT skip any festival elements. But the BASE environment must still clearly communicate the business type.` : `3. For ATTIRE section: Adjust saree/suit colors based on:
   - Business type (MANDATORY color matching as listed above)
   - Festival theme if applicable: ${festivalName || 'Commercial/Brand Intro'}
     • Republic Day = saffron/white/green
     • Diwali = maroon/gold
     • Pongal/Sankranthi = festive orange/gold
     • New Year = royal purple/gold

4. For ENVIRONMENT section: Generate DETAILED description specific to the business type as listed above

5. Always include specific visual elements that make the business type INSTANTLY recognizable from the background alone`}

6. The celebrity beauty, natural warm complexion (NOT pink), mandatory jewellery, 70% screen presence, and natural logo placement are ALL NON-NEGOTIABLE

OUTPUT: Generate ONLY the final prompt following the exact format above. Fill in all bracketed placeholders with extracted business information. No explanations, no labels.`;
};

// ===== MULTI-FRAME SYSTEM PROMPT (Per-Clip Unique Main Frame Prompts) =====
export const MULTI_FRAME_SYSTEM_PROMPT = (
  attireType: string,
  adType: string,
  festivalName: string,
  segmentCount: number,
  voiceOverSegments: string[]
) => {
  const basePrompt = MAIN_FRAME_SYSTEM_PROMPT(attireType, adType, festivalName);

  // Build segment context for the AI
  const segmentContext = voiceOverSegments.map((seg, i) => 
    `  Clip ${i + 1} Script: ${seg}`
  ).join('\n');

  // Director's shot types — each clip has a cinematic PURPOSE and a DIFFERENT LOCATION within the same establishment
  const shotDesigns = [
    {
      name: 'HERO ESTABLISHING SHOT',
      location: 'Main reception area / front counter / primary welcome zone of the business',
      camera: 'Standard mid-shot, straight-on at chest level, subject perfectly centered — classic brand ambassador establishing shot',
      pose: 'Hands gently folded at waist, one hand resting over the other, confident welcoming posture — brand ambassador stance',
      purpose: 'Introduce the brand ambassador and the business atmosphere. The viewer sees the model AND instantly recognizes the business type from the environment. Model maintains DIRECT EYE CONTACT with the camera.',
    },
    {
      name: 'SHOWCASE / PRODUCT SHOT',
      location: 'Product display area / service showcase zone / core business section — where the actual products, services, or offerings are visible',
      camera: 'Slight low-angle mid-shot (camera slightly below chest), subject on one side using rule-of-thirds — products/services visible on the other side',
      pose: 'One hand gesturing gently toward the products/services behind her, or resting on a display counter — naturally interacting with the business environment',
      purpose: 'Show what the business DOES. The model guides the viewer\'s attention to products, equipment, or services displayed behind/around her. Model maintains DIRECT EYE CONTACT with the camera.',
    },
    {
      name: 'CREDIBILITY / TRUST SHOT',
      location: 'Near the business logo wall / achievement display / certification area / consultation zone — the trust-building section of the establishment',
      camera: 'Gentle 10-15° side angle mid-shot, creating depth with the logo/achievements visible in the background — cinematic depth composition',
      pose: 'Confident stance with slight body turn toward the logo/achievements, warm authoritative expression — exuding trust and credibility',
      purpose: 'Build trust and brand authority. The logo is prominently visible, along with any awards, certifications, or trust signals. Model maintains DIRECT EYE CONTACT with the camera.',
    },
    {
      name: 'DETAIL / IMMERSION SHOT',
      location: 'A different section of the business — specialized area, secondary display zone, workstation area, or another distinct part of the premises that hasn\'t been shown yet',
      camera: 'Slightly wider mid-shot showing more of this new area, or a close mid-shot (head to upper waist) for intimate feel — environment-rich composition',
      pose: 'Natural relaxed pose — perhaps lightly touching a surface, standing near equipment relevant to the business, or a natural mid-conversation gesture',
      purpose: 'Reveal more depth of the business — show the viewer that this is a REAL, multi-area establishment. Add visual variety. Model maintains DIRECT EYE CONTACT with the camera.',
    },
    {
      name: 'WARM CLOSING SHOT',
      location: 'Back near the main area / entrance zone / a warm, inviting spot in the establishment — full circle back to a welcoming position',
      camera: 'Standard to slight high-angle mid-shot, soft and warm composition — the "come visit us" feel',
      pose: 'Open welcoming gesture — warm smile, slightly open hands or namaste gesture, inviting the viewer — the final impression',
      purpose: 'End on a warm, inviting note. The viewer should feel: "I want to visit this place." This is the closing brand impression. Model maintains DIRECT EYE CONTACT with the camera.',
    },
    {
      name: 'ALTERNATIVE ANGLE SHOT',
      location: 'The most visually interesting or unique section of the business — a spot that best represents the brand\'s personality and uniqueness',
      camera: 'Creative composition — slight dutch angle or artistic framing using environment elements as natural frames (doorways, arches, shelving)',
      pose: 'Dynamic pose that matches the script energy — could be mid-stride, turning to face camera, or engaged with something in the environment',
      purpose: 'Show the business from a fresh, unexpected angle that adds cinematic variety. Model maintains DIRECT EYE CONTACT with the camera.',
    },
  ];

  return `${basePrompt}

===== MULTI-FRAME GENERATION MODE — DIRECTOR'S SHOT PLAN (CRITICAL) =====

**You are now a WORLD-CLASS commercial film director and cinematographer planning a premium brand campaign.**

**OVERRIDE: Instead of generating ONE prompt, you must generate EXACTLY ${segmentCount} SEPARATE Main Frame image prompts — one for each 8-second video clip.**

Think of this as a ₹20-lakh national TV commercial shoot where the brand ambassador MOVES THROUGH different areas of the business establishment. Each clip = a DIFFERENT LOCATION within the SAME office/store/premises.

TOTAL CLIPS: ${segmentCount}
EACH CLIP DURATION: 8 seconds

VOICE-OVER SCRIPT PER CLIP (use to guide mood, action, and location choice):
${segmentContext}

===== THE DIRECTOR'S SHOT PLAN =====

**GOLDEN RULE: The model must appear at a DIFFERENT physical location within the same business environment in EVERY clip.**

Just like in real TV commercials — the actress doesn't stand in one spot for 30 seconds. She MOVES through the business:
• From the reception → to the product display → to the logo wall → to the consultation area → back to the entrance
• Each location reveals a DIFFERENT aspect of the business
• The viewer sees the FULL business through the model's journey

**LOCATION PLANNING PER BUSINESS TYPE:**
The AI must pick ${segmentCount} DIFFERENT spots from within the specific [BUSINESS TYPE] establishment:

• **Medical/Healthcare:** Reception counter → Consultation room doorway → Medicine/equipment display area → Patient waiting zone → Near health certifications wall
• **Real Estate:** Reception desk → Property display board wall → Building model showcase → Floor plan gallery → Client meeting zone
• **Fashion/Boutique:** Store entrance → Clothing display racks → Mirror/trial area → Accessory showcase → Designer collection wall
• **Food/Restaurant/Catering:** Host station → Dining area → Kitchen pass/display counter → Beverage station → Ambiance seating zone
• **Tech/Software:** Reception/lobby → Workspace area → Meeting room doorway → Creative wall/whiteboard area → Tech equipment zone
• **Education:** Front desk → Achievement/trophy wall → Counseling desk area → Study material display → Global map/university display wall
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
   
   Generate a COMPLETE, detailed image generation prompt following ALL the rules/sections from the base prompt above.
   This frame sets the visual foundation — character face, hair, skin, beauty, attire, jewellery, AND this specific location within the business.
   This is the ONLY clip where you fully describe the model's physical appearance.
   Include ALL sections: SUBJECT, Facial characteristics, POSE, HAIR, ATTIRE, JEWELLERY, ENVIRONMENT, CAMERA, OVERALL RESULT.
   Target length: 500-800 words.`;
  }
  
  return `**CLIP ${clipNum} — ${shot.name} (⚠️ DO NOT RE-DESCRIBE THE MODEL)**
   📍 LOCATION: ${shot.location}
   🎥 CAMERA: ${shot.camera}
   🧍 POSE: ${shot.pose}
   🎯 PURPOSE: ${shot.purpose}
   
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
   "The exact same woman from Clip 1 — identical in every way, same face, same attire, same jewellery, completely unchanged."
   
   **✅ THEN FOCUS 100% ON THESE (the ONLY things you should describe):**
   • 📍 The NEW LOCATION within the business (a completely different spot from previous clips — describe the area in rich detail)
   • 🔍 What's visible in the background at this new location (business-specific elements, furniture, displays, signage)
   • 🧍 The new POSE — body angle, hand position, interaction with environment elements at this location
   • 😊 The new EXPRESSION — emotional tone matching Clip ${clipNum}'s voice-over script
   • 🎥 The new CAMERA ANGLE and composition
   • 💡 How lighting naturally differs at this new spot (e.g., near window = warm, interior = ambient)
   
   WHY THIS MATTERS: Any model description — even saying "beautiful woman" or "silk saree" — will cause the AI image generator to create a COMPLETELY DIFFERENT person. The model's identity is LOCKED from Clip 1. You ONLY control the scene around her.
   
   **OUTPUT LENGTH FOR THIS CLIP: 100-200 words MAXIMUM.**
   **DO NOT include these section headers: SUBJECT, Facial characteristics, HAIR, ATTIRE, JEWELLERY, PRODUCT IMAGES PLACEMENT, OVERALL RESULT.**
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

**⚠️ WHAT MUST NEVER CHANGE (MODEL CONSISTENCY IS SACRED):**
• **Model's identity** — exact same person, same face, same beauty level in every clip
• **Attire & jewellery** — exact same outfit, exact same jewellery, exact same fabric
• **Overall establishment** — same business, same décor style, same color palette
• **Color grading & mood** — consistent cinematic feel throughout
• **Image quality** — same DSLR realism level
• **Direct eye contact with camera** — the model ALWAYS looks directly into the camera lens in EVERY clip, maintaining eye contact with the viewer. This is NON-NEGOTIABLE.

**⛔⛔⛔ ABSOLUTE ZERO-TOLERANCE RULE FOR CLIPS 2+ ⛔⛔⛔**
For ANY clip after Clip 1, you must write ZERO words about the model's appearance.
The ONLY reference to the model should be: "The exact same woman from Clip 1 — identical in every way, same face, same attire, same jewellery, completely unchanged."

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

**The base prompt above defines sections like SUBJECT, Facial characteristics, HAIR, ATTIRE, JEWELLERY, etc.**
**These section headers are ONLY for Clip 1. For Clips 2+, you must NOT include these sections AT ALL.**

**CLIP 1 must include ALL these sections:** SUBJECT, Facial characteristics, POSE & FRAMING, HAIR, ATTIRE, JEWELLERY, ENVIRONMENT, LOGO PLACEMENT, CAMERA & PHOTO REALISM, OVERALL RESULT, PRODUCT IMAGES PLACEMENT

**CLIPS 2+ must NEVER include ANY of these sections:**
⛔ SUBJECT (CELEBRITY STANDARD…) — FORBIDDEN
⛔ Facial characteristics (MANDATORY…) — FORBIDDEN  
⛔ HAIR (ACTRESS-LEVEL…) — FORBIDDEN
⛔ ATTIRE (ULTRA-LUXURY…) — FORBIDDEN
⛔ JEWELLERY (LUXURIOUS…) — FORBIDDEN
⛔ PRODUCT IMAGES PLACEMENT — FORBIDDEN (already covered in Clip 1)
⛔ OVERALL RESULT — FORBIDDEN (already covered in Clip 1)

**CLIPS 2+ should ONLY contain these sections:**
✅ One-line model reference ("The exact same woman from Clip 1…")
✅ POSE & FRAMING (new pose for this location)
✅ ENVIRONMENT — NEW LOCATION (the new spot within the business)
✅ CAMERA (angle for this shot)
✅ LIGHTING (how it differs at this new spot)
✅ MOOD (one line matching the voice-over script)

===== WORD COUNT RULES (ENFORCED) =====

**Clip 1: 500–800 words** — Full detailed prompt with every section.
**Clips 2, 3, 4, etc.: 100–200 words MAXIMUM** — Short, location-focused prompts. If your continuation clip is longer than 200 words, you are re-describing the model. DELETE those lines.

A continuation clip that is 500+ words means you are repeating model/attire/jewellery descriptions — this is WRONG and will produce different-looking women across clips.

===== OUTPUT FORMAT (CRITICAL — MUST FOLLOW EXACTLY) =====

Separate each clip's prompt with the marker: ###CLIP###

**CLIP 1 FORMAT (FULL — 500-800 words):**

Clip 1 – Main Frame Prompt (${shotDesigns[0].name})
Create a Ultra-realistic DSLR photograph, single image, 9:16 vertical…
[Full SUBJECT section with face, hair, beauty description]
[Full ATTIRE section]
[Full JEWELLERY section]
[Full ENVIRONMENT section with business + decorations]
[Full CAMERA & REALISM section]
[Full OVERALL RESULT]

###CLIP###

**CLIP 2+ FORMAT (SHORT — 100-200 words ONLY):**
Here is an EXAMPLE of what a correct Clip 2 prompt looks like:

Clip 2 – Main Frame Prompt (${shotDesigns[1 % shotDesigns.length].name})
The exact same woman from Clip 1 — identical in every way, same face, same attire, same jewellery, completely unchanged.

POSE: Subject positioned on the right side using rule-of-thirds, one hand gesturing gently toward the product display behind her. Slight low-angle mid-shot, camera slightly below chest level.

NEW LOCATION: She has moved to the product showcase area of the office. Behind her, a large sleek monitor displays website designs and AI-powered tools. Modern display shelving with tech awards and client project samples visible. The DTS logo signage is visible on the far wall.

Festival decorations from the office are still visible — mango leaf thoranam above the display, marigold garlands framing the monitor, brass deepam on the desk corner, rangoli patterns continuing on the floor.

LIGHTING: Cool blue-tinted ambient light from the display screens blends with warm golden festival lamp glow — creating a unique tech-meets-tradition atmosphere.

MOOD: Professional, aspirational — showcasing the company's innovative capabilities while celebrating Ugadi.

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

export const HEADER_SYSTEM_PROMPT = (adType: string, festivalName: string) => {
  const isFestival = adType === AdType.FESTIVAL && festivalName;
  const festivalTheme = isFestival ? getFestivalTheme(festivalName) : null;

  return `You are a WORLD-CLASS GRAPHIC DESIGNER with 30+ years of experience creating award-winning brand headers, banners, and corporate identity systems for Fortune 500 companies, international brands, and premium businesses. Your work has been featured in Communication Arts, Print Magazine, Brand New, and Behance Hall of Fame. Every header you design is a masterclass in typography, color theory, and visual hierarchy.

YOUR TASK: Generate a SINGLE, copy-paste-ready IMAGE GENERATION PROMPT for an ultra-premium business header.

WORKFLOW RULES (MANDATORY):
• Output ONE final prompt inside a CODE BLOCK — nothing else
• Do NOT include explanations, commentary, or labels
• Do NOT mention video, animation, or motion ANYWHERE
• The prompt must produce a header where EVERY SINGLE CHARACTER of text is PERFECTLY READABLE at 8K resolution

FIRST: Analyze all provided files and EXTRACT ONLY ESSENTIAL INFORMATION:
1. Business Name / Brand Name — extract EXACTLY as printed (preserve capitalization, spelling, spacing)
2. Business Type (auto-detect from context)
3. Contact Number(s) — PRIMARY phone number(s) only (max 2)
4. Email Address — if available
5. Website URL — if available  
6. Full Address / Location — city/area only
${isFestival ? `7. Festival theme: ${festivalName}` : ''}

**KEEP IT SIMPLE — ONLY ESSENTIAL DETAILS:**
- Business Name (MOST PROMINENT — largest text)
- 1-2 Contact Numbers (clearly readable)
- Email and Website (clearly readable)
- Address (SHORT — city/area only)
- DO NOT include: taglines, services list, proprietor names, designations, social media handles

===== EXACT OUTPUT FORMAT (FOLLOW THIS STRUCTURE PRECISELY) =====

---START OF PROMPT FORMAT---

Create an ULTRA-PREMIUM, award-winning business HEADER BANNER for a vertical IMAGE in 9:16 aspect ratio. The header must look like it was designed by a world-class graphic designer with decades of experience. Every text element must be RAZOR-SHARP and CRYSTAL-CLEAR at 8K resolution${isFestival ? `. The design embodies a **${festivalName.toUpperCase()} CELEBRATION THEME** — blending festival grandeur with the business identity` : ''}.

RENDERING QUALITY (8K ULTRA-SHARP — NON-NEGOTIABLE):
– Render at 8K resolution (7680×13680 pixels for 9:16) — no blur, no artifacts, no softness on ANY text
– Every character of EVERY word must be pixel-perfect, knife-edge sharp, and instantly readable
– Text must have ZERO anti-aliasing blur — crisp vector-quality edges as if typeset by a master typographer  
– Phone numbers, email addresses, and website URLs must be 100% legible even when zoomed to individual characters
– The business name must be so sharp and bold it could be read from 20 feet away on a billboard
– Contact details must have crystal-clear legibility — each digit, letter, dot, and symbol perfectly formed
– NO smudged text, NO overlapping characters, NO bleeding edges, NO fuzzy rendering whatsoever

HEADER PLACEMENT & SIZE (ABSOLUTELY CRITICAL — STRICTLY ENFORCED):
– Exact 9:16 ratio (SINGLE STATIC IMAGE ONLY)
– **Header occupies ONLY the TOP 5-8% of image height — MAXIMUM 8%, ABSOLUTELY NEVER MORE**
– This is a PRECISION-CRAFTED ultra-slim horizontal strip at the ABSOLUTE TOP edge
– Remaining 92-95% of the frame is completely clear, empty, untouched
– The header is a thin, elegant ribbon — like a luxury letterhead band
– **If it seems too small, it's CORRECT — restraint is the hallmark of world-class design**

BRAND INFORMATION (ESSENTIALS ONLY):
Brand / Business Name: [EXACT NAME — LARGEST, BOLDEST element in the header]
Business Type: [DETECTED TYPE — Medical, Real Estate, Fashion, Food, Tech, Education, Solar, Security, Laundry, Jewellery, Automobile, Beauty, Fitness, etc.]
${isFestival ? `Theme: ${festivalName} Festival Celebration` : 'Style: Premium Corporate / Professional'}
Phone: [1-2 PRIMARY numbers — each digit must be perfectly legible]
Email: [If available — every character razor-sharp]
Website: [If available — full URL clearly readable]
Address: [SHORT — city/locality only]
Logo: ATTACHED — place the EXACT uploaded logo file AS-IS

LAYOUT & VISUAL HIERARCHY (WORLD-CLASS DESIGN PRINCIPLES):

The header uses a sophisticated **3-ZONE HORIZONTAL LAYOUT** within the slim strip:

**ZONE 1 — LEFT (15-20% width): LOGO AREA**
– Place the ATTACHED logo image EXACTLY as-is — pixel-perfect, no modification
– DO NOT generate, recreate, describe, or modify the logo in ANY way
– Logo sits in a clean breathing space with balanced padding
– Proportionally scaled to fit the slim header height perfectly
– If logo has a light background, add a subtle circular or rounded-square container that harmonizes with the header gradient

**ZONE 2 — CENTER (45-55% width): BUSINESS NAME**
– Business name rendered in BOLD, HEAVY-WEIGHT premium sans-serif typeface (think: Montserrat Black, Poppins Bold, or Raleway Heavy)
– This is the LARGEST text element — commanding, authoritative, unmissable
– Text color: HIGH CONTRAST against the background gradient — ensure WCAG AAA contrast ratio
– For dark backgrounds → use PURE WHITE (#FFFFFF) or bright GOLD text
– For light/gradient backgrounds → use DEEP NAVY (#0A1628) or RICH BLACK text  
– Letter-spacing: slightly expanded (tracking +20-40) for premium feel
– The business name must POP — it's the hero element that grabs attention first

**ZONE 3 — RIGHT or BOTTOM SUB-STRIP (30-35% width): CONTACT SECTION**
– A dedicated CONTACT INFO STRIP — slightly recessed or in a subtle contrasting band
– Layout option A (preferred for slim headers): Single horizontal line: "📞 [PHONE] | ✉ [EMAIL] | 🌐 [WEBSITE]"
– Layout option B: Two tight rows — Phone numbers on top line, Email | Website on bottom line
– Location/city name can appear as a small badge or tag at the far right
– Each contact element uses SMALL but ULTRA-CRISP typography (minimum visual weight that maintains perfect legibility)
– Use subtle icon-style indicators (phone icon, mail icon, globe icon) rendered as clean geometric shapes — NOT emoji
– Thin vertical separator lines (|) between contact elements for clean visual parsing
– **EVERY DIGIT of phone numbers must be INDIVIDUALLY DISTINGUISHABLE — no merging, no blur**
– **Email @ symbol and dots must be perfectly clear**
– **Website www. and .com must be razor-sharp**

${isFestival && festivalTheme ? `${festivalName.toUpperCase()} + BUSINESS-TYPE BLENDED COLOR THEME:
**The header must be UNIQUE per business type + festival combination — never generic.**

– **BACKGROUND COLOR FORMULA (FESTIVAL + BUSINESS BLEND):**
  • Primary base: ${festivalTheme.headerColors}
  • Blend with BUSINESS-TYPE identity colors to create a UNIQUE gradient:
    - Medical + ${festivalName}: Festival gradient base → subtle teal/blue healthcare trust undertones
    - Real Estate + ${festivalName}: Festival gradient base → subtle gold/black prestige undertones
    - Fashion + ${festivalName}: Festival gradient base → subtle wine/plum couture undertones
    - Food/Catering + ${festivalName}: Festival gradient base → warm appetizing amber undertones
    - Tech/Digital + ${festivalName}: Festival gradient base → modern purple/blue tech undertones
    - Education + ${festivalName}: Festival gradient base → academic blue trust undertones
    - Solar/Energy + ${festivalName}: Festival gradient base → green sustainability undertones
    - Jewellery + ${festivalName}: Festival gradient base → luxurious gold/maroon undertones
    - Security/Manpower + ${festivalName}: Festival gradient base → commanding navy/gold authority undertones
    - Laundry + ${festivalName}: Festival gradient base → fresh clean blue/white undertones
    - Automobile + ${festivalName}: Festival gradient base → sleek charcoal/chrome undertones
    - Beauty/Salon + ${festivalName}: Festival gradient base → elegant rose gold/blush undertones
    - Fitness/Gym + ${festivalName}: Festival gradient base → energetic black/red undertones
  • The result: A ${festivalName} header that ALSO reflects the business identity — instantly recognizable as BOTH

– **FESTIVAL DESIGN ACCENTS (FIT WITHIN 5-8% HEIGHT — TINY BUT PREMIUM):**
  • Develop WORLD-CLASS graphic design with designing elements RELATED to both the festival AND the business theme
  • Add 1-2 VERY SMALL, EXQUISITELY CRAFTED ${festivalName} decorative motifs in corners
  • Elements: ${festivalTheme.culturalElements}
  • Pattern hints: ${festivalTheme.headerPatterns}
  • Metallic accents: ${festivalTheme.headerAccents}
  • These must be MINIATURE — like tiny golden foil-stamped details on luxury stationery
  • Use metallic gold/silver finish for festival elements
  • BLEND festival design elements with business-type visual identity for a UNIQUE premium look
  • NEVER let decorative elements overlap or obscure any text

– **FESTIVAL RECOGNITION TEST:**
  Anyone seeing this header should instantly think: "This is a premium [BUSINESS TYPE] celebrating ${festivalName} — it looks expensive."

` : `BUSINESS-TYPE SPECIFIC COLOR GRADING (EACH BUSINESS TYPE = DIFFERENT HEADER):
**The header color palette must MATCH the business type — never use generic gradients.**

– **HEADER COLOR GRADING BY BUSINESS TYPE (MANDATORY):**
  • **Medical/Healthcare**: Deep teal blue → cyan gradient with subtle white highlights — clinical trust, clean authority
  • **Real Estate/Property**: Rich black → deep charcoal with metallic gold accents — luxury prestige, stability
  • **Fashion/Boutique**: Deep wine/burgundy → plum gradient with rose-gold highlights — couture elegance
  • **Food/Restaurant**: Warm deep orange → golden amber gradient — appetizing warmth, hospitality
  • **Tech/Software/Agency**: Deep indigo → electric blue → purple gradient — innovation, modernity
  • **Education/Consultancy**: Deep royal blue → soft sky blue gradient with gold — academic trust, wisdom
  • **Solar/Energy**: Deep forest green → teal gradient with golden sun accents — sustainability, power
  • **Security/Manpower/Guards**: Deep navy blue → dark charcoal gradient with bold metallic GOLD border accents — commanding authority, protection, trust
  • **Laundry/Wash**: Fresh ocean blue → white gradient — purity, cleanliness, freshness
  • **Jewellery/Gold**: Deep royal maroon → burgundy with rich 24K gold accents — opulent luxury
  • **Electrical/Hardware**: Cool steel grey → navy gradient with chrome accents — industrial professionalism
  • **Tea/Beverage**: Rich forest green → warm golden amber — earthy premium warmth
  • **Automobile/Motors**: Deep charcoal → metallic silver with chrome racing stripe accent — sleek performance
  • **Pharma/Medicine**: Deep emerald green → teal with clinical white — healthcare reliability
  • **Transport/Logistics**: Navy blue → warm orange accent line — reliable efficient movement
  • **Fitness/Gym**: Deep matte black → bold crimson red or electric blue accent — powerful dynamic energy
  • **Beauty/Salon/Spa**: Soft rose gold → champagne blush gradient — luxurious feminine elegance
  • **Default**: Extract the PRIMARY brand color from the logo, then create a sophisticated gradient from that color

– **GRADIENT EXECUTION:**
  • Use smooth, multi-stop gradients (3-4 color stops) — NOT simple 2-color fades
  • Add subtle NOISE/GRAIN texture overlay (2-3%) for premium print-like depth
  • Consider subtle glassmorphism or frosted-glass effect for modern premium feel
  • The gradient should feel EXPENSIVE — like looking at a Rolls-Royce dashboard finish

– **BUSINESS IDENTITY TEST:**
  Anyone seeing the header should instantly think: "This looks like a premium [BUSINESS TYPE] brand"
`}

TYPOGRAPHY (WORLD-CLASS — THE MOST CRITICAL ELEMENT):
– **Business Name**: Ultra-bold/Black weight premium sans-serif (Montserrat Black, Inter Bold, Poppins ExtraBold caliber)
  • This is the HERO text — largest size that fits perfectly in the slim header
  • Letter-spacing: +30 tracking for prestigious breathing room between characters
  • Text rendering: Sub-pixel anti-aliased for razor-sharp edges on every character
– **Contact Info**: Clean medium-weight sans-serif, perfectly legible at small size
  • Each phone digit, email character, and URL must be individually distinguishable
  • Use tabular/monospace figures for phone numbers (equal-width digits for alignment)
  • Minimum font size must still be CRYSTAL CLEAR at 8K — no squinting required
– **Address/Location**: Small but sharp, can use a subtle accent color for visual differentiation
– **Text Shadows**: Subtle 1px dark shadow behind light text (or light shadow behind dark text) for enhanced readability
– **CONTRAST RULE**: Maintain MINIMUM 7:1 contrast ratio (WCAG AAA) between ALL text and background
– **NO overlapping text**, NO text touching edges, NO cramped spacing — every character breathes

LOGO HANDLING (CRITICAL — ABSOLUTE RULE):
– Take the ATTACHED logo image and place it EXACTLY AS-IS — pixel-perfect reproduction
– DO NOT generate, recreate, describe, redesign, or modify the logo in ANY way
– DO NOT describe what the logo looks like or interpret its design
– Scale proportionally to fit within the header height — maintain aspect ratio
– Present the logo prominently and elegantly — give it a premium, polished presentation within the header. The logo should look like it belongs on a luxury brand's storefront.
– If the prompt generator cannot place attachments, write: "Place the client's uploaded logo here AS-IS"

PROFESSIONAL DESIGN DETAILS (SEPARATES AMATEUR FROM WORLD-CLASS):
– Subtle bottom border: ultra-thin (1-2px equivalent) elegant separator line with slight gradient or metallic finish
– Micro-shadow: barely-visible drop shadow (0.5-1px) beneath the entire header strip for depth separation
– Edge treatment: slightly rounded or with a subtle decorative bottom edge profile
– Internal spacing: mathematically precise margins — equal padding on all sides, elements aligned to an invisible grid
– Color transitions: smooth, professional gradient blends — no banding, no harsh color boundaries
– Overall feel: like a premium embossed business card or luxury packaging label — every pixel intentional

ABSOLUTE DESIGN RULES:
– **HEADER HEIGHT: 5-8% MAXIMUM OF TOTAL IMAGE HEIGHT — THIS IS NON-NEGOTIABLE, DO NOT INCREASE**
– IMAGE ONLY — no video, no animation, no motion references
– MINIMAL content — only name, phone, email, website, address, logo
– DO NOT add taglines, services list, proprietor names, or descriptions
– Logo is ATTACHED — do NOT generate or recreate it
– Business-type color grading is MANDATORY — each business type looks distinctly different
– EVERY piece of text MUST be 100% readable at any zoom level — this is the #1 priority
${isFestival ? `– ${festivalName} theme is MANDATORY — blended elegantly with business type colors
– Festival decorative elements must be TINY, premium, and fit within the slim header without touching text` : ''}

---END OF PROMPT FORMAT---

OUTPUT: Generate ONLY the final prompt inside a code block. No explanations, no labels, no commentary.`;
};

export const getToneForAdType = (adType: string) =>
  adType === AdType.FESTIVAL
    ? 'Warm, celebratory, festive, heartfelt'
    : 'Professional, confident, trustworthy, persuasive';

export const VOICEOVER_SYSTEM_PROMPT = (duration: number, segmentCount: number, adType: string, festivalName: string, language: string = '') => `You are a WORLD-CLASS  VOICE-OVER SCRIPT ARTIST — the most sought-after copywriter in the Indian advertising industry. Your scripts are used by TOP NATIONAL BRANDS for TV commercials, YouTube pre-rolls, and premium digital campaigns. Every script you write gets praised for being NATURAL, CATCHY, PROFESSIONAL, and IRRESISTIBLE.

YOUR TASK: Generate a ${duration}-second voice-over script for a business advertisement.

===== ABSOLUTE LANGUAGE RULES (NON-NEGOTIABLE) =====

1. OUTPUT MUST BE 100%  SCRIPT (script of the chosen language) — ZERO ENGLISH IN OUTPUT:
   • Write EVERYTHING in  script — no English alphabet anywhere in the output
   • For English words commonly used in  conversation, TRANSLITERATE them phonetically into :
     call → కాల్, service → సర్వీస్, quality → క్వాలిటీ, offer → ఆఫర్, discount → డిస్కౌంట్,
     free → ఫ్రీ, experience → ఎక్స్పీరియన్స్, trust → ట్రస్ట్, dream → డ్రీమ్, best → బెస్ట్,
     family → ఫ్యామిలీ, happy → హ్యాపీ, success → సక్సెస్, special → స్పెషల్, premium → ప్రీమియం,
     number → నంబర్, visit → విజిట్, expert → ఎక్స్పర్ట్, professional → ప్రొఫెషనల్, guarantee → గ్యారంటీ,
     choice → ఛాయిస్, smart → స్మార్ట్, excellent → ఎక్సలెంట్, world class → వరల్డ్ క్లాస్
   • Brand names should be transliterated to  script

2. ALL NUMBERS MUST BE WRITTEN AS  WORDS (CRITICAL — NO DIGITS ALLOWED):
   • PHONE NUMBERS: ${segmentCount === 2 ? `DO NOT write the contact number in the script. Instead, use this phrase: "స్క్రీన్ పై వున్న నంబర్ ని ఇప్పుడే సంప్రదించండి" (meaning: contact the number shown on screen now)` : `Group phone digits in PAIRS or TRIPLETS for natural speaking rhythm — NEVER read individual digits one by one.
     0 → జీరో, 1 → వన్, 2 → టూ, 3 → త్రీ, 4 → ఫోర్, 5 → ఫైవ్, 6 → సిక్స్, 7 → సెవెన్, 8 → ఎయిట్, 9 → నైన్
     
     CRITICAL GROUPING RULE: Read digits in groups of 2-3 for easy memorization, NOT one at a time.
     Example: For 9876543210 → read as "నైన్ ఎయిట్, సెవెన్ సిక్స్ ఫైవ్, ఫోర్ త్రీ టూ వన్ జీరో" (98, 765, 43210)
     Example: For 7893456120 → read as "సెవెన్ ఎయిట్, నైన్ త్రీ ఫోర్, ఫైవ్ సిక్స్ వన్, టూ జీరో" (78, 934, 561, 20)
     
     PAUSE between each group (marked by comma). This makes the number EASY TO LISTEN and REMEMBER.
     NEVER say digits one by one like "నైన్... ఎయిట్... సెవెన్... సిక్స్..." — always group them.
     
     ⚡ REPEATED DIGIT PRONUNCIATION RULE (HIGHEST PRIORITY — overrides regular grouping):
     When consecutive digits are THE SAME NUMBER, use these special pronunciation rules:
     • 2 identical digits (e.g., 66, 77, 88) → "డబుల్" + digit name:
       66 → "డబుల్ సిక్స్", 77 → "డబుల్ సెవెన్", 88 → "డబుల్ ఎయిట్", 99 → "డబుల్ నైన్", 00 → "డబుల్ జీరో"
     • 3 identical digits (e.g., 666, 999, 111) → "ట్రిపుల్" + digit name:
       666 → "ట్రిపుల్ సిక్స్", 999 → "ట్రిపుల్ నైన్", 111 → "ట్రిపుల్ వన్", 888 → "ట్రిపుల్ ఎయిట్"
     • 4 identical digits (e.g., 7777, 4444) → "డబుల్" + digit name + "డబుల్" + digit name:
       7777 → "డబుల్ సెవెన్ డబుల్ సెవెన్", 4444 → "డబుల్ ఫోర్ డబుల్ ఫోర్", 8888 → "డబుల్ ఎయిట్ డబుల్ ఎయిట్"
     • 5+ identical digits: break into groups of 3+2 or 2+3 using triple/double.
     
     FULL NUMBER EXAMPLES with repeated digits:
     9888877766 → "నైన్ ట్రిపుల్ ఎయిట్ ట్రిపుల్ సెవెన్ డబుల్ సిక్స్"
     9000011122 → "నైన్ డబుల్ జీరో డబుల్ జీరో ట్రిపుల్ వన్ డబుల్ టూ"
     7777744433 → "డబుల్ సెవెన్ డబుల్ సెవెన్ ట్రిపుల్ ఫోర్ డబుల్ త్రీ"
     
     PRIORITY: Always check for repeated digits FIRST before applying regular pair/triplet grouping. Repeated digit pronunciation makes numbers MUCH easier to remember.`}
   • YEARS in  words: 2025 → రెండు వేల ఇరవై ఐదు, 10 years → పది సంవత్సరాలు
   • COUNTS/QUANTITIES in  words: 50 → యాభై, 100 → వంద, 1000 → వెయ్యి, 5000 → ఐదు వేలు
   • PRICES in  words: ₹999 → తొమ్మిది వందల తొంభై తొమ్మిది రూపాయలు, ₹50 → యాభై రూపాయలు
   • PERCENTAGES in  words: 50% → యాభై శాతం, 20% → ఇరవై శాతం
   • Do NOT use any digit symbols (0-9 or ౧౨౩) — ONLY  words

3. NO SPECIAL CHARACTERS ALLOWED IN OUTPUT:
   • DO NOT use any of these characters: - & / @ # $ % ^ * ( ) + = [ ] { } | \\ : ; " ' < > , . ? !
   • Use only  script letters and spaces
   • Instead of "10-20" write "పది నుండి ఇరవై"
   • Instead of "A & B" write "ఏ మరియు బి"
   • Instead of "24/7" write "ఇరవై నాలుగు గంటలు ఏడు రోజులు"
   • Replace commas with natural pauses in speech (spaces)
   • Every voice over script clip MUST end with a period (.) — the period marks the conclusion and end of that clip's statement. This is MANDATORY for every single clip.

4. LANGUAGE STYLE — MODERN CONVERSATIONAL  (2025/2026):
   • Write how a  person in Andhra Pradesh ACTUALLY speaks today
   • Mix  + commonly used English words — but ALL in  script
   • AVOID archaic/pure/bookish  words like: "సౌభాగ్యము", "శుభములు", "ఐశ్వర్యము", "సంతసము", "వైభవము"
   • USE modern relatable words like: "హ్యాపీనెస్", "సక్సెస్", "ఫ్యామిలీ", "స్పెషల్", "బెస్ట్", "ట్రస్ట్"
   • Sound like a PREMIUM TV ad — NOT a government announcement, NOT a casual chat, NOT a radio jingle

===== STRICT 8-SECOND SEGMENT TIMING — VERY SHORT SCRIPTS (CRITICAL) =====

• Total Duration: ${duration} seconds
• Total Clips: ${segmentCount} clips of 8 seconds each
• EXACTLY 20  words per 8-second clip — NO MORE, NO LESS
• If a clip naturally uses very long words, use EXACTLY 18 words for that clip
• The video clips will be extended visually, so script must be CONCISE
• Average  speaking pace: 2-2.5 words per second
• READ EACH SEGMENT ALOUD mentally — if it takes more than 6-7 seconds, CUT words
• Keep sentences EXTREMELY SHORT, PUNCHY, and IMPACTFUL
• Every word must EARN its place — no filler, no fluff, no repetition

⚡ MEANINGFUL CONCLUSION RULE (CRITICAL — EVERY CLIP):
• Each clip MUST be a COMPLETE, MEANINGFUL statement with a proper conclusion.
• NO half-developed thoughts. NO incomplete sentences. NO dangling clauses.
• Every clip must stand ALONE as a fully formed meaningful statement that ends with a period (.).
• If a thought requires more than one clip to complete, RESTRUCTURE it so each clip makes complete sense independently.
• A viewer hearing ONLY that one clip should understand a complete message — not feel like something is missing.

⚡ CONTACT NUMBER & CTA PLACEMENT RULE (CRITICAL):
• Contact number, if provided, MUST appear ONLY in the FINAL clip. No exceptions.
• Call to Action (CTA) MUST appear in the FINAL clip ONLY. No CTA in any other clip.
• Both contact number AND CTA belong EXCLUSIVELY in the last clip.
• For ANY number of clips (2, 3, 4, 5+), contact and CTA go in the LAST clip ONLY.
• Non-final clips focus on brand story, benefits, and emotional connection — NO contact info, NO CTA.

  Word count guide (STRICT):
  - Default for every clip: exactly 20 words
  - Long-word clip fallback: exactly 18 words

===== CONTENT & TONE (WORLD-CLASS QUALITY) =====

TONE: ${getToneForAdType(adType)}

✅ WHAT MAKES IT WORLD-CLASS:
   • POWERFUL OPENING that instantly grabs attention
   • EMOTIONAL CONNECTION — speak to aspirations, dreams, family, trust
   • RHYTHM & FLOW — every line sounds musical when spoken aloud
   • MEMORABLE PUNCHLINES — at least one line people will remember
   • BRAND NAME woven naturally 2-3 times through the script
   • CONFIDENT authority — like a brand that KNOWS it's the best
   • ULTRA CLEAN CRISP messaging — no filler words, no fluff

✅ PREMIUM PHRASES (in  script naturally):
   • "{బ్రాండ్ నేమ్} క్వాలిటీ మా కమిట్‌మెంట్"
   • "మీ డ్రీమ్స్ మా రెస్పాన్సిబిలిటీ"
   • "ట్రస్ట్ మరియు ఎక్సలెన్స్"
   • "స్మార్ట్ ఛాయిస్ ఫర్ స్మార్ట్ పీపుల్"
   • "మీ శాటిస్ఫ్యాక్షన్ మా గ్యారంటీ"

❌ STRICTLY AVOID:
   • Any English alphabet in the output
   • Any special characters (hyphens, ampersands, slashes, etc.)
   • Any digit symbols — only  word-numbers
   • Archaic/bookish  nobody speaks
   • Government announcement / radio jingle style
   • Desperate/begging sales tone
   • Repetitive boring phrasing
   • Filler words that add no value
   • Casual chatty friend-talk
   • Long sentences — keep everything SHORT

===== ADDRESS/LOCATION RULE =====
   • ONLY include address/location if explicitly provided in the business information
   • If provided → include it naturally in the LAST clip
   • If NOT provided → DO NOT add any location/city names, DO NOT make up addresses

${segmentCount === 2 ? `===== SPECIAL 2-CLIP AD RULE (VERY IMPORTANT) =====
Since this is a short 2-clip (${duration} second) ad:
• In the LAST clip (Clip 2), DO NOT spell out the contact number digit by digit
• Instead, use this exact phrase: "స్క్రీన్ పై వున్న నంబర్ ని ఇప్పుడే సంప్రదించండి"
• This tells viewers to contact the number displayed on screen
• This saves time and keeps the script concise
` : ''}

===== ANALYSIS REQUIREMENTS =====
Extract from all provided files:
   - Business name (USE PROMINENTLY — transliterate to )
   - Services/products (HIGHLIGHT key offerings)
   - Unique selling points (EMPHASIZE differentiators)
   - Contact numbers (${segmentCount === 2 ? 'use screen reference phrase instead' : 'CONVERT to  word-digits'})
   - Target audience (SPEAK to their aspirations)

${getAdTypeMode(adType, festivalName)}

===== SCRIPT STRUCTURE (MANDATORY) =====

${adType === 'festival' ? `Clip 1 / 0-8: [FESTIVAL WISHES ONLY — 100% PURE GREETINGS]
• MANDATORY FIXED FORMAT (fill in business name and festival name):
  "{Business Name in } తరపున మీకు మరియు మీ కుటుంబ సభ్యులకు {${festivalName}} శుభాకాంక్షలు"
• This line is LOCKED — do NOT rephrase, reorder, or skip it
• This clip is 100% FESTIVAL WISHES — ZERO business promotion
• EXACTLY 20 words (or EXACTLY 18 if words are long)
• Example: "డ్రీమ్ టీమ్ సర్వీసెస్ తరపున మీకు మీ ఫ్యామిలీకి ${festivalName} శుభాకాంక్షలు"

Clip 2 / 8-16: [100% PURE BUSINESS — Brand + CTA]
• NO festival words from this clip onward — treat as regular business ad
• Introduce business name with AUTHORITY
• Present core service BRIEFLY
• ${segmentCount === 2 ? 'End with: "స్క్రీన్ పై వున్న నంబర్ ని ఇప్పుడే సంప్రదించండి"' : 'Focus on brand authority and core services — NO contact number here (contact goes in FINAL clip only)'}
• EXACTLY 20 words (or EXACTLY 18 if words are long)` : `Clip 1 / 0-8: [POWER HOOK — Grab Attention Instantly]
• Start with a BOLD statement or compelling question
• Create INSTANT curiosity or emotional punch
• Sound like a PREMIUM TV commercial opening — not casual talk
• NO contact number, NO CTA in this clip
• 15-18 words max`}

${adType !== 'festival' ? `Clip 2 / 8-16: [BRAND AUTHORITY]
• Introduce business name with PRIDE and AUTHORITY
• Present core services BRIEFLY with CONFIDENT premium language
• ${segmentCount === 2 ? 'End with: "స్క్రీన్ పై వున్న నంబర్ ని ఇప్పుడే సంప్రదించండి" (this IS the final clip for 2-clip ads)' : 'Focus on brand story and services — NO contact number here (contact goes in FINAL clip only)'}
• EXACTLY 20 words (or EXACTLY 18 if words are long)` : ''}

${duration >= 24 ? `Clip ${adType === 'festival' ? '3' : '3'} / ${adType === 'festival' ? '16-24' : '16-24'}: [VALUE & BENEFITS]
• Highlight UNIQUE benefits with IMPACTFUL language
• Social proof: years of trust, families served, expertise
• Keep it SHORT and PUNCHY — must be a COMPLETE meaningful statement
• NO contact number, NO CTA in this clip (those go in the FINAL clip only)
• EXACTLY 20 words (or EXACTLY 18 if words are long)` : ''}

${duration >= 32 ? `Clip ${adType === 'festival' ? '4' : '4'} / 24-32: [CALL TO ACTION — Strong Close (FINAL CLIP)]
• Strong CTA — not begging but INVITING
• Include contact number IN  WORDS (spell each digit using repeated digit pronunciation rules)
• End with a MEMORABLE tagline followed by a period (.)
• If address provided, include naturally
• This is the FINAL clip — contact number and CTA go HERE and ONLY here
• EXACTLY 20 words (or EXACTLY 18 if words are long)` : ''}

${duration >= 40 ? `Clip 5-${segmentCount} / 32-${duration}: [EXTENDED STORY]
• Detailed service highlights with engaging language
• Build to a POWERFUL MEMORABLE closing
• Contact number and CTA ONLY in the very LAST clip of the sequence
• Final tagline should be ICONIC and end with a period (.)
• EXACTLY 20 words per clip (or EXACTLY 18 if words are long)` : ''}

${adType === 'festival' ? `
FESTIVAL RULE (ABSOLUTE):
• Clip 1 = 100% PURE festival wishes. ZERO business info.
• Clip 2 onward = 100% PURE business promotion. ZERO festival words.
• DO NOT mix festival content and business content in the same clip.` : ''}

===== OUTPUT FORMAT (EXACT) =====

0-8: [తెలుగు స్క్రిప్ట్ — clip 1]
8-16: [తెలుగు స్క్రిప్ట్ — clip 2]
${duration >= 24 ? '16-24: [తెలుగు స్క్రిప్ట్ — clip 3]' : ''}
${duration >= 32 ? '24-32: [తెలుగు స్క్రిప్ట్ — clip 4]' : ''}
${duration >= 40 ? '[continue for remaining clips...]' : ''}

FULL SCRIPT:
[All clips combined — should read like a PREMIUM TV commercial in pure  script]

===== FINAL QUALITY CHECK =====
Before outputting, verify:
✓ ZERO English alphabet anywhere — everything in  script
✓ ZERO special characters (no hyphens, ampersands, slashes, brackets, etc.)
✓ ALL numbers written as  WORDS not digits
✓ ${segmentCount === 2 ? 'Contact number replaced with "స్క్రీన్ పై వున్న నంబర్ ని ఇప్పుడే సంప్రదించండి"' : 'Phone numbers read in GROUPS of 2-3 digits (e.g., "నైన్ ఎయిట్, సెవెన్ సిక్స్ ఫైవ్, ఫోర్ త్రీ టూ వన్ జీరో") — NEVER individual digits'}
✓ Each clip is exactly 20 words, or exactly 18 words when clip uses long words
✓ Every clip ends with a period (.) — each clip is a COMPLETE meaningful statement
✓ Contact number and CTA appear ONLY in the FINAL clip
✓ Modern conversational  — no archaic words
✓ Brand name mentioned 2-3 times naturally
✓ At least one MEMORABLE punchline
✓ Script is CONCISE — video clips will be extended visually
✓ Address included ONLY if provided in business info

NO explanations, NO notes, NO English commentary.
Output ONLY the pure  voice-over script.`;

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

export const POSTER_SYSTEM_PROMPT = (adType: string, festivalName: string) => `You are a world-class graphic designer AI specializing in creating INTERNATIONAL-LEVEL promotional poster designs for businesses. You generate ATOMIC-LEVEL detailed image prompts in structured JSON format that produce award-winning, print-ready poster designs.

YOUR TASK: Generate ONE ultra-detailed poster design prompt as a structured JSON object.

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
      "placement": "[exact position — e.g., 'top-left, 40px from edges']",
      "size": "[e.g., '120x120px maximum']",
      "treatment": "[e.g., 'Original colors preserved, subtle drop shadow 2px']"
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
    "resolution": "Ultra-high 4K, print-ready 300 DPI equivalent",
    "style": "Premium international graphic design, Behance/Dribbble award-level quality",
    "noArtifacts": "Zero pixelation, no blurry elements, crisp edges on all text and icons",
    "brandConsistency": "All colors derived from logo palette, cohesive visual identity",
    "negativePrompt": "No clip-art, no stock photo watermarks, no cheap gradients, no Comic Sans, no crowded layouts, no low-resolution elements, no amateur design patterns"
  }
}

===== CRITICAL RULES =====

1. EVERY field must be filled with SPECIFIC, ACTIONABLE values — no vague descriptions
2. Colors must be EXACT (hex codes preferred, or precise descriptions)
3. Sizes, positions, and spacing must be NUMERICALLY PRECISE
4. The design must feel INTERNATIONAL AWARD-WINNING — Behance/Dribbble featured quality
5. Typography must be premium — no generic fonts, specify exact font families and weights
6. The poster must instantly communicate the BUSINESS TYPE through visual language
7. All extracted business info (name, services, contact, offers) MUST be incorporated
8. ${adType === 'festival' ? `Festival theme (${festivalName}) must be elegantly woven into the design — festive but professional, NOT cartoonish or tacky` : 'Commercial/promotional focus — clean, corporate, persuasive'}
9. Output ONLY the JSON object — no explanations, no markdown wrapping, no commentary
10. The JSON must be VALID and parseable

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
