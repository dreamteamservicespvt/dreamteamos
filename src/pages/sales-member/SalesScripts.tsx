import { useState, useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/services/firebase";
import { FESTIVALS, getUpcomingFestivalName, getFestivalOptionLabel, findFestival, formatFestivalDate } from "@/utils/festivals";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  Phone,
  MessageSquare,
  IndianRupee,
  AlertCircle,
  Globe,
  Film,
  Megaphone,
  PartyPopper,
  TrendingUp,
  Share2,
  Monitor,
  Gift,
  HelpCircle,
  CheckCircle2,
  ArrowRight,
  Palette,
  MapPin,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";

/* ─────────────── helpers ─────────────── */
function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  return "evening";
}



/* ─────────────── types ─────────────── */
interface ScriptSection {
  title: string;
  icon: any;
  content: React.ReactNode;
}

interface ScriptTab {
  id: string;
  label: string;
  icon: any;
  color: string;
  sections: ScriptSection[];
}

/* ─────────────── reusable atoms ─────────────── */
function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 bg-primary/10 border border-primary/20 rounded-lg px-3 py-2 my-2 text-xs text-primary">
      <AlertCircle size={14} className="shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}

function Line({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-foreground leading-relaxed my-1.5">{children}</p>;
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mt-4 mb-1">{children}</p>;
}

function PriceRow({ duration, promo, cinematic }: { duration: string; promo: number; cinematic: number }) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-2 px-3 text-sm text-foreground">{duration}</td>
      <td className="py-2 px-3 text-sm text-foreground font-semibold">₹{promo.toLocaleString("en-IN")}</td>
      <td className="py-2 px-3 text-sm text-foreground font-semibold">₹{cinematic.toLocaleString("en-IN")}</td>
    </tr>
  );
}

function PriceTable({ rows, headers }: { rows: React.ReactNode; headers: string[] }) {
  return (
    <div className="overflow-x-auto my-3">
      <table className="w-full text-left border border-border rounded-lg overflow-hidden">
        <thead className="bg-accent">
          <tr>
            {headers.map((h) => (
              <th key={h} className="py-2 px-3 text-xs font-semibold text-muted-foreground">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
  );
}

/* ─────────────── shared FAQ sections ─────────────── */
function DiscountFAQ() {
  return (
    <>
      <Label>1. Client Discount Aduguthey (First Video)</Label>
      <div className="bg-card border border-border rounded-lg p-3 space-y-2">
        <Line>
          "Sir, first video ki chala work untundi sir… concept, script, design, editing anni scratch nunchi create cheyali."
        </Line>
        <Line>"Anduke first video lo discount ivvadam kastam sir."</Line>
        <Line>
          "But next video nunchi memu <strong>10% discount</strong> istham 👍"
        </Line>
        <Line>
          "Alage sir… meeru mee friends ki recommend chesthe mee nunchi vachina prathi referral ki kuda{" "}
          <strong>10% discount</strong> istham sir."
        </Line>
      </div>
    </>
  );
}

function FraudFAQ() {
  return (
    <>
      <Label>2. "Mimmalni nammadam ela? Fraud ayithe?"</Label>
      <div className="bg-card border border-border rounded-lg p-3 space-y-2">
        <Line>
          "Meeru payment chesetappudu kuda maa company name <strong>'Dream Team'</strong> ani vastundi sir."
        </Line>
        <Line>
          "Manadi software company sir. Maaku <strong>two branches</strong> unnayi — okati Hyderabad ECIL lo undi,
          inkoti Andhra Pradesh Kakinada lo undi."
        </Line>
        <Line>"Meeku video nachakapothe full payment refund chesestam."</Line>
      </div>
    </>
  );
}

function ProcessFAQ() {
  return (
    <>
      <Label>3. "Process enti? Eppudu istaru?"</Label>
      <div className="bg-card border border-border rounded-lg p-3 space-y-2">
        <Line>
          "Maaku mee daggaranunchi kavalsindi mee <strong>logo, visiting card</strong> sir."
        </Line>
        <Line>
          "Maa company tharapununchi meeru select chusukuna package details and maa company QR pampistamu."
        </Line>
        <Line>
          "Meeru payment chesadapudu ma company name <strong>DREAM TEAM</strong> ani vasthundhi. Onces payment chesi
          screenshot petha nenu ma team ki forward chesthanu — vallu immediately ga mee work cheyidam start chestharu
          sir."
        </Line>
        <Line>
          "Video manaki within <strong>1 day</strong> lo delivery avuthundi."
        </Line>
      </div>

      <Label>4. "Maa daggara logo ledu, visiting card ledu"</Label>
      <div className="bg-card border border-border rounded-lg p-3 space-y-2">
        <Line>
          "Sir, logo lekapoyithe no problem — memu kuda <strong>Logo Design</strong> chestamu sir! Maa daggara{" "}
          <strong>Standard Logo ₹499</strong> mariyu <strong>Premium Logo ₹999</strong> unnayi sir. Logo unte mee video
          inka professional ga vasthundi sir."
        </Line>
        <Line>
          "Meeru logo cheyinchukovali ante cheppandi sir — memu mee business ki matching professional logo create
          chestamu. Lekapoyithe, meeru maa WhatsApp ki mee <strong>business name, business phone number, mariyu
          business address</strong> pampinchandi."
        </Line>
        <Line>
          "Alage, mee business lo meeru em chestharu ani maaku oka voice message kani, leda text message kani pampandi
          sir. Idi maa team ki video script ready cheyadaniki use avuthundi sir."
        </Line>
      </div>
    </>
  );
}

function VideoPreviewFAQ() {
  return (
    <>
      <Label>5. "Video ela untundo mundu ela telustundi?"</Label>
      <div className="bg-card border border-border rounded-lg p-3 space-y-2">
        <Line>
          "Work start chesina tharvatha model ela vastundi, model em matladuthundi (script), kinda mee address ela
          kanapaduthundi — ee moodu meeku pampistaru sir."
        </Line>
        <Line>"Mee approval teesukunna tharvatha video create chesi pampistham sir."</Line>
        <Line>"Video create chesaka kuda mistakes emaina unte correct chestaram sir."</Line>
      </div>
    </>
  );
}

function OtherServicesFAQ() {
  return (
    <>
      <Label>6. "Meeru inka em services istharu?"</Label>
      <div className="bg-card border border-border rounded-lg p-3 space-y-2">
        <Line>
          "Memu Instagram mariyu Facebook lo digital marketing ads run chestamu sir. Idi kakunda, website development,
          logo design, mariyu <strong>Google Business Listing</strong> kooda chesthamu sir. Mee business Google lo search
          chesthe kanipinchela chestamu sir."
        </Line>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════
   SCRIPT DATA — 9 TABS
   ═══════════════════════════════════════════════════════ */

function buildTabs(greeting: string, userName: string, festivalName: string): ScriptTab[] {
  const g = greeting; // "morning" | "afternoon" | "evening"
  const n = userName;
  const f = festivalName;

  return [
    /* ──────── 1. FESTIVAL WISHES ──────── */
    {
      id: "festival",
      label: "Festival Wishes",
      icon: PartyPopper,
      color: "text-yellow-500",
      sections: [
        {
          title: "1. Introduction & Checking Samples",
          icon: Phone,
          content: (
            <>
              <Line>
                "Hello sir, good {g}. Naa peru <strong>{n}</strong>, nenu Dream Team
                Services nunchi matladuthunnanu. Meeru maa <strong>{f}</strong> wishes video
                gurinchi enquiry pettaru kada, dhanigurinchi call chesam. Memu samples pampincham chusara sir?"
              </Line>

              <Label>IF THEY SAY "NO" (Haven't seen samples)</Label>
              <Line>
                "Okay sir, no problem. Nenu meeku WhatsApp lo 'Hi sir' ani pampisthananu. Meeru oka 2 minutes avi
                chudandi, nenu meeku 5–10 minutes lo call chestanu sir. Ledha samples chusi meera call cheyidani."
              </Line>
              <Tip>Action: Cut the call → Send samples on WhatsApp → Call back after 5 minutes</Tip>
            </>
          ),
        },
        {
          title: "2. Main Pitch (If they saw samples)",
          icon: Megaphone,
          content: (
            <>
              <Line>
                "Sir, ippudu entante maa daggara <strong>two packages</strong> unnayi sir. Okati 'Only {f}{" "}
                wishes', Inkokati '{f} wishes along with business promotion ad'."
              </Line>

              <Label>Explaining ₹499 Package (20 sec)</Label>
              <Line>
                "First package — Only {f} wishes lo manaki <strong>20 seconds video</strong>{" "}
                vasthundhi. Dentlo mee business tharapununchi mee customers ki festival wishes cheppi 10 seconds
                vasthundhi, tharvatha next 5 seconds mee business gurinchi short info vasthudhi, and last lo festival
                theme video mee branding tho vastundi. Idi manaki 20 seconds vastundi — <strong>package ₹499</strong>{" "}
                sir."
              </Line>

              <Label>Explaining ₹999 Package (40 sec)</Label>
              <Line>
                "Idaa kakunda… Evaraithe ee {f} ki wishes tho patu valla business ni kuda promote
                chesukundam anukuntunnaro, valla kosam pettinde '{f} wishes along with business
                promotion ad' sir. Idi <strong>40 seconds</strong> sir. Deentlo mee business tharapununchi mee customers
                ki wishes cheppina tharvatha, mee business enti, meeru provide chese services enti, mee products enti,
                mee offers enti, mee address ekkada, mimmalni ela sampradinchali — idantha kuda e video lo convey
                avuthundi sir. Idi manaki 40 seconds vastundi — <strong>package ₹999</strong> sir."
              </Line>

              <PriceTable
                headers={["Package", "Duration", "Price"]}
                rows={
                  <>
                    <tr className="border-b border-border">
                      <td className="py-2 px-3 text-sm">Only Wishes</td>
                      <td className="py-2 px-3 text-sm">20 sec</td>
                      <td className="py-2 px-3 text-sm font-semibold">₹499</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 text-sm">Wishes + Business Promotion</td>
                      <td className="py-2 px-3 text-sm">40 sec</td>
                      <td className="py-2 px-3 text-sm font-semibold">₹999</td>
                    </tr>
                  </>
                }
              />
            </>
          ),
        },
        {
          title: "3. Closing",
          icon: CheckCircle2,
          content: (
            <Line>
              "Cheppandi sir mee business ki em cheyamantaru? Only {f} wishes cheyamantara leda{" "}
              {f} wishes along with business promotion cheyamantara?"
            </Line>
          ),
        },
        {
          title: "4. After Package Selection",
          icon: IndianRupee,
          content: (
            <>
              <ProcessFAQ />
            </>
          ),
        },
        {
          title: "5. Objection Handling & FAQs",
          icon: HelpCircle,
          content: (
            <>
              <DiscountFAQ />
              <FraudFAQ />
              <VideoPreviewFAQ />
              <OtherServicesFAQ />
            </>
          ),
        },
      ],
    },

    /* ──────── 2. FOLLOW-UP UPSELL ──────── */
    {
      id: "followup",
      label: "Follow-up Upsell",
      icon: TrendingUp,
      color: "text-emerald-500",
      sections: [
        {
          title: "1. Introduction (Existing Client Follow-up)",
          icon: Phone,
          content: (
            <>
              <Line>
                "Hello sir, good {g}. Naa peru <strong>{n}</strong>, nenu Dream Team
                Services nunchi matladuthunnanu. Meeru maa daggaranunchi {f} wishes video
                cheyinchukunnaru kada sir — video baaga vachinda sir?"
              </Line>
              <Tip>
                Wait for response. If positive → proceed. If any issue → resolve first, then pitch.
              </Tip>
            </>
          ),
        },
        {
          title: "2. Main Pitch — Promotional / Cinematic Ad + Digital Marketing",
          icon: Megaphone,
          content: (
            <>
              <Line>
                "Sir, meeru already maa work chusaru kada, quality ela untundo telsu. Ippudu memu meeku inka manchi offer
                cheppali anukuntunnamu sir."
              </Line>

              <Label>Pitch: Promotional Ad</Label>
              <Line>
                "Sir, mee business ni regular ga promote chesukodaniki maa daggara <strong>Promotional Ads</strong>{" "}
                unnayi sir. Ivi festivals tho sambandam lekunda — mee business products, services, offers gurinchi
                professional video ad create chestamu. Idi mee customers ki WhatsApp lo, social media lo share cheyyochu
                sir."
              </Line>

              <PriceTable
                headers={["Duration", "Price (+ Poster)"]}
                rows={
                  <>
                    <tr className="border-b border-border">
                      <td className="py-2 px-3 text-sm">15 sec + Poster</td>
                      <td className="py-2 px-3 text-sm font-semibold">₹499</td>
                    </tr>
                    <tr className="border-b border-border">
                      <td className="py-2 px-3 text-sm">30 sec + Poster</td>
                      <td className="py-2 px-3 text-sm font-semibold">₹999</td>
                    </tr>
                    <tr className="border-b border-border">
                      <td className="py-2 px-3 text-sm">45 sec + Poster</td>
                      <td className="py-2 px-3 text-sm font-semibold">₹1,499</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 text-sm">1 min + Poster</td>
                      <td className="py-2 px-3 text-sm font-semibold">₹1,999</td>
                    </tr>
                  </>
                }
              />

              <Label>Pitch: Cinematic Ad (Premium)</Label>
              <Line>
                "Sir, idi kakunda maa daggara <strong>Cinematic Ads</strong> kuda unnayi — ivi high-quality, movie-style
                ads sir. Mee business ki premium feel kavali ante, mee brand ni next level ki teesukupovali ante
                cinematic ad perfect sir."
              </Line>

              <PriceTable
                headers={["Duration", "Price (+ Poster)"]}
                rows={
                  <>
                    <tr className="border-b border-border">
                      <td className="py-2 px-3 text-sm">15 sec + Poster</td>
                      <td className="py-2 px-3 text-sm font-semibold">₹999</td>
                    </tr>
                    <tr className="border-b border-border">
                      <td className="py-2 px-3 text-sm">30 sec + Poster</td>
                      <td className="py-2 px-3 text-sm font-semibold">₹1,999</td>
                    </tr>
                    <tr className="border-b border-border">
                      <td className="py-2 px-3 text-sm">45 sec + Poster</td>
                      <td className="py-2 px-3 text-sm font-semibold">₹2,999</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 text-sm">1 min + Poster</td>
                      <td className="py-2 px-3 text-sm font-semibold">₹3,999</td>
                    </tr>
                  </>
                }
              />

              <Label>Pitch: Digital Marketing — Single Campaign Package</Label>
              <Line>
                "Sir, alage mee business ki Instagram, Facebook lo ads run cheyinchukovali ante maa daggara{" "}
                <strong>Digital Marketing Single Campaign Package</strong> undi sir. Deentlo memu mee Meta ad account
                create chestamu, mee Instagram, Facebook Business Page, WhatsApp Business anni connect chesi setup
                chestamu (₹999) mariyu oka campaign run chestamu (₹999) — total <strong>₹2,000</strong> sir.
                Meeru already maa daggara video cheyinchukunnaru kada sir, aa video ne ad lo use chesi mee local area lo
                mee target customers ki reach chestamu sir."
              </Line>
              <Tip>
                Existing client ki video already undi — so digital marketing pitch easy: "Mee video ne ad lo use
                chestamu sir" ani connect cheyandi.
              </Tip>

              <Label>Pitch: Logo Design</Label>
              <Line>
                "Sir, mee daggara professional logo unda sir? Logo lekapoyithe memu design chestamu sir — <strong>Standard
                Logo ₹499</strong>, <strong>Premium Logo ₹999</strong>. Professional logo unte mee brand ki identity
                vasthundi, mee ads, website, visiting cards — anni lo use cheyyochu sir."
              </Line>

              <Label>Pitch: Google Business Listing</Label>
              <Line>
                "Sir, mee business Google lo search chesthe kanipistunda sir? Lekapoyithe <strong>Google Business
                Listing</strong> cheyinchukovali sir. Memu mee business ni Google Maps lo, Google Search lo kanipinchela
                setup chestamu — <strong>₹999</strong> one-time setup sir. Customers mee business search chesthe mee
                address, phone number, photos, reviews anni kanipistay sir."
              </Line>
            </>
          ),
        },
        {
          title: "3. Closing",
          icon: CheckCircle2,
          content: (
            <>
              <Line>
                "Cheppandi sir — meeru Promotional Ad cheyinchukuntara, Cinematic Ad cheyinchukuntara? Ledhante mee
                existing video ne digital marketing lo run cheyamantara?"
              </Line>
              <Line>"Meeru rendu kuda combine cheskovali ante — Ad + Digital Marketing — memu chesestam sir."</Line>
              <Line>
                "Logo ledhante Google Listing kuda kavali ante cheppandi sir — memu anni oka daggare chesthamu."
              </Line>
            </>
          ),
        },
        {
          title: "4. After Package Selection",
          icon: IndianRupee,
          content: <ProcessFAQ />,
        },
        {
          title: "5. Objection Handling & FAQs",
          icon: HelpCircle,
          content: (
            <>
              <DiscountFAQ />
              <FraudFAQ />
              <VideoPreviewFAQ />
            </>
          ),
        },
      ],
    },

    /* ──────── 3. PROMOTIONAL AD (Direct Lead) ──────── */
    {
      id: "promotional",
      label: "Promotional Ad",
      icon: Megaphone,
      color: "text-blue-500",
      sections: [
        {
          title: "1. Introduction & Checking Samples",
          icon: Phone,
          content: (
            <>
              <Line>
                "Hello sir, good {g}. Naa peru <strong>{n}</strong>, nenu Dream Team
                Services nunchi matladuthunnanu. Meeru maa Promotional Video Ad gurinchi enquiry pettaru kada sir,
                dhanigurinchi call chesam. Memu samples pampincham chusara sir?"
              </Line>

              <Label>IF THEY SAY "NO" (Haven't seen samples)</Label>
              <Line>
                "Okay sir, no problem. Nenu meeku WhatsApp lo promotional ad samples pampisthananu. Meeru oka 2 minutes
                avi chudandi, nenu meeku 5–10 minutes lo call chestanu sir."
              </Line>
              <Tip>Action: Cut the call → Send promotional ad samples on WhatsApp → Call back after 5 minutes</Tip>
            </>
          ),
        },
        {
          title: "2. Main Pitch (Promotional Ad Packages)",
          icon: Megaphone,
          content: (
            <>
              <Line>
                "Sir, maa daggara Promotional Ads lo <strong>4 packages</strong> unnayi sir — anni packages lo poster
                kuda free ga vasthundi."
              </Line>

              <Label>15 Seconds — ₹499</Label>
              <Line>
                "First package — <strong>15 seconds promotional video + poster</strong>. Deentlo mee business name, mee
                key products or services, and mee contact details — anni short ga cover avuthundi sir. WhatsApp status
                lo, Instagram reels lo share cheyyodaniki perfect sir. Idi <strong>₹499</strong> sir."
              </Line>

              <Label>30 Seconds — ₹999</Label>
              <Line>
                "Second package — <strong>30 seconds + poster</strong>. Deentlo mee business introduction, services, key
                offers, mee address and phone number — anni detail ga vasthundi sir. Idi <strong>₹999</strong> sir."
              </Line>

              <Label>45 Seconds — ₹1,499</Label>
              <Line>
                "Third package — <strong>45 seconds + poster</strong>. Idi perfect sir evaraithe full ga valla business
                story cheppukovali, multiple services highlight cheyali antaro valla kosam. Idi <strong>₹1,499</strong>{" "}
                sir."
              </Line>

              <Label>1 Minute — ₹1,999</Label>
              <Line>
                "Fourth package — <strong>1 minute + poster</strong>. Idi maa premium promotional ad sir. Complete
                business profile — mee story, services, products, customer testimonials feel, offers, address, contact —
                everything cover avuthundi sir. Idi <strong>₹1,999</strong> sir."
              </Line>

              <PriceTable
                headers={["Duration", "Includes", "Price"]}
                rows={
                  <>
                    <tr className="border-b border-border">
                      <td className="py-2 px-3 text-sm">15 sec</td>
                      <td className="py-2 px-3 text-sm">Video + Poster</td>
                      <td className="py-2 px-3 text-sm font-semibold">₹499</td>
                    </tr>
                    <tr className="border-b border-border">
                      <td className="py-2 px-3 text-sm">30 sec</td>
                      <td className="py-2 px-3 text-sm">Video + Poster</td>
                      <td className="py-2 px-3 text-sm font-semibold">₹999</td>
                    </tr>
                    <tr className="border-b border-border">
                      <td className="py-2 px-3 text-sm">45 sec</td>
                      <td className="py-2 px-3 text-sm">Video + Poster</td>
                      <td className="py-2 px-3 text-sm font-semibold">₹1,499</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 text-sm">1 min</td>
                      <td className="py-2 px-3 text-sm">Video + Poster</td>
                      <td className="py-2 px-3 text-sm font-semibold">₹1,999</td>
                    </tr>
                  </>
                }
              />
            </>
          ),
        },
        {
          title: "3. Closing",
          icon: CheckCircle2,
          content: (
            <Line>
              "Cheppandi sir mee business ki entha seconds promotional ad cheyamantaru? 15 seconds, 30 seconds, 45
              seconds, ledha 1 minute?"
            </Line>
          ),
        },
        {
          title: "4. After Package Selection",
          icon: IndianRupee,
          content: <ProcessFAQ />,
        },
        {
          title: "5. Follow-up: Pitch Digital Marketing",
          icon: ArrowRight,
          content: (
            <>
              <Tip>
                After delivering the promotional video, call the client to pitch Digital Marketing so their video reaches
                more people.
              </Tip>
              <Line>
                "Sir, mee promotional video ready ayyindi kada — chala baaga vachindi. Ippudu idi meeru WhatsApp lo
                pettukunte mee existing contacts ki reach avuthundi. Kaani sir, new customers reach cheyyali ante
                Instagram, Facebook lo ads run cheyyali sir."
              </Line>
              <Line>
                "Maa daggara <strong>Digital Marketing Single Campaign Package</strong> undi sir — ₹2,000 lo mee social
                media pages setup + oka campaign run chestamu. Mee ee promotional video ne ad ga use chesestamu sir."
              </Line>
              <Line>"Meeru interested unte ippude start chestamu sir, mee video fresh ga unnapude reach ekkuva sir."</Line>
            </>
          ),
        },
        {
          title: "6. Objection Handling & FAQs",
          icon: HelpCircle,
          content: (
            <>
              <DiscountFAQ />
              <FraudFAQ />
              <VideoPreviewFAQ />
              <OtherServicesFAQ />
            </>
          ),
        },
      ],
    },

    /* ──────── 4. CINEMATIC AD (Direct Lead) ──────── */
    {
      id: "cinematic",
      label: "Cinematic Ad",
      icon: Film,
      color: "text-purple-500",
      sections: [
        {
          title: "1. Introduction & Checking Samples",
          icon: Phone,
          content: (
            <>
              <Line>
                "Hello sir, good {g}. Naa peru <strong>{n}</strong>, nenu Dream Team
                Services nunchi matladuthunnanu. Meeru maa Cinematic Ad gurinchi enquiry pettaru kada sir, dhanigurinchi
                call chesam. Memu samples pampincham chusara sir?"
              </Line>

              <Label>IF THEY SAY "NO"</Label>
              <Line>
                "Okay sir, no problem. Nenu meeku WhatsApp lo cinematic ad samples pampisthananu. Meeru oka 2 minutes
                avi chudandi, nenu meeku 5–10 minutes lo call chestanu sir."
              </Line>
              <Tip>Action: Cut the call → Send cinematic ad samples on WhatsApp → Call back after 5 minutes</Tip>
            </>
          ),
        },
        {
          title: "2. Main Pitch (Cinematic Ad Packages)",
          icon: Film,
          content: (
            <>
              <Line>
                "Sir, maa Cinematic Ads antey normal promotional ads kanna chala different sir — ivi{" "}
                <strong>movie-quality, high-end production feel</strong> tho vasthay sir. Mee brand ki premium, luxury
                feel kavali ante cinematic ad best choice sir."
              </Line>
              <Line>
                "Maa daggara <strong>4 packages</strong> unnayi sir — anni packages lo poster kuda free ga vasthundi."
              </Line>

              <Label>15 Seconds — ₹999</Label>
              <Line>
                "First package — <strong>15 seconds cinematic video + poster</strong>. Short but powerful sir — idi quick
                brand impact kosam perfect. Instagram reels, WhatsApp status lo share cheyyochu sir. Idi{" "}
                <strong>₹999</strong> sir."
              </Line>

              <Label>30 Seconds — ₹1,999</Label>
              <Line>
                "Second package — <strong>30 seconds + poster</strong>. Deentlo mee brand story, mee services highlight
                — cinematic transitions, professional voiceover tho vasthundi sir. Idi <strong>₹1,999</strong> sir."
              </Line>

              <Label>45 Seconds — ₹2,999</Label>
              <Line>
                "Third package — <strong>45 seconds + poster</strong>. Full brand story telling sir — multiple scenes,
                detailed service showcase, premium visuals. Idi <strong>₹2,999</strong> sir."
              </Line>

              <Label>1 Minute — ₹3,999</Label>
              <Line>
                "Fourth package — <strong>1 minute + poster</strong>. Idi maa top-tier cinematic ad sir. Complete brand
                film — mee business journey, services, customer impact, offers, contact — everything cinema-quality lo
                create chestamu sir. Idi <strong>₹3,999</strong> sir."
              </Line>

              <PriceTable
                headers={["Duration", "Includes", "Price"]}
                rows={
                  <>
                    <tr className="border-b border-border">
                      <td className="py-2 px-3 text-sm">15 sec</td>
                      <td className="py-2 px-3 text-sm">Video + Poster</td>
                      <td className="py-2 px-3 text-sm font-semibold">₹999</td>
                    </tr>
                    <tr className="border-b border-border">
                      <td className="py-2 px-3 text-sm">30 sec</td>
                      <td className="py-2 px-3 text-sm">Video + Poster</td>
                      <td className="py-2 px-3 text-sm font-semibold">₹1,999</td>
                    </tr>
                    <tr className="border-b border-border">
                      <td className="py-2 px-3 text-sm">45 sec</td>
                      <td className="py-2 px-3 text-sm">Video + Poster</td>
                      <td className="py-2 px-3 text-sm font-semibold">₹2,999</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 text-sm">1 min</td>
                      <td className="py-2 px-3 text-sm">Video + Poster</td>
                      <td className="py-2 px-3 text-sm font-semibold">₹3,999</td>
                    </tr>
                  </>
                }
              />

              <Tip>
                Promotional vs Cinematic difference explain cheyyandi: "Promotional — clean and informative. Cinematic —
                movie-feel, premium, high-end." Client ki budget ekkuva unte cinematic recommend cheyyandi.
              </Tip>
            </>
          ),
        },
        {
          title: "3. Closing",
          icon: CheckCircle2,
          content: (
            <Line>
              "Cheppandi sir mee business ki entha seconds cinematic ad cheyamantaru? 15 seconds, 30 seconds, 45
              seconds, ledha 1 minute?"
            </Line>
          ),
        },
        {
          title: "4. After Package Selection",
          icon: IndianRupee,
          content: <ProcessFAQ />,
        },
        {
          title: "5. Follow-up: Pitch Digital Marketing",
          icon: ArrowRight,
          content: (
            <>
              <Tip>
                After delivering the cinematic video, follow up to pitch Digital Marketing.
              </Tip>
              <Line>
                "Sir, mee cinematic ad chala baaga vachindi — idi WhatsApp lo pettadame kadu sir, idi Instagram, Facebook
                lo ad ga run chesthe mee business ki chala enquiries vasthay sir."
              </Line>
              <Line>
                "Maa daggara <strong>Digital Marketing Single Campaign Package</strong> undi — ₹2,000 lo mee social
                media setup + oka campaign run chestamu. Mee ee cinematic video ne ad lo use chesestamu sir."
              </Line>
              <Line>"Cinematic video quality undi kada sir — idi ad lo run chesthe result definite sir."</Line>
            </>
          ),
        },
        {
          title: "6. Objection Handling & FAQs",
          icon: HelpCircle,
          content: (
            <>
              <DiscountFAQ />
              <FraudFAQ />
              <VideoPreviewFAQ />
              <OtherServicesFAQ />
            </>
          ),
        },
      ],
    },

    /* ──────── 5. DIGITAL MARKETING — SINGLE CAMPAIGN ──────── */
    {
      id: "digital_marketing",
      label: "Digital Marketing",
      icon: Share2,
      color: "text-pink-500",
      sections: [
        {
          title: "1. Introduction",
          icon: Phone,
          content: (
            <>
              <Line>
                "Hello sir, good {g}. Naa peru <strong>{n}</strong>, nenu Dream Team
                Services nunchi matladuthunnanu. Meeru maa Digital Marketing services gurinchi enquiry pettaru kada sir,
                dhanigurinchi call chesam sir."
              </Line>
              <Line>
                "Sir, mee business Instagram, Facebook lo unda sir? Meeru currently social media lo edhaina marketing
                chesthunnara sir?"
              </Line>
              <Tip>
                Client social media presence understand cheyyandi first — pages unnaya, content post chesthunnara,
                already ads run chesthunnara ani.
              </Tip>
            </>
          ),
        },
        {
          title: "2. Main Pitch (Single Campaign Package — ₹2,000)",
          icon: Megaphone,
          content: (
            <>
              <Line>
                "Sir, maa daggara <strong>Digital Marketing Single Campaign Package</strong> undi sir. Deentlo rendu
                things vasthay:"
              </Line>

              <Label>1. Social Media Setup — ₹999</Label>
              <Line>
                "Memu mee kosam <strong>Meta Ad Account</strong> create chestamu sir. Mee Instagram Business Page,
                Facebook Business Page already lekapoyithe create chestamu, and <strong>WhatsApp Business</strong> kuda
                setup chestamu sir. Ee anni accounts ni Meta Ad Account lo connect chesi, professional ga everything
                setup chestamu sir — profile, cover design, business details, contact info anni."
              </Line>

              <Label>2. Campaign Management — ₹999</Label>
              <Line>
                "Tharvatha mee business kosam oka <strong>targeted ad campaign</strong> run chestamu sir — mee local area
                lo, mee target audience ki reach avuthundi. Mee products ledhante services gurinchi enquiries
                vasthay sir."
              </Line>

              <Line>
                "Total package <strong>₹2,000</strong> sir. Setup + 1 Campaign."
              </Line>

              <PriceTable
                headers={["Service", "Price"]}
                rows={
                  <>
                    <tr className="border-b border-border">
                      <td className="py-2 px-3 text-sm">Social Media Setup (Meta Ad Account + IG + FB + WhatsApp Business)</td>
                      <td className="py-2 px-3 text-sm font-semibold">₹999</td>
                    </tr>
                    <tr className="border-b border-border">
                      <td className="py-2 px-3 text-sm">Campaign Management (1 campaign)</td>
                      <td className="py-2 px-3 text-sm font-semibold">₹999</td>
                    </tr>
                    <tr className="bg-accent/50">
                      <td className="py-2 px-3 text-sm font-bold">Total Package</td>
                      <td className="py-2 px-3 text-sm font-bold">₹2,000</td>
                    </tr>
                  </>
                }
              />

              <Tip>
                Client ki already video undi ante (wishes/promotional/cinematic) — "Mee video ne ad lo use chestamu sir"
                ani connect cheyyandi. Video lekapoyina, memu poster / creative design chesi run chestamu ani
                cheppandi.
              </Tip>

              <Label>If client asks about ad spend (Meta budget)</Label>
              <Line>
                "Sir, ee ₹2,000 maa service charge sir. Idi kakunda meeru Facebook/Instagram ki ad spend kattali sir —
                minimum ₹500 nunchi start cheyyochu sir. Meeru entha budget pettali ante memu suggest chestamu mee
                business ki thaggattuga sir."
              </Line>
            </>
          ),
        },
        {
          title: "3. Closing",
          icon: CheckCircle2,
          content: (
            <>
              <Line>
                "Cheppandi sir — meeru Digital Marketing Package start cheyamantara? Memu mee pages setup chesi
                immediately campaign run chestamu sir."
              </Line>
            </>
          ),
        },
        {
          title: "4. After Confirmation",
          icon: IndianRupee,
          content: (
            <>
              <Label>Process</Label>
              <div className="bg-card border border-border rounded-lg p-3 space-y-2">
                <Line>
                  "Sir, maaku kavalsindi mee <strong>business name, phone number, address, logo</strong> (unte) mariyu
                  mee services/products details sir."
                </Line>
                <Line>
                  "Maa company QR pampistamu — payment chesadapudu <strong>DREAM TEAM</strong> ani vasthundi sir. Payment
                  screenshot pampinchandi — maa team immediately mee pages setup start chestharu sir."
                </Line>
              </div>

              <Label>Logo lekapoyithe</Label>
              <div className="bg-card border border-border rounded-lg p-3 space-y-2">
                <Line>
                  "Sir, logo lekapoyithe memu kuda design chestamu — <strong>Standard Logo ₹499</strong>,{" "}
                  <strong>Premium Logo ₹999</strong>. Logo tho mee social media pages inka professional ga
                  kanipistay sir."
                </Line>
              </div>
            </>
          ),
        },
        {
          title: "5. Follow-up: Pitch Monthly Package or Ads",
          icon: ArrowRight,
          content: (
            <>
              <Tip>
                After single campaign results vachina tharvatha, monthly package or ad video pitch cheyyandi.
              </Tip>
              <Line>
                "Sir, mee campaign baaga run avuthundi — enquiries vasthunnay kada. Ippudu meeru monthly ga continue
                chesthe results inka ekkuva vasthay sir. Maa daggara <strong>Monthly Social Media Management
                Packages</strong> unnay sir — nenu mee details maa team ki share chestha, vallu mee business ki
                thaggattuga plan suggest chestharu sir."
              </Line>
              <Line>
                "Alage sir, meeru inka promotional video ledhante cinematic ad cheyinchukupothe — adi ad lo run chesthe
                inka manchi results vasthay sir."
              </Line>
            </>
          ),
        },
        {
          title: "6. Objection Handling & FAQs",
          icon: HelpCircle,
          content: (
            <>
              <Label>1. "Results guarantee unda?"</Label>
              <div className="bg-card border border-border rounded-lg p-3 space-y-2">
                <Line>
                  "Sir, digital marketing lo 100% guarantee evvaru ivvalem sir — kaani memu mee target audience ki reach
                  ayyela, mee area lo campaign run chestamu. Results mee business type, budget and content baatti
                  vasthay sir. Memu best effort chestamu."
                </Line>
              </div>
              <FraudFAQ />
            </>
          ),
        },
      ],
    },

    /* ──────── 6. SOCIAL MEDIA MANAGEMENT (Monthly) ──────── */
    {
      id: "social_media",
      label: "Social Media (Monthly)",
      icon: Globe,
      color: "text-cyan-500",
      sections: [
        {
          title: "1. Introduction",
          icon: Phone,
          content: (
            <>
              <Line>
                "Hello sir, good {g}. Naa peru <strong>{n}</strong>, nenu Dream Team
                Services nunchi matladuthunnanu. Meeru maa Social Media Management services gurinchi enquiry pettaru kada
                sir, dhanigurinchi call chesam sir."
              </Line>
              <Line>
                "Sir, meeru currently mee business kosam social media lo edhaina post chesthunnara? Instagram, Facebook
                lo pages unnaya sir?"
              </Line>
            </>
          ),
        },
        {
          title: "2. Main Pitch (Explain Monthly Packages Overview)",
          icon: Megaphone,
          content: (
            <>
              <Line>
                "Sir, maa daggara <strong>Monthly Social Media Management Packages</strong> unnayi sir. Memu meeku every
                month professional videos, posters, posts, stories and reels create chestamu — and Instagram, Facebook lo
                Meta Ads kuda run chestamu sir."
              </Line>
              <Line>
                "Maadi complete service sir — content creation nunchi ad campaign management varaku memu handle
                chestamu."
              </Line>

              <PriceTable
                headers={["Package", "Includes", "Price/month"]}
                rows={
                  <>
                    <tr className="border-b border-border">
                      <td className="py-2 px-3 text-sm font-medium">Starter</td>
                      <td className="py-2 px-3 text-xs">4 Videos, 4 Posters, 8 Posts, 8 Stories, Standard Meta Ads</td>
                      <td className="py-2 px-3 text-sm font-semibold">₹10,000</td>
                    </tr>
                    <tr className="border-b border-border">
                      <td className="py-2 px-3 text-sm font-medium">Plus</td>
                      <td className="py-2 px-3 text-xs">6 Videos, 6 Posters, 12 Posts, 12 Stories, Full Month Meta Ads</td>
                      <td className="py-2 px-3 text-sm font-semibold">₹15,000</td>
                    </tr>
                    <tr className="border-b border-border">
                      <td className="py-2 px-3 text-sm font-medium">Pro</td>
                      <td className="py-2 px-3 text-xs">8 Videos, 8 Posters, 16 Posts, 16 Stories, Advanced Meta Ads & Optimization</td>
                      <td className="py-2 px-3 text-sm font-semibold">₹20,000</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 text-sm font-medium">Ultra Pro</td>
                      <td className="py-2 px-3 text-xs">12 Videos, 12 Posters, 24 Posts, 24 Stories, Elite Level Meta Ads & Global Campaign</td>
                      <td className="py-2 px-3 text-sm font-semibold">₹30,000</td>
                    </tr>
                  </>
                }
              />

              <Tip>
                Exact pricing and package selection mee team (technical team) decide chestharu. Meeru client interest
                confirm chesthe — meeting schedule cheyandi.
              </Tip>
            </>
          ),
        },
        {
          title: "3. Closing — Schedule Meeting",
          icon: CheckCircle2,
          content: (
            <>
              <Line>
                "Sir, meeru monthly social media management lo interested unte — nenu mee details maa technical team ki
                share chestha sir. Vallu meeru tho oka <strong>short meeting schedule</strong> chestharu — mee business
                requirements, goals anni details discuss chestharu sir."
              </Line>
              <Line>
                "Meeting lo vallu mee business ki exactly em kavalo plan chesi oka <strong>quotation</strong> istaru sir.
                Aa quotation nenu meeku share chestha."
              </Line>
              <Tip>
                Your job: Confirm interest → Collect client basic details (business name, phone, what they do) → Share
                with technical team → They schedule meeting → They give quotation → You deliver quotation to client.
              </Tip>
            </>
          ),
        },
        {
          title: "4. After Client Confirms Interest",
          icon: IndianRupee,
          content: (
            <>
              <Label>What to collect from client</Label>
              <div className="bg-card border border-border rounded-lg p-3 space-y-2">
                <Line>✅ Business Name</Line>
                <Line>✅ Phone Number</Line>
                <Line>✅ Business Type (em chestharu)</Line>
                <Line>✅ Instagram / Facebook page links (unte)</Line>
                <Line>✅ Any specific goals or expectations</Line>
              </div>

              <Label>Your next step</Label>
              <div className="bg-card border border-border rounded-lg p-3 space-y-2">
                <Line>1. Collect above details from client</Line>
                <Line>2. Share details with Technical Team / Admin</Line>
                <Line>3. Technical team will schedule a meeting with client</Line>
                <Line>4. After meeting — tech team gives you the quotation</Line>
                <Line>5. You deliver the quotation to client and close the deal</Line>
              </div>
            </>
          ),
        },
        {
          title: "5. Objection Handling & FAQs",
          icon: HelpCircle,
          content: (
            <>
              <Label>1. "Monthly package chala costly ga undi"</Label>
              <div className="bg-card border border-border rounded-lg p-3 space-y-2">
                <Line>
                  "Sir, monthly lo memu videos, posters, posts, stories, ads — anni memu create and manage chestamu sir.
                  Meeru separate ga cheyinchukumate chala ekkuva avuthundi sir. Manadi complete package sir — mee time
                  and money save avuthundi."
                </Line>
              </div>

              <Label>2. "Mundu oka month try chestha, results vasthe continue chestha"</Label>
              <div className="bg-card border border-border rounded-lg p-3 space-y-2">
                <Line>
                  "Sure sir, meeru oka month try cheyyochu. Kaani social media marketing lo consistent presence
                  kavali sir. First month lo foundation set avuthundi — real results 2–3 months lo vasthay sir. Kaani
                  first month lo kuda meeru mee business online growth start observe cheyyochu sir."
                </Line>
              </div>
              <FraudFAQ />
            </>
          ),
        },
      ],
    },

    /* ──────── 7. WEBSITE DEVELOPMENT ──────── */
    {
      id: "website",
      label: "Website Development",
      icon: Monitor,
      color: "text-orange-500",
      sections: [
        {
          title: "1. Introduction",
          icon: Phone,
          content: (
            <>
              <Line>
                "Hello sir, good {g}. Naa peru <strong>{n}</strong>, nenu Dream Team
                Services nunchi matladuthunnanu. Meeru maa Website Development service gurinchi enquiry pettaru kada sir,
                dhanigurinchi call chesam sir."
              </Line>
              <Line>"Sir, meeru currently mee business ki website unda sir? Ledhante new ga create cheyalanukuntunnara?"</Line>
            </>
          ),
        },
        {
          title: "2. Main Pitch (Website Services Overview)",
          icon: Monitor,
          content: (
            <>
              <Line>
                "Sir, memu professional <strong>custom websites</strong> develop chestamu sir — mee business ki matching
                ga. Maadi template website kadu sir — mee brand ki exact ga design chestamu."
              </Line>

              <Label>What's included</Label>
              <div className="bg-card border border-border rounded-lg p-3 space-y-2">
                <Line>✅ Professional Design — mee brand colors and style lo</Line>
                <Line>✅ Responsive Layout — mobile, tablet, desktop anni devices lo work avuthundi</Line>
                <Line>✅ Content Management System (CMS) — meeru content easily update cheyyochu</Line>
                <Line>✅ SEO Optimized — Google lo mee website kanipinchela chestamu</Line>
                <Line>✅ Contact forms, Google Maps integration</Line>
              </div>

              <Line>
                "Maa websites <strong>₹4,999 nunchi</strong> start avuthay sir. Kaani exact pricing mee requirements
                baatti decide avuthundi sir."
              </Line>

              <PriceTable
                headers={["Feature", "Details"]}
                rows={
                  <>
                    <tr className="border-b border-border">
                      <td className="py-2 px-3 text-sm">Starting Price</td>
                      <td className="py-2 px-3 text-sm font-semibold">₹4,999/-</td>
                    </tr>
                    <tr className="border-b border-border">
                      <td className="py-2 px-3 text-sm">Design</td>
                      <td className="py-2 px-3 text-sm">Professional, custom brand design</td>
                    </tr>
                    <tr className="border-b border-border">
                      <td className="py-2 px-3 text-sm">Responsive</td>
                      <td className="py-2 px-3 text-sm">Mobile + Tablet + Desktop</td>
                    </tr>
                    <tr className="border-b border-border">
                      <td className="py-2 px-3 text-sm">CMS</td>
                      <td className="py-2 px-3 text-sm">Easy content updates</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 text-sm">SEO</td>
                      <td className="py-2 px-3 text-sm">Google optimized</td>
                    </tr>
                  </>
                }
              />
            </>
          ),
        },
        {
          title: "3. Closing — Schedule Meeting",
          icon: CheckCircle2,
          content: (
            <>
              <Line>
                "Sir, meeru website development lo interested unte — nenu mee details maa <strong>website
                team</strong> ki share chestha sir. Vallu meeru tho oka <strong>meeting schedule</strong> chestharu — mee
                requirements anni detailed ga discuss chestharu sir."
              </Line>
              <Line>
                "Meeting lo vallu mee business ki exactly em type website kavalo, enni pages kavalo, em features kavalo
                — anni plan chesi oka <strong>quotation</strong> istaru sir. Aa quotation nenu meeku share chestha."
              </Line>
              <Tip>
                Your job: Confirm interest → Collect basics → Share with website team → They meet client, assess
                requirements → Give quotation → You deliver quotation.
              </Tip>
            </>
          ),
        },
        {
          title: "4. After Client Confirms Interest",
          icon: IndianRupee,
          content: (
            <>
              <Label>What to collect from client</Label>
              <div className="bg-card border border-border rounded-lg p-3 space-y-2">
                <Line>✅ Business Name</Line>
                <Line>✅ Phone Number</Line>
                <Line>✅ Business Type (em chestharu)</Line>
                <Line>✅ Current website (unte) URL</Line>
                <Line>✅ Any reference websites they like</Line>
                <Line>✅ Logo (unte)</Line>
              </div>

              <Label>Logo lekapoyithe</Label>
              <div className="bg-card border border-border rounded-lg p-3 space-y-2">
                <Line>
                  "Sir, logo lekapoyithe memu design chestamu — <strong>Standard Logo ₹499</strong>,{" "}
                  <strong>Premium Logo ₹999</strong>. Website ki professional logo chala important sir."
                </Line>
              </div>

              <Label>Your next step</Label>
              <div className="bg-card border border-border rounded-lg p-3 space-y-2">
                <Line>1. Collect above details from client</Line>
                <Line>2. Share details with Website Team / Admin</Line>
                <Line>3. Website team will schedule a meeting with client</Line>
                <Line>4. After meeting — website team gives you the quotation</Line>
                <Line>5. You deliver the quotation to client and close the deal</Line>
              </div>
            </>
          ),
        },
        {
          title: "5. Follow-up: Pitch Digital Marketing + Ads",
          icon: ArrowRight,
          content: (
            <>
              <Tip>
                Website deliver ayyina tharvatha — Digital Marketing and Ad services pitch cheyyandi.
              </Tip>
              <Line>
                "Sir, mee website ready ayyindi — chala baaga vachindi. Ippudu inka ekkuva customers mee website ki
                raavali ante memu Instagram, Facebook lo ads run chestamu sir."
              </Line>
              <Line>
                "Maa <strong>Digital Marketing Single Campaign Package — ₹2,000</strong> lo mee social media setup +
                campaign run chestamu. Ads lo mee website link pettestamu — click chesthe direct mee website ki
                vastharu sir."
              </Line>
              <Line>
                "Alage sir, meeru oka promotional video or cinematic ad cheyinchukumate — adi mee website lo and social
                media ads lo use cheyyochu sir."
              </Line>
            </>
          ),
        },
        {
          title: "6. Objection Handling & FAQs",
          icon: HelpCircle,
          content: (
            <>
              <Label>1. "₹4,999 ante motham aaa? Extra charges emaina untaya?"</Label>
              <div className="bg-card border border-border rounded-lg p-3 space-y-2">
                <Line>
                  "Sir, ₹4,999 starting price sir. Mee requirements baatti — enni pages, em features kavalo daanni
                  baatti exact quote meeting lo decide avuthundi sir. Hidden charges emi undavu sir — meeting lo
                  motham clear ga chesthamu."
                </Line>
              </div>

              <Label>2. "Hosting and domain marchukovali kada?"</Label>
              <div className="bg-card border border-border rounded-lg p-3 space-y-2">
                <Line>
                  "Sir, domain and hosting gurinchi kuda meeting lo maa team discuss chestharu sir. Meeku anni options
                  explain chestharu — meeru decide cheyyochu sir."
                </Line>
              </div>

              <Label>3. "Enni days lo ready avuthundi?"</Label>
              <div className="bg-card border border-border rounded-lg p-3 space-y-2">
                <Line>
                  "Sir, website complexity baatti different avuthundi — simple website ayithe 5–7 working days lo,
                  complex website ayithe 10–15 days lo deliver chestamu sir. Exact timeline meeting lo cheppestamu sir."
                </Line>
              </div>
              <FraudFAQ />
            </>
          ),
        },
      ],
    },

    /* ──────── 8. LOGO DESIGN ──────── */
    {
      id: "logo",
      label: "Logo Design",
      icon: Palette,
      color: "text-rose-500",
      sections: [
        {
          title: "1. Introduction",
          icon: Phone,
          content: (
            <>
              <Line>
                "Hello sir, good {g}. Naa peru <strong>{n}</strong>, nenu Dream Team
                Services nunchi matladuthunnanu. Meeru maa Logo Design service gurinchi enquiry pettaru kada sir,
                dhanigurinchi call chesam sir."
              </Line>
              <Line>
                "Sir, meeru currently mee business ki logo unda sir? Ledhante new ga professional logo create
                cheyalanukuntunnara?"
              </Line>
            </>
          ),
        },
        {
          title: "2. Main Pitch (Logo Design Packages)",
          icon: Palette,
          content: (
            <>
              <Line>
                "Sir, professional logo mee business ki identity sir — mee ads, website, visiting cards, social media
                pages, WhatsApp — anni chotla mee brand represent chesthundi. Customers ki first impression logo nunchi
                ne vasthundi sir."
              </Line>
              <Line>
                "Maa daggara <strong>two packages</strong> unnayi sir."
              </Line>

              <Label>Standard Logo — ₹499</Label>
              <Line>
                "First package — <strong>Standard Logo ₹499</strong>. Idi clean, professional text-based logo sir. Mee
                business name ni stylish fonts and colors tho design chestamu. Simple but elegant sir — chala businesses
                ki perfect."
              </Line>

              <Label>Premium Logo — ₹999</Label>
              <Line>
                "Second package — <strong>Premium Logo ₹999</strong>. Idi detailed graphical logo sir — mee business ki
                matching icon or illustration tho design chestamu. Unique and eye-catching sir — mee brand ni stand out
                chesthundi. Multiple concepts provide chestamu — meeru best one select cheyyochu sir."
              </Line>

              <PriceTable
                headers={["Package", "What You Get", "Price"]}
                rows={
                  <>
                    <tr className="border-b border-border">
                      <td className="py-2 px-3 text-sm font-medium">Standard</td>
                      <td className="py-2 px-3 text-xs">Clean text-based logo, stylish fonts & colors, HD files</td>
                      <td className="py-2 px-3 text-sm font-semibold">₹499</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 text-sm font-medium">Premium</td>
                      <td className="py-2 px-3 text-xs">Graphical logo with icon/illustration, multiple concepts, HD + vector files</td>
                      <td className="py-2 px-3 text-sm font-semibold">₹999</td>
                    </tr>
                  </>
                }
              />

              <Tip>
                Client ki ad video or website kuda kavali ante, logo pettukuni aa services kuda pitch cheyyandi: "Logo
                ready ayyaka memu adi mee video ad lo, website lo use chestamu sir."
              </Tip>
            </>
          ),
        },
        {
          title: "3. Closing",
          icon: CheckCircle2,
          content: (
            <Line>
              "Cheppandi sir — Standard Logo cheyamantara, Premium Logo cheyamantara? Meeru mee business ki em type logo
              kavalo cheppandi sir."
            </Line>
          ),
        },
        {
          title: "4. After Package Selection",
          icon: IndianRupee,
          content: (
            <>
              <Label>What to collect from client</Label>
              <div className="bg-card border border-border rounded-lg p-3 space-y-2">
                <Line>✅ Business Name (logo lo em name ravaali)</Line>
                <Line>✅ Business Type (em chestharu — industry understand cheyadaniki)</Line>
                <Line>✅ Preferred Colors (emaina unte — lekapoyithe maa team suggest chestharu)</Line>
                <Line>✅ Any Reference Logos (emaina nachinavi unte pampinchandi)</Line>
                <Line>✅ Tagline (unte — logo kinda add chesthamu)</Line>
              </div>

              <Label>Process</Label>
              <div className="bg-card border border-border rounded-lg p-3 space-y-2">
                <Line>
                  "Maa company QR pampistamu — payment chesadapudu <strong>DREAM TEAM</strong> ani vasthundi sir. Payment
                  screenshot pampinchandi."
                </Line>
                <Line>
                  "Maa team <strong>2–3 concepts</strong> design chesi pampistaru sir. Meeru best one select
                  cheyyandi. Minor changes emaina unte correct chestamu sir."
                </Line>
                <Line>
                  "Logo manaki <strong>1–2 days</strong> lo ready avuthundi sir."
                </Line>
              </div>
            </>
          ),
        },
        {
          title: "5. Follow-up: Pitch Ad Video + Website + Google Listing",
          icon: ArrowRight,
          content: (
            <>
              <Tip>
                Logo deliver ayyina tharvatha — ad video, website, visiting card, and Google Listing pitch cheyyandi.
              </Tip>
              <Line>
                "Sir, mee logo chala baaga vachindi! Ippudu mee new logo tho oka <strong>professional promotional
                video</strong> cheyinchukumate mee business ki chala manchi impression vasthundi sir. ₹499 nunchi start
                avuthundi sir."
              </Line>
              <Line>
                "Alage sir, mee logo tho oka <strong>professional website</strong> kuda create cheyyochu — ₹4,999 nunchi
                start avuthundi sir."
              </Line>
              <Line>
                "Mee business Google lo search chesthe kanipinchali ante <strong>Google Business Listing</strong> kuda
                cheyinchukovali sir — ₹999 one-time setup sir."
              </Line>
            </>
          ),
        },
        {
          title: "6. Objection Handling & FAQs",
          icon: HelpCircle,
          content: (
            <>
              <Label>1. "Logo ki ₹499/₹999 ekkuva kadha? Free tools lo cheyyochu kada?"</Label>
              <div className="bg-card border border-border rounded-lg p-3 space-y-2">
                <Line>
                  "Sir, free tools lo basic logos vasthay sir — kaani professional designer meeru business ki matching
                  ga, unique ga design chestharu sir. Mee competitors tho same ga kanipinchadam istam ledhu kada sir.
                  Maa logo mee brand identity create chesthundi sir."
                </Line>
              </div>

              <Label>2. "Naku nachakapothe?"</Label>
              <div className="bg-card border border-border rounded-lg p-3 space-y-2">
                <Line>
                  "Sir, memu <strong>multiple concepts</strong> pampistamu — meeru oka dantlo edhaina select cheyyochu.
                  Alage minor changes kuda chestamu sir. Final logo meeku nachinappudu ne deliver chestamu sir."
                </Line>
              </div>
              <FraudFAQ />
            </>
          ),
        },
      ],
    },

    /* ──────── 9. GOOGLE BUSINESS LISTING ──────── */
    {
      id: "google_listing",
      label: "Google Listing",
      icon: MapPin,
      color: "text-red-500",
      sections: [
        {
          title: "1. Introduction",
          icon: Phone,
          content: (
            <>
              <Line>
                "Hello sir, good {g}. Naa peru <strong>{n}</strong>, nenu Dream Team
                Services nunchi matladuthunnanu. Meeru maa Google Business Listing service gurinchi enquiry pettaru kada
                sir, dhanigurinchi call chesam sir."
              </Line>
              <Line>
                "Sir, meeru mee business name Google lo search chesthe mee business kanipistunda sir? Google Maps lo mee
                business unda sir?"
              </Line>
            </>
          ),
        },
        {
          title: "2. Main Pitch (Google Business Listing — ₹999)",
          icon: MapPin,
          content: (
            <>
              <Line>
                "Sir, <strong>Google Business Listing</strong> antey enti ante — evaru aiyna mee business name ledhante
                mee service Google lo search chesthe, mee business profile kanipistundi sir. Mee address, phone number,
                working hours, photos, customer reviews — anni Google lo ne kanipistay sir."
              </Line>
              <Line>
                "Example ki sir — evaru aiyna 'best {"{"}mee service{"}"} near me' ani Google lo search chesthe, mee
                business top lo kanipistundi sir. <strong>Google Maps</strong> lo kuda mee location kanipistundi — direct
                directions teesukoni mee shop ki ravacchu sir."
              </Line>

              <Label>What's included in ₹999</Label>
              <div className="bg-card border border-border rounded-lg p-3 space-y-2">
                <Line>✅ Google Business Profile creation & verification</Line>
                <Line>✅ Business name, address, phone number setup</Line>
                <Line>✅ Business category & description optimization</Line>
                <Line>✅ Business hours setup</Line>
                <Line>✅ Photos upload (shop, products, services)</Line>
                <Line>✅ Google Maps location pin setup</Line>
                <Line>✅ SEO optimization for local search</Line>
              </div>

              <PriceTable
                headers={["Service", "Price"]}
                rows={
                  <>
                    <tr className="bg-accent/50">
                      <td className="py-2 px-3 text-sm font-bold">Google Business Listing — Complete Setup</td>
                      <td className="py-2 px-3 text-sm font-bold">₹999</td>
                    </tr>
                  </>
                }
              />

              <Tip>
                Client ki explain cheyyandi: "Sir, mee competitors Google lo kanipistunnaru — meeru kanipinchakapoyithe
                mee customers valla daggariki potunnaru sir."
              </Tip>
            </>
          ),
        },
        {
          title: "3. Closing",
          icon: CheckCircle2,
          content: (
            <Line>
              "Cheppandi sir — Google Business Listing setup cheyamantara? ₹999 one-time setup sir — oka sari setup
              chesaka meeru permanently Google lo kanipistaru sir."
            </Line>
          ),
        },
        {
          title: "4. After Confirmation",
          icon: IndianRupee,
          content: (
            <>
              <Label>What to collect from client</Label>
              <div className="bg-card border border-border rounded-lg p-3 space-y-2">
                <Line>✅ Business Name (Google lo ela kanipinchali)</Line>
                <Line>✅ Complete Address (Google Maps lo pin cheyadaniki)</Line>
                <Line>✅ Phone Number</Line>
                <Line>✅ Business Category (em service/product provide chestharu)</Line>
                <Line>✅ Working Hours</Line>
                <Line>✅ Business Photos (shop front, products, interior — minimum 5)</Line>
                <Line>✅ Logo (unte)</Line>
                <Line>✅ Website URL (unte)</Line>
              </div>

              <Label>Logo lekapoyithe</Label>
              <div className="bg-card border border-border rounded-lg p-3 space-y-2">
                <Line>
                  "Sir, logo lekapoyithe memu design chestamu — <strong>Standard Logo ₹499</strong>,{" "}
                  <strong>Premium Logo ₹999</strong>. Google listing lo logo unte mee profile professional ga
                  kanipistundi sir."
                </Line>
              </div>

              <Label>Process</Label>
              <div className="bg-card border border-border rounded-lg p-3 space-y-2">
                <Line>
                  "Maa company QR pampistamu — payment chesadapudu <strong>DREAM TEAM</strong> ani vasthundi sir. Payment
                  screenshot pampinchandi."
                </Line>
                <Line>
                  "Maa team mee Google Business Profile create chesi verification process start chestharu sir. Complete
                  setup <strong>2–3 days</strong> lo avuthundi sir."
                </Line>
              </div>
            </>
          ),
        },
        {
          title: "5. Follow-up: Pitch Website + Digital Marketing + Ads",
          icon: ArrowRight,
          content: (
            <>
              <Tip>
                Google Listing setup ayyina tharvatha — website, digital marketing, and ad services pitch cheyyandi.
              </Tip>
              <Line>
                "Sir, mee Google Business Listing live ayyindi — ippudu mee business Google lo kanipistundi. Ippudu mee
                business ki oka <strong>professional website</strong> kuda unte, customers Google nunchi direct mee
                website ki vastharu sir — ₹4,999 nunchi start avuthundi sir."
              </Line>
              <Line>
                "Alage sir, Instagram and Facebook lo ads run chesthe inka ekkuva customers ki reach avuthundi — maa{" "}
                <strong>Digital Marketing Package ₹2,000</strong> lo setup + campaign run chestamu sir."
              </Line>
              <Line>
                "Mee business ki oka promotional video or cinematic ad cheyinchukumate — Google Listing lo, social media
                lo, WhatsApp lo — anni chotla use cheyyochu sir."
              </Line>
            </>
          ),
        },
        {
          title: "6. Objection Handling & FAQs",
          icon: HelpCircle,
          content: (
            <>
              <Label>1. "Google lo free ga cheyyochu kada?"</Label>
              <div className="bg-card border border-border rounded-lg p-3 space-y-2">
                <Line>
                  "Sir, Google Business Profile create cheyadam free ne sir — kaani properly setup cheyyali, SEO optimize
                  cheyyali, verification process handle cheyyali, photos professional ga upload cheyyali — idantha memu
                  complete ga chestamu sir. Meeru time spend cheyakkunda memu professional ga handle chestamu sir."
                </Line>
              </div>

              <Label>2. "Oka sari setup chesthe permanent aa?"</Label>
              <div className="bg-card border border-border rounded-lg p-3 space-y-2">
                <Line>
                  "Avunu sir, oka sari setup chesaka mee profile permanent ga Google lo untundi sir. Meeru ela update
                  cheyyalo kuda memu nerpistamu sir. Monthly charges emi undavu sir — ₹999 one-time only."
                </Line>
              </div>

              <Label>3. "Reviews ela vasthay?"</Label>
              <div className="bg-card border border-border rounded-lg p-3 space-y-2">
                <Line>
                  "Sir, mee customers ki mee Google profile link share cheyyandi — vallu reviews pettestharu sir. Ekkuva
                  positive reviews unte mee business Google lo inka paina kanipistundi sir. Memu meeku review link kuda
                  create chesi istamu sir."
                </Line>
              </div>
              <FraudFAQ />
            </>
          ),
        },
      ],
    },
  ];
}

/* ═══════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════ */

export default function SalesScripts() {
  const user = useAuthStore((s) => s.user);
  const userName = user?.name || "Your Name";
  const greeting = getGreeting();
  const [festivalName, setFestivalName] = useState<string>(getUpcomingFestivalName);

  // Real-time listener: admin festival override propagates instantly to all members
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, "settings", "salesConfig"),
      (snap) => {
        const val: string | undefined = snap.data()?.activeFestival;
        if (val) setFestivalName(val);
      },
      () => { /* ignore errors, keep default */ }
    );
    return unsub;
  }, []);

  const tabs = buildTabs(greeting, userName, festivalName);
  const [activeTab, setActiveTab] = useState(tabs[0].id);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  const currentTab = tabs.find((t) => t.id === activeTab)!;

  const showFestivalSelector = activeTab === "festival" || activeTab === "followup";

  const toggleSection = (key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const expandAll = () => {
    const next: Record<string, boolean> = {};
    currentTab.sections.forEach((_, i) => {
      next[`${activeTab}-${i}`] = true;
    });
    setOpenSections((prev) => ({ ...prev, ...next }));
  };

  const collapseAll = () => {
    const next: Record<string, boolean> = {};
    currentTab.sections.forEach((_, i) => {
      next[`${activeTab}-${i}`] = false;
    });
    setOpenSections((prev) => ({ ...prev, ...next }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Sales Scripts</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Ready-to-use call scripts for every service — follow these step-by-step during client calls
        </p>
      </div>

      {/* Dynamic Info Bar */}
      <div className="flex flex-wrap items-center gap-3 bg-card border border-border rounded-xl px-4 py-3">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Greeting:</span>
          <span className="font-semibold text-foreground capitalize">Good {greeting}</span>
        </div>
        <div className="hidden sm:block w-px h-4 bg-border" />
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Your Name:</span>
          <span className="font-semibold text-foreground">{userName}</span>
        </div>
        <div className="hidden sm:block w-px h-4 bg-border" />
        <div className="flex items-center gap-2 text-xs w-full sm:w-auto min-w-0">
          <span className="text-muted-foreground shrink-0">Festival:</span>
          {showFestivalSelector ? (
            <select
              value={festivalName}
              onChange={(e) => setFestivalName(e.target.value)}
              className="h-7 px-2 rounded-md bg-background border border-border text-foreground text-xs font-semibold outline-none focus:border-primary min-w-0 w-full sm:w-auto max-w-full"
            >
              {FESTIVALS.map((f) => (
                <option key={f.name} value={f.name}>
                  {getFestivalOptionLabel(f)}
                </option>
              ))}
            </select>
          ) : (
            <span className="font-semibold text-foreground">
              {festivalName}
              {findFestival(festivalName) && (
                <span className="font-normal text-muted-foreground ml-1">
                  — {formatFestivalDate(findFestival(festivalName)!.date)}
                </span>
              )}
            </span>
          )}
        </div>
      </div>

      {/* Tab bar — horizontal scroll on mobile */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all shrink-0 border ${
                isActive
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-card text-muted-foreground border-border hover:border-primary/30 hover:text-foreground"
              }`}
            >
              <Icon size={14} className={isActive ? "" : tab.color} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Expand / Collapse controls */}
      <div className="flex gap-2">
        <button
          onClick={expandAll}
          className="text-[11px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border border-border hover:border-primary/30"
        >
          Expand All
        </button>
        <button
          onClick={collapseAll}
          className="text-[11px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border border-border hover:border-primary/30"
        >
          Collapse All
        </button>
      </div>

      {/* Sections (accordion) */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-3"
      >
        {currentTab.sections.map((section, idx) => {
          const key = `${activeTab}-${idx}`;
          const isOpen = openSections[key] ?? false;
          const SectionIcon = section.icon;

          return (
            <div key={key} className="bg-card border border-border rounded-xl overflow-hidden">
              <button
                onClick={() => toggleSection(key)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent/50 transition-colors"
              >
                <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <SectionIcon size={14} />
                </div>
                <span className="text-sm font-semibold text-foreground flex-1">{section.title}</span>
                <ChevronDown
                  size={16}
                  className={`text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                />
              </button>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-4 pt-1">{section.content}</div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </motion.div>

      {/* Quick compare — Ad pricing */}
      <div className="bg-card border border-border rounded-xl p-4 md:p-5">
        <h3 className="font-display font-semibold text-foreground mb-3 flex items-center gap-2">
          <IndianRupee size={16} className="text-primary" /> Quick Reference — Ad Pricing Comparison
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left border border-border rounded-lg overflow-hidden">
            <thead className="bg-accent">
              <tr>
                <th className="py-2 px-3 text-xs font-semibold text-muted-foreground">Duration + Poster</th>
                <th className="py-2 px-3 text-xs font-semibold text-muted-foreground">Promotional Ad (₹)</th>
                <th className="py-2 px-3 text-xs font-semibold text-muted-foreground">Cinematic Ad (₹)</th>
              </tr>
            </thead>
            <tbody>
              <PriceRow duration="15 sec + Poster" promo={499} cinematic={999} />
              <PriceRow duration="30 sec + Poster" promo={999} cinematic={1999} />
              <PriceRow duration="45 sec + Poster" promo={1499} cinematic={2999} />
              <PriceRow duration="1 min + Poster" promo={1999} cinematic={3999} />
            </tbody>
          </table>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-background border border-border rounded-lg p-3">
            <p className="text-xs font-semibold text-muted-foreground mb-1">Festival Wishes</p>
            <p className="text-sm">Only Wishes: <strong>₹499</strong> (20s)</p>
            <p className="text-sm">Wishes + Promotion: <strong>₹999</strong> (40s)</p>
          </div>
          <div className="bg-background border border-border rounded-lg p-3">
            <p className="text-xs font-semibold text-muted-foreground mb-1">Digital Marketing (Single Campaign)</p>
            <p className="text-sm">Setup + 1 Campaign: <strong>₹2,000</strong></p>
          </div>
          <div className="bg-background border border-border rounded-lg p-3">
            <p className="text-xs font-semibold text-muted-foreground mb-1">Logo & Google Listing</p>
            <p className="text-sm">Logo: <strong>₹499</strong> / <strong>₹999</strong></p>
            <p className="text-sm">Google Listing: <strong>₹999</strong></p>
          </div>
        </div>
      </div>
    </div>
  );
}
