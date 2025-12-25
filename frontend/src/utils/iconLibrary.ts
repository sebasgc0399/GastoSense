import { iconNames } from 'lucide-react/dynamic';

export const ICON_LIBRARY = [
  'Wallet',
  'CreditCard',
  'Banknote',
  'Coins',
  'PiggyBank',
  'Receipt',
  'Landmark',
  'Building2',
  'Briefcase',
  'ShoppingBag',
  'ShoppingCart',
  'Utensils',
  'Bus',
  'Car',
  'Train',
  'Bike',
  'Plane',
  'Fuel',
  'Home',
  'Zap',
  'Lightbulb',
  'Gamepad2',
  'Heart',
  'GraduationCap',
  'Book',
  'Music',
  'Camera',
  'Coffee',
  'Gift',
  'Leaf',
  'Stethoscope',
  'Dumbbell',
  'Flower2',
  'Hammer',
  'Wrench',
  'Laptop',
  'Phone',
  'Globe',
  'Wifi',
  'Shield',
  'Tag',
  'Tv',
  'Sparkles',
  'PawPrint',
  'Palette',
  'Paintbrush',
  'Ticket',
  'DollarSign',
  'Calculator',
  'Calendar',
] as const;

const toPascalCase = (value: string) =>
  value
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

const AI_ICON_SET = new Set(iconNames.map(toPascalCase));

export const isValidAiIconName = (name: string) => AI_ICON_SET.has(name);
