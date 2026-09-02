import type { LucideIcon } from "lucide-react";
import {
  Accessibility, AlarmClock, Anchor, Anvil, Archive, Armchair, Atom, AudioLines,
  Award, Baby, Backpack, BadgeDollarSign, Banana, Banknote, Battery, Bath,
  BedDouble, Beef, Bell, BicepsFlexed, Bike, Binoculars, Bird, Bluetooth,
  BookMarked, BookOpen, Bot, Box, BriefcaseBusiness, BriefcaseMedical, Brush,
  Building, Bus, Cable, CakeSlice, Calculator, CalendarDays, Camera, Candy,
  CandyCane, Car, CarFront, Caravan, Cat, ChefHat, Cherry, CircleDollarSign,
  CircleHelp, Citrus, Clapperboard, Cloud, Coffee, Coins, Compass, ConciergeBell,
  CookingPot, Cookie, CreditCard, Croissant, Crown, CupSoda, Dice5, Dog, DoorOpen,
  Drill, Droplet, Drum, Dumbbell, Ear, Earth, EggFried, Factory, Fan, Feather,
  FerrisWheel, Fingerprint, Fish, FishSymbol, Flag, Flame, Flashlight, Flower2,
  Footprints, Forklift, Fuel, Gamepad2, Gem, Gift, Glasses, Grape, Grid2X2,
  Hammer, HandCoins, HandHeart, HandPlatter, HardHat, Headphones, Headset,
  HeartHandshake, HeartPulse, Hotel, House, IceCreamBowl, Image, Joystick,
  KeyRound, Keyboard, Landmark, LampDesk, Laptop, Leaf, Lightbulb, LockKeyhole,
  Luggage, Map as MapIcon, MapPinned, Martini, Medal, Megaphone, Mic, Microscope,
  Milk, Monitor, Moon, Mouse, Music2, Navigation, Newspaper, Nut, Package,
  PackageCheck, Paintbrush, Palette, ParkingCircle, PartyPopper, PawPrint, PcCase,
  PenTool, Piano, Pickaxe, PiggyBank, Pill, Pizza, Plane, Plug, Podcast, Popcorn,
  Printer, Puzzle, QrCode, Radio, Recycle, Refrigerator, Ribbon, Rocket,
  RollerCoaster, Router, Ruler, Sailboat, Sandwich, Scale, Scissors, School,
  Search, Server, Shapes, ShipWheel, Shirt, ShoppingBag, ShoppingBasket, Shovel,
  ShowerHead, Siren, Skull, Smartphone, SmartphoneCharging, Smile,
  Snowflake, Soup, Speaker, Sparkles, SprayCan, Sprout, Star, Stethoscope, Store,
  Sun, SwatchBook, Swords, Syringe, Table, Tablet, Tag, Tent, TentTree, TestTube,
  Theater, Thermometer, Ticket, TicketCheck, Timer, Toilet, ToyBrick, Tractor,
  TrainFront, Trees, Trophy, Truck, Tv, Umbrella, University, Utensils, Vegan,
  VenetianMask, Video, Volleyball, Volume2, Wallet, Warehouse, Watch,
  WashingMachine, Waves, Webcam, Wheat, Wind, Wine, Wrench, Zap,
} from "lucide-react";

export type CategoryIconOption = readonly [name: string, label: string, icon: LucideIcon];
export interface CategoryIconGroup {
  id: string;
  label: string;
  icons: readonly CategoryIconOption[];
}

/** Broad, retail-first icon library. Groups are rendered as picker tabs. */
export const CATEGORY_ICON_GROUPS: readonly CategoryIconGroup[] = [
  { id: "basis", label: "Basis", icons: [
    ["grid", "Algemeen", Grid2X2], ["tag", "Labels & overig", Tag], ["package", "Pakket", Package], ["box", "Doos", Box], ["shopping-bag", "Winkelen", ShoppingBag], ["shopping-basket", "Mandje", ShoppingBasket], ["store", "Winkel", Store], ["archive", "Archief", Archive], ["star", "Favoriet", Star], ["sparkles", "Nieuw", Sparkles], ["gift", "Cadeaus", Gift], ["promo", "Promoties", BadgeDollarSign], ["ticket", "Tickets", Ticket], ["ticket-check", "Toegang", TicketCheck], ["ribbon", "Collectie", Ribbon], ["shapes", "Assortiment", Shapes],
  ] },
  { id: "mode", label: "Mode & beauty", icons: [
    ["shirt", "Kleding", Shirt], ["footprints", "Schoenen", Footprints], ["glasses", "Brillen", Glasses], ["watch", "Horloges", Watch], ["gem", "Juwelen", Gem], ["crown", "Luxe", Crown], ["brush", "Beauty", Brush], ["scissors", "Kapper", Scissors], ["spray-can", "Parfum", SprayCan], ["bath", "Bad & body", Bath], ["shower-head", "Douche", ShowerHead], ["droplet", "Cosmetica", Droplet], ["fan", "Haarstyling", Fan], ["ear", "Oorbellen", Ear], ["swatch-book", "Stalen", SwatchBook], ["feather", "Accessoires", Feather],
  ] },
  { id: "eten", label: "Eten & drinken", icons: [
    ["utensils", "Eten", Utensils], ["cooking-pot", "Keuken", CookingPot], ["coffee", "Koffie", Coffee], ["cup-soda", "Frisdrank", CupSoda], ["wine", "Wijn & bier", Wine], ["martini", "Cocktails", Martini], ["chef-hat", "Chef", ChefHat], ["hand-platter", "Horeca", HandPlatter], ["beef", "Slagerij", Beef], ["cake", "Bakkerij", CakeSlice], ["croissant", "Ontbijt", Croissant], ["sandwich", "Broodjes", Sandwich], ["soup", "Soep", Soup], ["pizza", "Pizza", Pizza], ["cookie", "Koekjes", Cookie], ["candy", "Snoep", Candy], ["candy-cane", "Seizoen", CandyCane], ["ice-cream", "IJs", IceCreamBowl], ["banana", "Fruit", Banana], ["cherry", "Fruit", Cherry], ["citrus", "Groenten", Citrus], ["grape", "Druiven", Grape], ["wheat", "Granen", Wheat], ["milk", "Zuivel", Milk], ["vegan", "Vegan", Vegan], ["egg-fried", "Delicatessen", EggFried], ["refrigerator", "Koeling", Refrigerator], ["nut", "Noten", Nut],
  ] },
  { id: "wonen", label: "Wonen & tuin", icons: [
    ["house", "Wonen", House], ["armchair", "Meubels", Armchair], ["bed", "Bedden", BedDouble], ["lamp-desk", "Verlichting", LampDesk], ["lightbulb", "Lampen", Lightbulb], ["paintbrush", "Verf", Paintbrush], ["pen-tool", "Decoratie", PenTool], ["ruler", "Interieur", Ruler], ["door-open", "Deuren", DoorOpen], ["toilet", "Sanitair", Toilet], ["washing-machine", "Wassen", WashingMachine], ["recycle", "Duurzaam", Recycle], ["trees", "Tuin", Trees], ["sprout", "Planten", Sprout], ["flower", "Bloemen", Flower2], ["leaf", "Natuur", Leaf], ["sun", "Zomer", Sun], ["snowflake", "Winter", Snowflake], ["wind", "Ventilatie", Wind], ["flame", "Verwarming", Flame],
  ] },
  { id: "sport", label: "Sport & outdoor", icons: [
    ["dumbbell", "Fitness", Dumbbell], ["biceps", "Kracht", BicepsFlexed], ["bike", "Fietsen", Bike], ["skateboard", "Skateboards", Rocket], ["volleyball", "Volleybal", Volleyball], ["trophy", "Trofeeën", Trophy], ["medal", "Prijzen", Medal], ["award", "Awards", Award], ["tent", "Kamperen", Tent], ["tent-tree", "Outdoor", TentTree], ["binoculars", "Verrekijkers", Binoculars], ["sailboat", "Watersport", Sailboat], ["waves", "Strand", Waves], ["anchor", "Maritiem", Anchor], ["umbrella", "Regen", Umbrella], ["roller-coaster", "Pretpark", RollerCoaster], ["accessibility", "Mobiliteit", Accessibility], ["wheelchair", "Zorgmobiliteit", Accessibility],
  ] },
  { id: "mobiliteit", label: "Auto & reizen", icons: [
    ["car-front", "Auto", CarFront], ["car", "Auto-onderdelen", Car], ["truck", "Transport", Truck], ["bus", "Bus", Bus], ["train", "Trein", TrainFront], ["plane", "Vliegen", Plane], ["caravan", "Caravan", Caravan], ["fuel", "Brandstof", Fuel], ["parking", "Parkeren", ParkingCircle], ["navigation", "Navigatie", Navigation], ["map", "Kaarten", MapIcon], ["map-pinned", "Bestemmingen", MapPinned], ["luggage", "Bagage", Luggage], ["backpack", "Rugzakken", Backpack], ["compass", "Kompas", Compass], ["tractor", "Landbouw", Tractor], ["forklift", "Magazijnvervoer", Forklift], ["ship-wheel", "Scheepvaart", ShipWheel],
  ] },
  { id: "tech", label: "Tech & media", icons: [
    ["smartphone", "Telefoons", Smartphone], ["smartphone-charging", "Opladen", SmartphoneCharging], ["tablet", "Tablets", Tablet], ["laptop", "Computers", Laptop], ["monitor", "Monitoren", Monitor], ["pc-case", "PC-onderdelen", PcCase], ["keyboard", "Toetsenborden", Keyboard], ["mouse", "Muizen", Mouse], ["webcam", "Webcams", Webcam], ["camera", "Camera", Camera], ["video", "Video", Video], ["tv", "Televisie", Tv], ["headphones", "Audio", Headphones], ["headset", "Headsets", Headset], ["speaker", "Speakers", Speaker], ["mic", "Microfoons", Mic], ["audio-lines", "Geluid", AudioLines], ["radio", "Radio", Radio], ["podcast", "Podcast", Podcast], ["music", "Muziek", Music2], ["piano", "Instrumenten", Piano], ["drum", "Drums", Drum], ["clapperboard", "Film", Clapperboard], ["image", "Foto", Image], ["bluetooth", "Bluetooth", Bluetooth], ["cable", "Kabels", Cable], ["plug", "Stekkers", Plug], ["router", "Netwerk", Router], ["server", "Servers", Server], ["qr-code", "QR & scanning", QrCode], ["barcode", "Barcodes", QrCode],
  ] },
  { id: "tools", label: "Tools & industrie", icons: [
    ["wrench", "Tools & onderhoud", Wrench], ["hammer", "Bouw", Hammer], ["drill", "Gereedschap", Drill], ["anvil", "Metaal", Anvil], ["pickaxe", "Werkplaats", Pickaxe], ["shovel", "Grondwerk", Shovel], ["hard-hat", "Veiligheid", HardHat], ["flashlight", "Zaklampen", Flashlight], ["battery", "Batterijen", Battery], ["zap", "Energie", Zap], ["factory", "Industrie", Factory], ["warehouse", "Magazijn", Warehouse], ["package-check", "Verzending", PackageCheck], ["scale", "Wegen", Scale], ["calculator", "Rekenen", Calculator], ["timer", "Tijdmeting", Timer], ["thermometer", "Temperatuur", Thermometer], ["test-tube", "Testmateriaal", TestTube], ["microscope", "Laboratorium", Microscope], ["atom", "Wetenschap", Atom], ["cloud", "Cloud", Cloud], ["search", "Zoeken", Search], ["siren", "Alarm", Siren],
  ] },
  { id: "kids_pets", label: "Kids & dieren", icons: [
    ["baby", "Baby", Baby], ["toy-brick", "Speelgoed", ToyBrick], ["puzzle", "Puzzels", Puzzle], ["gamepad", "Gaming", Gamepad2], ["joystick", "Arcade", Joystick], ["dice", "Bordspellen", Dice5], ["dog", "Hond", Dog], ["cat", "Kat", Cat], ["paw-print", "Dieren", PawPrint], ["fish", "Vis", Fish], ["fish-symbol", "Aquarium", FishSymbol], ["bird", "Vogels", Bird], ["pet-care", "Huisdieren", PawPrint], ["smile", "Kinderen", Smile],
  ] },
  { id: "zorg", label: "Zorg & welzijn", icons: [
    ["heart-pulse", "Gezondheid", HeartPulse], ["stethoscope", "Zorg", Stethoscope], ["syringe", "Medisch", Syringe], ["pill", "Apotheek", Pill], ["briefcase-medical", "Medische dienst", BriefcaseMedical], ["hand-heart", "Welzijn", HandHeart], ["heart-handshake", "Zorgservice", HeartHandshake], ["wheelchair", "Toegankelijkheid", Accessibility], ["ear", "Gehoor", Ear], ["glasses", "Optiek", Glasses], ["bath", "Zelfzorg", Bath], ["moon", "Slaap", Moon], ["alarm-clock", "Wekkers", AlarmClock], ["bell", "Alarmering", Bell], ["thermometer", "Meten", Thermometer],
  ] },
  { id: "zakelijk", label: "Zakelijk & service", icons: [
    ["briefcase", "Zakelijk", BriefcaseBusiness], ["landmark", "Bank", Landmark], ["banknote", "Geld", Banknote], ["coins", "Munten", Coins], ["circle-dollar", "Financieel", CircleDollarSign], ["credit-card", "Betalen", CreditCard], ["wallet", "Portefeuille", Wallet], ["piggy-bank", "Sparen", PiggyBank], ["key", "Sleutels", KeyRound], ["lock", "Beveiliging", LockKeyhole], ["fingerprint", "Identiteit", Fingerprint], ["building", "Gebouw", Building], ["hotel", "Hotel", Hotel], ["university", "Onderwijs", University], ["school", "School", School], ["book", "Boeken", BookOpen], ["bookmarked", "Kantoor", BookMarked], ["printer", "Printen", Printer], ["megaphone", "Marketing", Megaphone], ["concierge", "Service", ConciergeBell], ["bot", "Automatisering", Bot], ["calendar", "Planning", CalendarDays], ["table", "Tafels", Table],
  ] },
  { id: "hobby", label: "Hobby & entertainment", icons: [
    ["rocket", "Hobby", Rocket], ["palette", "Kunst", Palette], ["paintbrush", "Schilderen", Paintbrush], ["theater", "Theater", Theater], ["venetian-mask", "Feest", VenetianMask], ["party-popper", "Party", PartyPopper], ["popcorn", "Cinema", Popcorn], ["music", "Muziek", Music2], ["piano", "Piano", Piano], ["drum", "Drums", Drum], ["gamepad", "Gaming", Gamepad2], ["joystick", "Arcade", Joystick], ["swords", "Fantasy", Swords], ["dice", "Spellen", Dice5], ["crown", "Verzamelen", Crown], ["feather", "Creatief", Feather], ["earth", "Wereld", Earth], ["flag", "Fanartikelen", Flag], ["skull", "Alternatief", Skull], ["ferris-wheel", "Attracties", FerrisWheel], ["circle-help", "Overig", CircleHelp],
  ] },
] ;

export const CATEGORY_ICON_OPTIONS = CATEGORY_ICON_GROUPS.flatMap((group) => group.icons);
export type CategoryIconName = (typeof CATEGORY_ICON_OPTIONS)[number][0];

const iconByName = new Map<string, LucideIcon>(CATEGORY_ICON_OPTIONS.map(([name, _label, icon]) => [name, icon]));
export const categoryIcon = (name?: string): LucideIcon => iconByName.get(name ?? "") ?? Tag;
export const categoryIconLabel = (name?: string): string => CATEGORY_ICON_OPTIONS.find(([value]) => value === name)?.[1] ?? "Labels & overig";
