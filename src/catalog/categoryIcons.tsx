import type { LucideIcon } from "lucide-react";
import {
  Armchair, Baby, Backpack, BadgeDollarSign, Banknote, Battery, BedDouble,
  Beef, Bike, BookOpen, Bolt, Box, BriefcaseBusiness, Brush, CakeSlice,
  Camera, Candy, CarFront, Cat, Cherry, CircleHelp, Citrus, Coffee,
  CookingPot, Cookie, CreditCard, Croissant, Dog, Drill, Dumbbell, EggFried,
  Fish, Flower2, Footprints, Fuel, Gamepad2, Gem, Gift, Glasses, Grid2X2,
  Hammer, HandPlatter, HardHat, Headphones, HeartPulse, House, KeyRound,
  LampDesk, Laptop, Leaf, LockKeyhole, Luggage, Map as MapIcon, Medal, Milk, Music2,
  Newspaper, Package, Paintbrush, Palette, PawPrint, Pill, Plane, Puzzle,
  Refrigerator, Rocket, Sailboat, Sandwich, Scissors, Shirt, ShoppingBag,
  Smartphone, Soup, Sparkles, Stethoscope, Store, Syringe, Tag, TentTree,
  Ticket, ToyBrick, Tractor, Trees, Trophy, Truck, Umbrella, Utensils,
  VenetianMask, Watch, WashingMachine, Wheat, Wine, Wrench, Zap,
} from "lucide-react";

/**
 * The curated catalog deliberately covers retail departments rather than
 * exposing an unbounded icon name field. This keeps saved category data
 * portable across devices and upgrades while still covering broad retail.
 */
export const CATEGORY_ICON_OPTIONS = [
  ["grid", "Algemeen", Grid2X2], ["tag", "Labels & overig", Tag], ["package", "Pakket", Package],
  ["shopping-bag", "Winkelen", ShoppingBag], ["store", "Winkel", Store], ["box", "Doos", Box],
  ["shirt", "Kleding", Shirt], ["glasses", "Brillen", Glasses], ["watch", "Horloges", Watch],
  ["gem", "Juwelen", Gem], ["brush", "Beauty", Brush], ["scissors", "Kapper", Scissors],
  ["heart-pulse", "Gezondheid", HeartPulse], ["pill", "Apotheek", Pill], ["dumbbell", "Sport", Dumbbell],
  ["bike", "Fietsen", Bike], ["trophy", "Trofeeën", Trophy], ["medal", "Prijzen", Medal],
  ["tent-tree", "Outdoor", TentTree], ["trees", "Tuin", Trees], ["leaf", "Natuur", Leaf],
  ["car-front", "Auto", CarFront], ["truck", "Transport", Truck], ["plane", "Reizen", Plane],
  ["wrench", "Tools & onderhoud", Wrench], ["hard-hat", "Bouw", HardHat], ["house", "Wonen", House],
  ["armchair", "Meubels", Armchair], ["lamp-desk", "Verlichting", LampDesk], ["paintbrush", "Verf", Paintbrush],
  ["cooking-pot", "Keuken", CookingPot], ["utensils", "Eten", Utensils], ["coffee", "Koffie", Coffee],
  ["hand-platter", "Horeca", HandPlatter], ["beef", "Slagerij", Beef], ["cake", "Bakkerij", CakeSlice],
  ["croissant", "Ontbijt", Croissant], ["sandwich", "Broodjes", Sandwich], ["soup", "Soep", Soup],
  ["cookie", "Koekjes", Cookie], ["candy", "Snoep", Candy], ["cherry", "Fruit", Cherry],
  ["citrus", "Groenten", Citrus], ["wheat", "Granen", Wheat], ["milk", "Zuivel", Milk], ["wine", "Wijn", Wine],
  ["egg-fried", "Delicatessen", EggFried], ["refrigerator", "Koeling", Refrigerator], ["gift", "Cadeaus", Gift],
  ["baby", "Baby", Baby], ["toy-brick", "Speelgoed", ToyBrick], ["gamepad", "Gaming", Gamepad2],
  ["puzzle", "Puzzels", Puzzle], ["book", "Boeken", BookOpen], ["music", "Muziek", Music2],
  ["headphones", "Audio", Headphones], ["camera", "Camera", Camera], ["smartphone", "Telefoons", Smartphone],
  ["laptop", "Computers", Laptop], ["battery", "Batterijen", Battery], ["bolt", "Elektrisch", Bolt],
  ["rocket", "Hobby", Rocket], ["palette", "Kunst", Palette], ["newspaper", "Tijdschriften", Newspaper],
  ["venetian-mask", "Feest", VenetianMask], ["dog", "Hond", Dog], ["cat", "Kat", Cat],
  ["paw-print", "Dieren", PawPrint], ["fish", "Vis", Fish], ["briefcase", "Zakelijk", BriefcaseBusiness],
  ["badge-dollar", "Promoties", BadgeDollarSign], ["credit-card", "Betalen", CreditCard], ["banknote", "Geld", Banknote],
  ["ticket", "Tickets", Ticket], ["map", "Kaarten", MapIcon], ["luggage", "Bagage", Luggage], ["backpack", "Rugzakken", Backpack],
  ["footprints", "Schoenen", Footprints], ["bed", "Slaapkamer", BedDouble], ["washing-machine", "Wassen", WashingMachine],
  ["hammer", "Bouw", Hammer], ["drill", "Gereedschap", Drill], ["fuel", "Brandstof", Fuel], ["tractor", "Landbouw", Tractor],
  ["sailboat", "Watersport", Sailboat], ["umbrella", "Regen", Umbrella], ["stethoscope", "Zorg", Stethoscope],
  ["syringe", "Medisch", Syringe], ["key", "Sleutels", KeyRound], ["lock", "Beveiliging", LockKeyhole],
  ["zap", "Energie", Zap], ["sparkles", "Nieuw", Sparkles], ["help", "Overig", CircleHelp],
] as const satisfies readonly (readonly [string, string, LucideIcon])[];

export type CategoryIconName = (typeof CATEGORY_ICON_OPTIONS)[number][0];

const iconByName = new Map<string, LucideIcon>(
  CATEGORY_ICON_OPTIONS.map(([name, _label, icon]) => [name, icon]),
);

export const categoryIcon = (name?: string): LucideIcon => iconByName.get(name ?? "") ?? Tag;

export const categoryIconLabel = (name?: string): string =>
  CATEGORY_ICON_OPTIONS.find(([value]) => value === name)?.[1] ?? "Labels & overig";
