/**
 * The poster style library — what the model is "trained" on.
 *
 * There is no fine-tuning here and there should not be: the image and text models the team uses
 * already know how to draw. What they do not know is the TEAM'S taste — the eight families of
 * conceptual advertising the team studies and sells, and how a festival is folded into a client's
 * business. That knowledge lives in this file as data, and the concept prompt
 * (services/prompts/posterConcept) is built from it. Adding a style is a data edit here; nothing
 * else changes.
 *
 * Every style carries:
 *  - the MECHANISM — the transferable rule that makes the reference ads work. This is the part
 *    that generalises to a paint shop in Kakinada; the famous brands are only evidence of it.
 *  - REFERENCE ADS — the actual boards the team collected, described precisely enough that the
 *    model can reason from them (few-shot examples). They are examples of the IDEA, never
 *    templates to copy: a poster that reuses the Vaseline lips for a jeweller has failed.
 *  - FESTIVAL FUSION — how this style carries an occasion without turning into a greeting card.
 *
 * ── The three festival references ────────────────────────────────────────────────────────────
 * FESTIVAL_REFERENCES are the team's own posters (Udaan Events ×2, Dhanalakshmi Shopping Mall),
 * each an example of a different way to fuse an occasion with a business. They are the standard
 * a festival poster is measured against.
 */

export interface PosterReference {
  /** The advertiser, when there is one on the board. */
  brand?: string;
  /** What is in the frame — the metaphor, described as a picture. */
  visual: string;
  /** The line on the poster, verbatim where it was legible. */
  copy?: string;
  /** Why it works — the idea underneath, in one line. */
  insight?: string;
}

export interface PosterStyle {
  id: string;
  /** Shown in the picker and the brief. */
  label: string;
  emoji: string;
  /** The board's own sticky-note line — the promise of the style in four words. */
  keyword: string;
  /** One line for the picker. */
  short: string;
  /** What this kind of ad is. */
  definition: string;
  /** THE rule — how the idea is constructed, stated so it transfers to any business. */
  mechanism: string;
  /** The steps to build one for a client, in order. */
  recipe: string[];
  /** The businesses this style serves best — a steer for the "best fit" choice, not a limit. */
  bestFor: string;
  /** How the finished poster looks: light, ground, finish, type. */
  artDirection: string;
  /** How an occasion is carried by THIS style. */
  festivalFusion: string;
  /** The ways this style goes wrong. */
  avoid: string[];
  /** The reference boards — the few-shot evidence. */
  references: PosterReference[];
}

/** The "let the model choose" option. Not a style of its own — the brief says pick the best one. */
export const AUTO_POSTER_STYLE = "auto";

export const POSTER_STYLES: PosterStyle[] = [
  {
    id: "animal_metaphor",
    label: "Animal-based visual metaphor",
    emoji: "🐆",
    keyword: "Creativity beyond expectations",
    short: "An animal embodies the brand's quality — strength, speed, precision, loyalty",
    definition:
      "An animal stands in for the benefit. Its instantly-known trait (the elephant's weight, the cheetah's speed, the eagle's eye, the lion's authority, the camel's thirst) is borrowed and pinned onto the product or the business, often by fusing the two into one impossible creature or putting the animal in a human situation.",
    mechanism:
      "Pick the ONE quality the client wants to own. Find the animal the whole world already associates with that quality. Then make the animal and the product/business meet in a single impossible picture: the animal wears, carries, becomes, tests or is transformed by the product. The viewer decodes trait → product in under a second.",
    recipe: [
      "Name the single benefit to dramatise (durability, speed, purity, trust, protection, growth).",
      "Choose the animal that owns that trait in everyone's mind — avoid obscure animals.",
      "Stage one impossible, photoreal encounter between the animal and the real product or service (fusion, swap, test, costume, scale).",
      "Clean, uncluttered ground so the creature reads as a silhouette; the product sharp and recognisable.",
      "One short headline that names the benefit the animal just proved.",
    ],
    bestFor: "phones & electronics (durability), bags & luggage (toughness), water & drinks (survival, purity), security & CCTV (vigilance), fitness, finance, NGOs & causes, leadership brands",
    artDirection:
      "Hyper-real CGI / studio photography, one hero subject, soft directional light, generous negative space on a plain or softly graded background, premium editorial typography.",
    festivalFusion:
      "Give the occasion's own sacred or iconic animal the business's job, or let the business's animal carry the festival: Mooshika (Ganesha's mouse) carrying the client's product as an offering, a peacock in the festival's colours displaying the client's range, a bull at Sankranthi hauling the client's goods. Always devotional-respectful — cute or noble, never mocking.",
    avoid: [
      "cartoon animals or clip-art — it must read as a photograph",
      "more than one metaphor in the frame",
      "an animal with no link to the benefit (a random tiger 'for power')",
      "cruel or frightening imagery for a consumer brand",
    ],
    references: [
      { visual: "A giant elephant's foot pressing down on a tiny ant that holds a string", copy: "DESIGN — The only profession where everyone thinks they're the Creative Director.", insight: "scale gap = power imbalance, instantly" },
      { brand: "PETA", visual: "A handbag made from a real crocodile, the reptile still recognisable as the bag, blood pooling beneath it", copy: "No Fashion Justifies Cruelty. Choose compassion. Choose change.", insight: "product and animal fused to expose the cost" },
      { brand: "AXE", visual: "A cheetah carrying a tortoise shell on its back", copy: "NOT SO FAST. Last longer with real strength.", insight: "speed + endurance in one creature" },
      { brand: "Virvana", visual: "A rhino balancing its whole weight on a small wooden table", copy: "Balance — Strength in harmony.", insight: "impossible balance proves the product's poise" },
      { visual: "A cheetah looking through binoculars, and an eagle with a razor-sharp gaze", copy: "Growth… beyond expectations / Accuracy… beyond expectations", insight: "animal trait = company value" },
      { brand: "Unplastic India", visual: "Two hands twisting a sea turtle as if it were a plastic bottle cap", copy: "Still using plastic?", insight: "the victim replaces the product" },
      { visual: "Extreme close-up of an animal's eye reflecting an excavator tearing down a forest, a tear falling", copy: "Their home is in your hands.", insight: "the eye becomes the witness" },
      { brand: "Kids Care", visual: "A tall giraffe and a small elephant standing side by side", copy: "Different but equal.", insight: "two sizes, one message of equality" },
      { visual: "A lion sitting cross-legged on a leather armchair wearing pink sneakers", copy: "Boss but also a friend.", insight: "authority softened by a human detail" },
      { brand: "OPPO", visual: "An elephant stepping on a pink smartphone that stays intact", copy: "King of Durability.", insight: "the heaviest possible test, passed" },
      { brand: "FLOW water", visual: "A camel in a desert at sunset bending to drink from a giant FLOW bottle", copy: "Survival goes on.", insight: "the animal that never needs water chooses this one" },
      { visual: "A dog's paw resting in a human hand", copy: "Paws People — They don't need words to be heard.", insight: "one touch carries the whole relationship" },
      { visual: "An owl whose eye is a camera lens", copy: "When every move matters. Nature always sees more.", insight: "vigilance animal = CCTV" },
      { visual: "A rooster whose body is a leather handbag", copy: "Culture Soul!", insight: "craft heritage made literal" },
      { brand: "Samsonite", visual: "A charging bull pushing a hard-shell suitcase through dust", copy: "Tougher Journeys. Greater Stories.", insight: "raw force can't break it" },
    ],
  },
  {
    id: "shape_concept",
    label: "Shape-based conceptual",
    emoji: "🔷",
    keyword: "Creative shapes, stronger ideas",
    short: "The product or scene forms a meaningful shape — negative space, silhouettes, symbols",
    definition:
      "The idea lives in a SHAPE. Objects are arranged, bent or cut so their outline, their gap or their pattern draws a second meaning — two bottles twisting into DNA, a colander straining people, negative space between two silhouettes forming a bottle.",
    mechanism:
      "Find a universally known shape that means the benefit (DNA = inside you, a king chess piece = leadership, a crown = best, a spring = compact energy, a seesaw = balance). Then build that shape out of the client's own product, tools or context — or let it appear in the negative space between them. The viewer sees the object first and the meaning a beat later: that beat is the ad.",
    recipe: [
      "State the benefit as a symbol people already read without words.",
      "Build the symbol from the client's real product, packaging, tools or premises elements.",
      "Keep everything else flat and quiet — one colour field, one hero shape.",
      "Use negative space deliberately: what is NOT drawn can carry the second image.",
      "A short headline that completes the thought the shape started.",
    ],
    bestFor: "any product with a distinctive form (bottles, tools, food, furniture), agencies & consultancies, auto parts, education, brand-building messages",
    artDirection:
      "Minimalist, graphic, high-contrast: a single bold background colour (often the brand colour), crisp studio-lit objects, lots of empty space, clean modern sans-serif type.",
    festivalFusion:
      "Make the festival symbol out of the business's own things — like the Udaan poster, where stage truss, moving-head lights and drapes FORM Lord Ganesha's face. A jeweller's necklaces curving into a diya flame, a sweet shop's laddoos stacked into a kalash, a tile showroom's tiles laid as a rangoli, a hardware store's tools arranged as a Sankranthi kite.",
    avoid: [
      "shapes that need explaining",
      "busy backgrounds that fight the silhouette",
      "stock icons pasted on — the shape must be made of the client's real things",
    ],
    references: [
      { brand: "IKEA", visual: "An old telephone's coiled cord compressed like a spring", copy: "Smaller spaces, bigger possibilities.", insight: "compressed shape = compact living" },
      { brand: "Biscure mineral water", visual: "Two water bottles twisted together into a DNA double helix on deep green", copy: "It's in you.", insight: "the product becomes your DNA" },
      { brand: "Coca-Cola", visual: "White silhouettes of a mother kneeling to kiss her child on red — the gap between them is the Coke bottle contour", copy: "Happy Mother's Day", insight: "negative space hides the brand" },
      { brand: "Instituto Gastro Cursos", visual: "A seesaw where one apple outweighs a pile of junk food", copy: "LESS IS MORE.", insight: "balance shape proves the value" },
      { brand: "Vinwash", visual: "A yellow rubber-gloved hand making an OK sign on bright blue, a small splash at the fingertip", copy: "Small act. Big impact.", insight: "a gesture shaped as the result" },
      { brand: "Nolte", visual: "Rows of burnt black matches with one bright red unlit match standing out", copy: "We know what it takes to make your BRAND STAND OUT!", insight: "pattern broken by one element" },
      { brand: "MV Tasarim", visual: "A house cat walking through a doorway and emerging on the other side as a tiger", copy: "We help your brand grow.", insight: "the door is the transformation" },
      { brand: "Moore Media", visual: "A hand shaking a black colander on red; tiny red people fall through the holes", copy: "Filtering clients is part of growth.", insight: "the kitchen tool becomes the process" },
      { brand: "Nissan", visual: "A tall tower of stacked engine-part blocks, one wrong red block about to topple it", copy: "A single wrong part could affect the entire set.", insight: "Jenga shape = risk" },
      { visual: "A red chess pawn looking into a mirror and seeing a king", copy: "Stop Guessing. Where your growth is stuck.", insight: "reflection shows the potential" },
      { visual: "A red paper plane casting the shadow of a fighter jet", copy: "Use your imagination.", insight: "outline vs shadow" },
      { brand: "Heinz", visual: "A ketchup bottle on red with a crown-shaped shadow and tomatoes flying around it", copy: "The King of Ketchup.", insight: "crown shape claims leadership" },
    ],
  },
  {
    id: "product_benefit",
    label: "Product-benefit conceptual",
    emoji: "🧴",
    keyword: "Ideas that sell feelings",
    short: "The product's result is dramatised as a picture — the benefit you can see",
    definition:
      "The poster SHOWS what the product does rather than saying it. The result is turned into a literal, surprising image — tiny workers repairing cracked lips, a coffee bean that is half a brain, hair flowing out of a bottle — usually with the real product in frame and a short benefit line.",
    mechanism:
      "Write the benefit as a sentence ('repairs dry lips', 'wakes up your brain', 'makes hair strong'). Take the sentence LITERALLY and picture it happening, with the real product as the cause. The more literal and physical the picture, the faster it sells the feeling. Supporting benefit icons may sit beneath as three short proof points.",
    recipe: [
      "Pick the client's strongest single result (clean teeth, faster internet, fresh vegetables, glowing skin).",
      "Take the result literally and design the moment it happens — miniature people at work, a transformation, a before/after in one object.",
      "Show the client's real product or service as the cause, sharp and recognisable.",
      "Headline = the feeling; up to three tiny icon + two-word proof points if the product has them.",
    ],
    bestFor: "FMCG, cosmetics & salons, pharmacies & clinics, food & beverages, supplements, cleaning products, any business whose result can be seen",
    artDirection:
      "Bright, appetising, commercial product photography; brand-coloured background; macro detail on the benefit; bold friendly headline; optional row of three benefit icons.",
    festivalFusion:
      "Let the benefit serve the festival: a sweet shop's box opening into a glowing Diwali courtyard, a saree store's silk flowing out into a Bathukamma, a pharmacy keeping the family well enough to celebrate. The product delivers the festival feeling — the greeting headline names the occasion.",
    avoid: [
      "listing features in paragraphs",
      "a pretty product shot with no benefit shown",
      "fake statistics, invented reviews or made-up claims",
    ],
    references: [
      { brand: "NESCAFÉ", visual: "A coffee bean whose one half is a pink human brain", copy: "Refresh your braincells. Good ideas start with a great cup.", insight: "bean = brain fuel; icons: Focus better · Think clearer · Stay productive" },
      { brand: "Vaseline", visual: "Tiny construction workers in blue overalls repairing the cracks on a pair of lips, the jar beside them", copy: "Repairs a little. Restores a lot. Confidence, everyday.", insight: "the repair made literal" },
      { brand: "TRESemmé", visual: "A bottle with a long glossy black ponytail flowing out of it", copy: "Strong Hair Keratin Care!", insight: "the result pours from the product" },
      { brand: "The Body Shop", visual: "A banana with a concealer stick covering its dark spot", copy: "Nobody loves dark spots.", insight: "everyday object stands in for skin" },
      { brand: "NutriWow", visual: "Spider-Man's gloved hand reaching for a pack of almonds", copy: "Unleash your inner superpower.", insight: "the snack = the power" },
      { visual: "A magnifying glass over a ginger shot bottle revealing real ginger inside", copy: "Take a closer look. Naturally flavoured.", insight: "proof under inspection" },
      { visual: "A supplement bottle tipping out a cascade of soft white pillows", copy: "Sleep — better sleep, brighter tomorrow.", insight: "pills become pillows" },
      { visual: "Big typographic poster: 'DON'T BUY THIS SERUM' with the bottle beside it", copy: "Unless you want clear, stable skin in 28 days.", insight: "reverse psychology headline" },
      { brand: "FLOW water", visual: "A camel drinking from a giant FLOW bottle in the desert", copy: "Survival meets purity.", insight: "purity proven where water matters most" },
    ],
  },
  {
    id: "contrast_concept",
    label: "Contrast-based conceptual",
    emoji: "☯️",
    keyword: "Ideas that make you think",
    short: "Two opposites side by side — split frames, before/after, one object half-and-half",
    definition:
      "Meaning comes from putting two opposite things together: a split background, an object that is half one thing and half another, a tiny thing beside a huge one, a harmless object that casts a harmful meaning. The comparison makes the argument without words.",
    mechanism:
      "Find the two states the client moves people between (problem → solution, dirty → clean, ordinary → premium, danger → safety). Put both in ONE frame with a hard, visible dividing line or a single hybrid object, so the eye compares them instantly. The client is always on the better side.",
    recipe: [
      "Name the two opposite states.",
      "Choose the device: split background, half-and-half hybrid object, big vs small, or object vs its consequence.",
      "Make the divide razor-clean and centred; mirror the composition on both sides.",
      "Put the client's product or service on the winning side.",
      "A two-part headline that mirrors the split ('You can fix it! / but what about this?').",
    ],
    bestFor: "cleaning & laundry, insurance & health, repair services, renovation, education & coaching, social causes, any before/after business",
    artDirection:
      "Bold graphic split in two strong colours, symmetrical composition, crisp studio lighting, short two-part typography.",
    festivalFusion:
      "Contrast the everyday with the festival: one half an ordinary shop front, the other the same front glowing for Diwali because of the client; a plain white saree half becoming a festive silk; darkness on one side, a diya from the client's range lighting the other. The occasion is the better side.",
    avoid: [
      "a split that doesn't compare anything",
      "unclear which side is the client's",
      "cluttered halves — each side holds one idea",
    ],
    references: [
      { visual: "Split frame: blue half with a broken chair (fixable), green half with a cut tree stump", copy: "You can fix it! but what about this? #SaveBrazilianForest", insight: "repairable vs irreversible" },
      { brand: "Mercedes-Benz", visual: "A deer lit gracefully above; below, the same scene reveals a target on a bull", copy: "See the beauty. Not the bullet. Different perspective. Same reality.", insight: "two readings of one scene" },
      { brand: "Durex", visual: "A red-headed match with a blue safety cap over its tip, beside a lit match", copy: "Ignite responsibly. Some sparks need protection.", insight: "danger vs protected" },
      { visual: "Three panels: a revolver beside a megaphone, a pencil loaded like a bullet, a missile as a microphone", copy: "Words kill wars. Words build ideas. Words start change.", insight: "weapon vs voice" },
      { brand: "Samsonite", visual: "A huge elephant balancing on one small red suitcase", copy: "Stronger than what you think.", insight: "heavy vs small, suitcase wins" },
      { brand: "Vanish", visual: "A giraffe and zebra on a pink background; on the right half their patches are washed white", copy: "Even black becomes white.", insight: "stain vs clean in one animal" },
      { brand: "Medical Mutual", visual: "One ball that is half basketball, half tomato", copy: "Official health insurer of the Cavaliers.", insight: "sport + health in one object" },
      { brand: "Medical Mutual", visual: "One ball that is half American football, half watermelon", copy: "Official health insurer of the Browns.", insight: "the same idea extended as a campaign" },
      { visual: "Red sunglasses whose lens reflects a person joyfully drinking a can", copy: "Contrast makes the everyday epic.", insight: "reflection vs reality" },
    ],
  },
  {
    id: "proportion_concept",
    label: "Proportion-based conceptual",
    emoji: "🔍",
    keyword: "Small ideas, big impact",
    short: "Play with scale — tiny people on giant products, giant objects in a tiny world",
    definition:
      "The idea is carried by wrong SIZE. A product made enormous towers over a city; miniature people work on a normal-sized object; a huge animal perches on something tiny. Changing scale turns an ordinary product into a landmark or a world.",
    mechanism:
      "Decide whether the client's product should feel BIGGER than life (importance, abundance, flavour, power) or should host a tiny world (care, detail, craftsmanship, effort). Then break real-world proportion boldly and photograph it as if it were real, with human figures for scale.",
    recipe: [
      "Choose the direction: product giant, or people tiny.",
      "Give the scale break a job — the giant product is a building, a stage, a wave; the tiny people are cleaning, repairing, harvesting, climbing.",
      "Include a recognisable human or object for scale so the size gap is instant.",
      "Keep it photoreal; a scale break drawn as a cartoon loses its surprise.",
      "Headline that names the size of the benefit (PLAY BIG, Food so good you don't need to stop).",
    ],
    bestFor: "restaurants & food, real estate & construction, retail (abundance), events, travel, sports goods, automobiles, brands wanting a landmark image",
    artDirection:
      "Cinematic photoreal compositing, low camera angles for giants, macro for miniatures, golden or clean studio light, bold short headline.",
    festivalFusion:
      "Make the festival monumental through the business: a giant Ganesha idol built by tiny workers from the client's materials, a sweet shop's laddoo as big as a temple with devotees around it, a tiny family celebrating Sankranthi on the client's giant kite. Scale says 'the biggest celebration'.",
    avoid: [
      "a scale change with no reason",
      "flat lighting that makes the composite look pasted",
      "tiny people so small they read as specks",
    ],
    references: [
      { brand: "Pit Chop Logo", visual: "A peeled banana standing upright like a dancer on yellow", copy: "The Beginning — Just like ideas, great things start simple. #StartFresh", insight: "an everyday object given a human scale role" },
      { brand: "Kolachi Restaurant", visual: "A giant spoon that has scooped a bite out of the red wall", copy: "Food so good you don't need to stop!", insight: "the spoon eats the world" },
      { brand: "Car Academy", visual: "An elephant floating like a balloon on a string", copy: "Photo manipulation with car.", insight: "heavy made weightless" },
      { visual: "A tiny aeroplane and car resting in the palms of giant hands", copy: "Scale down the big picture.", insight: "the world in your hand" },
      { brand: "Fusion", visual: "A tiny old farmer standing on a giant bottle held above fresh produce", copy: "Pure ingredients. Real results.", insight: "the maker dwarfed by the product" },
      { brand: "The Times of India", visual: "A man cycling while carrying a newspaper as big as a billboard", copy: "A Taste of Rajasthan.", insight: "the story is bigger than the carrier" },
      { brand: "Nike", visual: "A person lying on top of a giant tennis ball", copy: "PLAY BIG.", insight: "the ball becomes the world" },
      { brand: "Pringles", visual: "A Pringles can towering over a city skyline seen from a balcony", copy: "Pizza flavour.", insight: "the product as a landmark" },
      { visual: "A tiny figure beside a giant pair of chopsticks on red", copy: "Brilliant art direction.", insight: "one scale gap, nothing else" },
    ],
  },
  {
    id: "visual_exaggeration",
    label: "Visual exaggeration conceptual",
    emoji: "💥",
    keyword: "Ideas that go beyond reality",
    short: "Push the problem or the benefit to an impossible extreme — funny, dramatic, memorable",
    definition:
      "Take the customer's problem or the product's result and push it far past real — a nose blocked by a brick wall, chips forming an ocean wave a surfer rides, a shopkeeper doing the splits across his own shelves because he can't be everywhere. Exaggeration makes the point unforgettable and often funny.",
    mechanism:
      "Say the problem or benefit the way people exaggerate it in conversation ('my nose is totally blocked', 'these chips are an adventure', 'I can't be everywhere at once'), then SHOW that exaggeration literally and photographically. The client's product ends the exaggeration or is the reason for it.",
    recipe: [
      "Write the customer's pain or the product's result as an everyday exaggeration.",
      "Picture it literally at an impossible extreme.",
      "Keep it grounded — real textures, real light — so the impossible looks real.",
      "The client's product sits as the answer (often small, in a corner, sharp).",
      "Headline that lands the joke or the relief.",
    ],
    bestFor: "pharmacies & health, CCTV & security, snacks & food, travel, services that solve a pain, youth brands",
    artDirection:
      "Bold, vivid, surreal-but-photoreal; strong colour; dramatic lighting; expressive human faces where people are involved; punchy headline.",
    festivalFusion:
      "Exaggerate the festival joy the business creates: a kirana store's shelves overflowing into the street for Diwali, a mobile shop's phone screen bursting with fireworks, the whole town shopping in the client's store on Sankranthi. Keep deities respectful — exaggerate the celebration, never the god.",
    avoid: [
      "exaggeration that insults the customer",
      "grotesque or scary images",
      "an exaggeration unrelated to what the client sells",
    ],
    references: [
      { brand: "Otrivin", visual: "A human nose whose nostrils are bricked up with a small wall", copy: "Breathe the block. Fast relief as directed.", insight: "'blocked nose' taken literally" },
      { brand: "NESCAFÉ", visual: "An extreme close-up of an eye propped wide open", copy: "Keeps your eyes wide open. It's more than coffee. It's clarity.", insight: "alertness pushed to the max" },
      { visual: "A shopkeeper in a lungi doing a mid-air split across the shelves of his kirana store", copy: "The shopkeeper can't be everywhere… but our CCTV can.", insight: "the impossible effort the product replaces" },
      { brand: "Lay's", visual: "Potato chips forming a giant ocean wave with a tiny surfer riding it", copy: "The adventure you crave, the flavour you love.", insight: "flavour becomes an adventure" },
      { brand: "Vaseline", visual: "Tiny workers repairing cracked lips", copy: "Heals cracks. Restores smoothness.", insight: "dryness shown as damage needing construction" },
      { brand: "OPPO", visual: "An elephant stepping on a phone", copy: "King of Durability.", insight: "durability tested absurdly" },
    ],
  },
  {
    id: "shadow_metaphor",
    label: "Shadow metaphor",
    emoji: "🌓",
    keyword: "Small shadows, big ideas",
    short: "An object casts a shadow of what it can become — potential, danger, dreams",
    definition:
      "A real object or person casts a shadow that is NOT its own: a small boy casts a graduate, a Coke bottle casts a muscular hero, a pawn casts a king, a cigarette in a hand casts a gun. The shadow reveals the hidden truth — the potential, the ambition, the consequence.",
    mechanism:
      "Put the client's product, tool or customer in a single hard light and let its shadow show what it leads to — the dream it makes possible or the danger it prevents. The object is small and ordinary; the shadow is big and meaningful. The light source is part of the composition.",
    recipe: [
      "Choose the 'becomes' — what the client's product lets someone become or achieve.",
      "Place the ordinary object/person in one strong, directional light against a plain wall or floor.",
      "Cast a crisp shadow shaped like the aspiration or consequence — larger, dramatic, clearly readable.",
      "Leave the rest of the frame calm so the shadow does the talking.",
      "A short aspirational headline ('Small steps create bigger you').",
    ],
    bestFor: "education & coaching, loans & careers, gyms & sports, events & staging, automobiles & service centres, social causes, any brand selling aspiration",
    artDirection:
      "Moody minimal, one strong key light, long crisp shadows on a textured wall, warm or duotone palette, elegant serif or thin sans headline.",
    festivalFusion:
      "The business's objects cast the occasion's hero — exactly like the Udaan Engineers' Day poster, where a spotlight on the company's flight case throws the shadow of an engineer in a hard hat, built from their own truss scaffolding and working crew. A diya from a store casting Lord Rama's silhouette for Dasara, a teacher's pen casting a graduate for Teachers' Day, a doctor's stethoscope casting a heart for Doctors' Day.",
    avoid: [
      "shadows that are hard to read",
      "multiple light sources that blur the shadow",
      "a shadow unrelated to the product's promise",
    ],
    references: [
      { brand: "My Loans & Careers", visual: "A girl sitting against a wall; her shadow is a dancer leaping with ribbons", copy: "#FulfillDesires — dream bigger.", insight: "shadow = the dream the loan funds" },
      { brand: "Coca-Cola", visual: "A small man beside a Coke bottle on red; the bottle casts a muscular hero's shadow", copy: "POTENTIAL in every bottle.", insight: "the product's shadow is your potential" },
      { brand: "Heinz", visual: "A ketchup bottle on red casting the shadow of the Statue of Liberty", copy: "(an American classic)", insight: "iconic status as a shadow" },
      { visual: "A single egg casting the shadow of a chick", copy: "(potential)", insight: "what it will become" },
      { brand: "EduNation", visual: "A small boy reaching up; his shadow is a graduate in a cap", copy: "Your pathway to a brighter tomorrow.", insight: "education's promise as a shadow" },
      { visual: "A chess pawn casting the long shadow of a knight", copy: "Small steps create bigger you.", insight: "growth" },
      { visual: "A hand holding a cigarette that casts the shadow of a gun", copy: "Choices cast consequences.", insight: "the hidden danger" },
      { brand: "SMM Studio", visual: "A small rabbit casting the shadow of a leaping big cat", copy: "Visibility is key in the digital age!", insight: "look bigger online" },
      { visual: "Many pawns together casting one king's shadow", copy: "Unity creates strength.", insight: "the team becomes the leader" },
      { brand: "Mercedes-Benz", visual: "A pair of pliers casting the shadow of a crocodile's jaws", copy: "Unofficial service can be dangerous.", insight: "the risk of the wrong service" },
      { visual: "A black cat on yellow casting a lion's shadow", copy: "A small mind sees limited horizons. A bright mind sees bigger possibilities.", insight: "self-belief" },
    ],
  },
  {
    id: "material_metaphor",
    label: "Material-based metaphor",
    emoji: "🧵",
    keyword: "Ideas that feel the real world",
    short: "One material becomes another — pasta forks, a lemon mouse, a pencil erasing a path",
    definition:
      "The idea is carried by MATERIAL and texture: an object is built from the product's own material (a fork made of pasta, a computer mouse made of lemon), or a tool acts on the world as if the world were its material (an eraser erasing a road, a colander filtering people). The viewer can almost touch the metaphor.",
    mechanism:
      "Take the client's material or product substance (silk, steel, wood, rice, gold, glass, pasta, fabric, cement) and rebuild an everyday or symbolic object out of it — or let the client's tool work on something unexpected as if it were its material. Hyper-real texture is everything: the viewer must feel the material.",
    recipe: [
      "Identify the client's signature material, ingredient or tool.",
      "Pick an object or symbol that carries the message, and rebuild it from that material (or let the tool act on it).",
      "Photograph it in macro-level detail with tactile light so the texture sells the idea.",
      "Plain, colour-matched background; the object centred.",
      "A short headline that names the feeling of the material.",
    ],
    bestFor: "food & restaurants, textiles & sarees, furniture & woodwork, construction materials, jewellery, handicrafts, events & decor, anything with a tangible product",
    artDirection:
      "Macro product photography, tactile side light, rich texture, clean colour field background, confident modern type.",
    festivalFusion:
      "Build the festival's symbol from the business's material — like the Udaan Vinayaka Chavithi poster: a giant Lord Ganesha face constructed from the company's own stage truss, moving-head lights and flowing drapes (the ears are lit truss arches with fabric, the trunk a sculpted panel), their crew in branded black tees rigging it at sunset, Mooshika sitting before it holding a red flower, temple gopurams and diyas around. A textile store's silk folded into a lotus, a jeweller's gold chains forming Lakshmi's footprints, a bakery's dough shaped as a Christmas tree.",
    avoid: [
      "flat, texture-less rendering",
      "a material the client doesn't actually use",
      "mixing too many materials",
    ],
    references: [
      { visual: "A red pencil eraser rubbing out a winding path that tiny people walk along", copy: "Some paths are meant to be erased to find a better one.", insight: "the tool edits the world" },
      { visual: "A raw prawn looking into a mirror and seeing a golden fried tempura prawn", copy: "From waves to wow.", insight: "material transformation promised" },
      { brand: "SEED", visual: "A leather shoe hanging from a hook, its sole melting like soft rubber", copy: "Too painful to move forward? Sometimes letting go is the best step ahead.", insight: "material shows the pain" },
      { brand: "Nike", visual: "A tortoise wearing Nike running shoes crossing the finish line ahead of a rabbit on a track marked WINNER", copy: "COMFORT runs in you. Any pace, any path — just move.", insight: "the product changes the fable" },
      { brand: "Barilla", visual: "Four blue panels: a fork made of spaghetti, fusilli, penne, with tiny people", copy: "Barilla", insight: "the utensil made of the product" },
      { brand: "TGSmart", visual: "Chat bubbles over a car's rear-view mirror reflecting a driver's worried eyes", copy: "Shut-up and Drive.", insight: "the phone's material invades the road" },
      { visual: "A woman trapped inside a clear plastic bag full of social media icons", copy: "BORING CONTENT KILLS ATTENTION. AI-powered creatives built to make brands impossible to ignore.", insight: "the bag = suffocating content" },
      { visual: "A computer mouse made from half a lemon", copy: "(fresh ideas)", insight: "fresh material, familiar object" },
      { brand: "Moore Media", visual: "A colander straining tiny red people", copy: "Filtering clients is part of growth.", insight: "kitchen tool as process" },
    ],
  },
];

/**
 * The team's own festival posters — the three ways an occasion is fused with a client's business.
 * The concept prompt shows these whenever an occasion is set, whatever style was picked.
 */
export const FESTIVAL_REFERENCES: (PosterReference & { pattern: string })[] = [
  {
    pattern: "CONSTRUCTED FROM THE TRADE — the festival icon built out of the business's own tools and materials",
    brand: "Udaan Events & Creations (events & staging) — Vinayaka Chavithi",
    visual:
      "At golden-hour sunset by a temple lake, a monumental Lord Ganesha face stands built entirely from the company's own event gear: two giant lit stage-truss arches draped with cream fabric form the ears, a crown of truss and moving-head lights sits on top, a smooth sculpted panel forms the face and trunk with glowing tilak lines. Crew members in black Udaan-branded T-shirts rig it from ladders and flight cases. Mooshika sits small in the centre foreground offering a red flower. Temple gopurams and palms in the haze, brass diyas and marigolds in the foreground. Gold logo top-left.",
    copy: "HAPPY VINAYAKA CHAVITHI — Big moments | Beautiful celebrations | Together always · Creating celebrations that bring people together",
    insight: "the deity is made of what the client does — the greeting IS a portfolio piece",
  },
  {
    pattern: "THE FESTIVAL AS YOUR CUSTOMER — the festival's beloved character enjoying the business inside its real premises",
    brand: "Dhanalakshmi Wholesale Shopping Mall (sarees & family shopping) — Vinayaka Chavithi",
    visual:
      "Inside the client's bright mall with shelves of folded sarees, an adorable, devotional-cute baby Ganesha in a gold crown and cream dhoti walks forward winking and raising a blessing hand, carrying the mall's own branded shopping bags; beside him Mooshika in a tiny crown carries a stack of colourful silk sarees. Banana leaves and marigold garlands frame the left; a brass lamp glows on the right; a small sign reads SAREES · DRESSES · FAMILY SHOPPING. Logo top-right in Telugu with its tagline ribbon.",
    // The client's real number and address are deliberately NOT reproduced here: anything in this
    // file reaches every poster prompt, and a reference's phone number is exactly the kind of
    // detail a model copies onto the next client's poster.
    copy: "Happy Vinayaka Chavithi · the business's own phone number and address in one clean bottom strip",
    insight: "the god shops at the client's store — blessing and endorsement in one image",
  },
  {
    pattern: "THE DAY'S HERO IN SHADOW — the business's own objects cast the silhouette of the occasion's hero",
    brand: "Udaan Events & Creations — Engineers' Day",
    visual:
      "A moving-head spotlight on a branded flight case throws warm light across a wall; on it, the giant silhouette of an engineer's head in a hard hat, formed by stage scaffolding and truss with tiny crew members working on it. Foreground: an event hall with dressed tables, a white hard hat, blueprints and a measuring tape. Gold logo top-left.",
    copy: "HAPPY ENGINEERS DAY — To the minds that build a better tomorrow.",
    insight: "the day honoured with the client's own craft, told through shadow",
  },
];

const STYLE_BY_ID: Record<string, PosterStyle> = Object.fromEntries(POSTER_STYLES.map((s) => [s.id, s]));

/** The style for an id, or null for "best fit" / unknown. */
export function getPosterStyle(id?: string | null): PosterStyle | null {
  if (!id) return null;
  return STYLE_BY_ID[id] ?? null;
}

/** "🌓 Shadow metaphor" — or "✨ Best fit (AI picks)" for auto. */
export function posterStyleLabel(id?: string | null): string {
  const s = getPosterStyle(id);
  return s ? `${s.emoji} ${s.label}` : "✨ Best fit (AI picks the style)";
}

/** Options for a picker, best fit first. */
export function posterStyleOptions(): { id: string; label: string; emoji: string; short: string; keyword: string }[] {
  return [
    { id: AUTO_POSTER_STYLE, label: "Best fit", emoji: "✨", short: "The AI reads the business and picks the strongest style for each concept", keyword: "The right idea for this client" },
    ...POSTER_STYLES.map(({ id, label, emoji, short, keyword }) => ({ id, label, emoji, short, keyword })),
  ];
}
