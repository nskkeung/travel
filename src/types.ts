export interface TripItem {
  id: string;
  title: string;
  description: string;
  location?: { lat: number; lng: number; address: string };
  startSlot: number; // 0 to 47 (30 min increments)
  duration: number; // number of 30min slots
  bgColor: string;
  textColor: string;
}

export interface Day {
  id: string;
  date: string;
  area: string;
  notes: string;
  items: TripItem[];
}

export interface AppTheme {
  primary: string;
  accent: string;
  background: string;
  sidebar: string;
  fontFamily: 'sans' | 'serif' | 'mono';
  borderRadius: 'none' | 'sm' | 'md' | 'lg' | 'full';
  borderWidth: '0' | '1' | '2' | '4';
  shadow: 'none' | 'sm' | 'md' | 'lg';
}

export interface TripState {
  title: string;
  days: Day[];
  theme: AppTheme;
}

export const TIME_SLOTS = Array.from({ length: 48 }, (_, i) => {
  const hour = Math.floor(i / 2);
  const min = (i % 2) * 30;
  return `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
});
