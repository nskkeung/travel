import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Plus, Trash2, GripVertical, Settings2, Menu, PanelLeft, X, ChevronLeft, ChevronRight, MapPin, StickyNote, Map as MapIcon, Calendar, CheckSquare, Square, Palette, Layout, Save } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { TripItem, Day, TripState, TIME_SLOTS, AppTheme } from './types';
import { cn } from './lib/utils';

// Fix Leaflet marker icons using CDN to avoid import issues
const DefaultIcon = L.icon({
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

const INITIAL_DAY_COUNT = 7;

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

const THEME_PRESETS: Record<string, AppTheme> = {
  artistic: {
    primary: '#D4A373',
    accent: '#A19B8F',
    background: '#F9F8F4',
    sidebar: '#FFFFFF',
    fontFamily: 'serif',
    borderRadius: 'md',
    borderWidth: '1',
    shadow: 'sm',
  },
  technical: {
    primary: '#333333',
    accent: '#666666',
    background: '#ffffff',
    sidebar: '#f3f4f6',
    fontFamily: 'mono',
    borderRadius: 'none',
    borderWidth: '2',
    shadow: 'none',
  },
  vibrant: {
    primary: '#f43f5e',
    accent: '#fb7185',
    background: '#fff1f2',
    sidebar: '#ffffff',
    fontFamily: 'sans',
    borderRadius: 'full',
    borderWidth: '0',
    shadow: 'lg',
  }
};

export default function App() {
  const [view, setView] = useState<'timeline' | 'map'>('timeline');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [trip, setTrip] = useState<TripState>(() => {
    const saved = localStorage.getItem('trip-flow-state');
    const defaultTheme = THEME_PRESETS.artistic;
    const defaultTitle = "My Travel Journey";
    
    if (saved) {
      try {
        const data = JSON.parse(saved);
        // Robust theme merge/fallback
        return {
          title: defaultTitle,
          ...data,
          theme: { ...defaultTheme, ...data.theme }
        };
      } catch (e) {
        console.error('Failed to parse saved trip:', e);
      }
    }

    const initialDays: Day[] = Array.from({ length: INITIAL_DAY_COUNT }, (_, i) => ({
      id: generateId(),
      date: `Day ${i + 1}`,
      area: '',
      notes: '',
      items: [],
    }));
    return { title: defaultTitle, days: initialDays, theme: defaultTheme };
  });

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [editingItemIds, setEditingItemIds] = useState<{ dayId: string; itemId: string } | null>(null);
  const [draftItem, setDraftItem] = useState<{ dayId: string; item: TripItem } | null>(null);
  const [initialState, setInitialState] = useState<string | null>(null);
  const [visibleDayIds, setVisibleDayIds] = useState<Set<string>>(new Set(trip.days.map(d => d.id)));

  // Sync visibleDayIds when days change
  useEffect(() => {
    setVisibleDayIds(prev => {
      const next = new Set(prev);
      // Remove deleted days
      const currentIds = new Set(trip.days.map(d => d.id));
      prev.forEach(id => {
        if (!currentIds.has(id)) next.delete(id);
      });
      // Add new days by default? Or just keep what we have. 
      // Usually better to add new days as visible.
      trip.days.forEach(d => {
        if (!prev.has(d.id)) next.add(d.id);
      });
      return next;
    });
  }, [trip.days.length]);

  // Derive editing item from IDs and main state to ensure reactivity
  const editingItem = useMemo(() => {
    if (draftItem) return draftItem;
    if (!editingItemIds) return null;
    const day = trip.days.find(d => d.id === editingItemIds.dayId);
    const item = day?.items.find(i => i.id === editingItemIds.itemId);
    if (!item) return null;
    return { dayId: editingItemIds.dayId, item };
  }, [editingItemIds, draftItem, trip]);

  // Map Centering Component
  const MapRefocuser = () => {
    const map = useMap();
    useEffect(() => {
      const locations = trip.days
        .filter(d => visibleDayIds.has(d.id))
        .flatMap(d => d.items.filter(i => i.location).map(i => i.location!));
      if (locations.length > 0) {
        const bounds = L.latLngBounds(locations.map(loc => [loc.lat, loc.lng] as any));
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
      }
    }, [trip.days, visibleDayIds, map]);
    return null;
  };

  const [isSearchingLocation, setIsSearchingLocation] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [hoveredSlot, setHoveredSlot] = useState<{ dayId: string; slot: number } | null>(null);

  useEffect(() => {
    localStorage.setItem('trip-flow-state', JSON.stringify(trip));
  }, [trip]);

  const addDay = () => {
    setTrip(prev => ({
      ...prev,
      days: [
        ...prev.days,
        {
          id: generateId(),
          date: `Day ${prev.days.length + 1}`,
          area: '',
          notes: '',
          items: [],
        },
      ],
    }));
  };

  const removeDay = (id: string) => {
    if (trip.days.length <= 1) return;
    setTrip(prev => ({
      ...prev,
      days: prev.days.filter(d => d.id !== id),
    }));
  };

  const updateDayField = (dayId: string, field: 'area' | 'notes', value: string) => {
    setTrip(prev => ({
      ...prev,
      days: prev.days.map(d => d.id === dayId ? { ...d, [field]: value } : d),
    }));
  };

  const addItem = (dayId: string, startSlot: number) => {
    const newItem: TripItem = {
      id: generateId(),
      title: 'New Event',
      description: '',
      startSlot,
      duration: 2,
      bgColor: trip.theme.primary + '15',
      textColor: trip.theme.primary,
    };

    setDraftItem({ dayId, item: newItem });
    setInitialState(JSON.stringify(newItem));
  };

  const updateItem = (dayId: string, itemId: string, updates: Partial<TripItem>) => {
    if (draftItem) {
      setDraftItem(prev => prev ? { ...prev, item: { ...prev.item, ...updates } } : null);
      return;
    }
    
    setTrip(prev => ({
      ...prev,
      days: prev.days.map(d => d.id === dayId ? {
        ...d,
        items: d.items.map(item => item.id === itemId ? { ...item, ...updates } : item)
      } : d),
    }));
  };

  const saveItem = () => {
    if (draftItem) {
      setTrip(prev => ({
        ...prev,
        days: prev.days.map(d => d.id === draftItem.dayId ? { ...d, items: [...d.items, draftItem.item] } : d),
      }));
      setDraftItem(null);
    }
    setEditingItemIds(null);
    setInitialState(null);
  };

  const closeEditor = () => {
    if (!editingItem) return;
    const currentStr = JSON.stringify(editingItem.item);
    if (initialState && currentStr !== initialState) {
      if (!confirm("You have unsaved changes. Discard them?")) {
        return;
      }
    }
    setEditingItemIds(null);
    setDraftItem(null);
    setInitialState(null);
  };

  const deleteItem = (dayId: string, itemId: string) => {
    setTrip(prev => ({
      ...prev,
      days: prev.days.map(d => d.id === dayId ? {
        ...d,
        items: d.items.filter(item => item.id !== itemId)
      } : d),
    }));
    setEditingItemIds(null);
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulkUpdateColor = (bg: string, text: string) => {
    setTrip(prev => ({
      ...prev,
      days: prev.days.map(d => ({
        ...d,
        items: d.items.map(item => selectedIds.has(item.id) ? { ...item, bgColor: bg, textColor: text } : item)
      }))
    }));
  };

  const bulkDelete = () => {
    if (confirm(`Delete ${selectedIds.size} events?`)) {
      setTrip(prev => ({
        ...prev,
        days: prev.days.map(d => ({
          ...d,
          items: d.items.filter(item => !selectedIds.has(item.id))
        }))
      }));
      setSelectedIds(new Set());
      setIsSelectMode(false);
    }
  };

  const updateTheme = (updates: Partial<AppTheme>) => {
    setTrip(prev => ({
      ...prev,
      theme: { ...prev.theme, ...updates }
    }));
  };

  const onDragEnd = (dayId: string, itemId: string, info: any) => {
    // Find the day and slot elements under the pointer
    const elementsAtPoint = document.elementsFromPoint(info.point.x, info.point.y);
    const dayElement = elementsAtPoint.find(el => el.hasAttribute('data-day-id')) as HTMLElement | undefined;
    const slotElement = elementsAtPoint.find(el => el.hasAttribute('data-slot-idx')) as HTMLElement | undefined;

    if (dayElement) {
      const newDayId = dayElement.getAttribute('data-day-id')!;
      let newSlotIdx: number;

      if (slotElement) {
        newSlotIdx = parseInt(slotElement.getAttribute('data-slot-idx')!);
      } else {
        // Fallback to calculation if slot element not directly hit
        const dayRect = dayElement.getBoundingClientRect();
        const relativeY = info.point.y - dayRect.top;
        newSlotIdx = Math.max(0, Math.min(TIME_SLOTS.length - 1, Math.floor(relativeY / 48)));
      }

      setTrip(prev => {
        const sourceDay = prev.days.find(d => d.id === dayId);
        const item = sourceDay?.items.find(i => i.id === itemId);
        if (!item) return prev;

        // If the position hasn't changed, do nothing
        if (dayId === newDayId && item.startSlot === newSlotIdx) return prev;

        // Create new days array with the item moved
        const daysWithoutItem = prev.days.map(d => ({
          ...d,
          items: d.items.filter(i => i.id !== itemId)
        }));

        return {
          ...prev,
          days: daysWithoutItem.map(d => {
            if (d.id === newDayId) {
              return { 
                ...d, 
                items: [...d.items, { ...item, startSlot: newSlotIdx }] 
              };
            }
            return d;
          })
        };
      });
    }
  };

  const searchLocation = async (query: string) => {
    if (!query) return;
    setIsSearchingLocation(true);
    setSearchResults([]);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`);
      const data = await response.json();
      setSearchResults(data || []);
      if (!data || data.length === 0) {
        alert("Location not found. Please try a more specific search.");
      }
    } catch (error) {
      console.error("Search error:", error);
      alert("Search failed. Please try again later.");
    } finally {
      setIsSearchingLocation(false);
    }
  };

  const selectSearchResult = (result: any) => {
    if (!editingItemIds) return;
    updateItem(editingItemIds.dayId, editingItemIds.itemId, {
      location: {
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon),
        address: result.display_name
      }
    });
    setSearchResults([]);
  };

  const colorPresets = [
    { bg: '#E8F0E4', border: '#8FB07C', text: '#3B542E', label: 'Nature' },
    { bg: '#F2E8E4', border: '#B0867C', text: '#54342E', label: 'Culture' },
    { bg: '#E4E9F2', border: '#7C97B0', text: '#2E3C54', label: 'Modern' },
    { bg: '#F2F1E4', border: '#B0A77C', text: '#544D2E', label: 'Food' },
    { bg: '#424242', border: '#000000', text: '#ffffff', label: 'Important' },
  ];

  return (
    <div 
      className="flex bg-[#F9F8F4] text-[#2C2C2C] font-sans h-screen overflow-hidden selection:bg-[#D4A373]/20 relative"
      style={{ 
        backgroundColor: trip.theme.background,
        fontFamily: trip.theme.fontFamily === 'serif' ? 'Playfair Display, serif' : trip.theme.fontFamily === 'mono' ? 'JetBrains Mono, monospace' : 'Inter, sans-serif'
      } as any}
    >
      {/* Sidebar Toggle Button (Mobile/Desktop) */}
      <button 
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        title={isSidebarOpen ? "Collapse Sidebar" : "Expand Sidebar"}
        className={cn(
          "fixed bottom-6 right-6 md:bottom-auto md:top-4 z-[70] w-12 h-12 md:w-8 md:h-8 bg-[#1A1A1A] text-white rounded-full shadow-2xl md:shadow-sm transition-all active:scale-95 flex items-center justify-center hover:bg-[#D4A373]",
          isSidebarOpen ? "md:left-[17.5rem]" : "md:left-4"
        )}
      >
        {isSidebarOpen ? (
          <ChevronLeft className="w-6 h-6 md:w-4 md:h-4" />
        ) : (
          <Menu className="w-6 h-6 md:w-4 md:h-4" />
        )}
      </button>

      {/* Sidebar */}
      <AnimatePresence initial={false}>
        {isSidebarOpen && (
          <motion.aside 
            initial={{ x: -100, opacity: 0, width: 0 }}
            animate={{ x: 0, opacity: 1, width: '18rem' }}
            exit={{ x: -100, opacity: 0, width: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="border-r border-[#E5E2DA] flex flex-col bg-white shrink-0 z-50 absolute md:relative h-full overflow-hidden shadow-2xl md:shadow-none"
          >
            <div className="p-8 border-b border-[#E5E2DA] shrink-0" style={{ backgroundColor: '#f7ffe0' }}>
              <input 
                type="text"
                className="text-4xl tracking-tight text-[#1A1A1A] bg-transparent border-none focus:ring-0 w-full p-0 outline-none font-bold"
                style={{ fontFamily: 'Georgia', fontStyle: 'normal' }}
                value={trip.title}
                onChange={(e) => setTrip(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Trip Title"
              />
              <p className="text-[10px] uppercase tracking-[0.2em] mt-2 text-[#A19B8F]">Travel Flow Planner</p>
            </div>
            
            <nav className="flex-1 p-6 space-y-8 overflow-y-auto">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#A19B8F] mb-4">View Mode</p>
            <ul className="space-y-3">
              <li 
                onClick={() => setView('timeline')}
                className={cn(
                  "flex items-center gap-3 text-sm font-medium group cursor-pointer transition-all",
                  view === 'timeline' ? "text-[#1A1A1A]" : "text-[#7C776D]"
                )}
              >
                <div className={cn(
                  "w-4 h-4 rounded-full transition-all",
                  view === 'timeline' ? "bg-[#D4A373] ring-4 ring-[#D4A373]/10" : "border-2 border-[#D4A373]"
                )}></div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  <span>Timeline</span>
                </div>
              </li>
              <li 
                onClick={() => setView('map')}
                className={cn(
                   "flex items-center gap-3 text-sm font-medium group cursor-pointer transition-all",
                   view === 'map' ? "text-[#1A1A1A]" : "text-[#7C776D]"
                )}
              >
                <div className={cn(
                  "w-4 h-4 rounded-full transition-all",
                  view === 'map' ? "bg-[#D4A373] ring-4 ring-[#D4A373]/10" : "border-2 border-[#D4A373]"
                )}></div>
                <div className="flex items-center gap-2">
                  <MapIcon className="w-4 h-4" />
                  <span>Map Explorer</span>
                </div>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#A19B8F] mb-4">Aesthetics</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(THEME_PRESETS).map(([key, t]) => (
                <button
                  key={key}
                  onClick={() => setTrip(prev => ({ ...prev, theme: t }))}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all border",
                    trip.theme.fontFamily === t.fontFamily && trip.theme.borderRadius === t.borderRadius ? "bg-[#1A1A1A] text-white border-transparent" : "border-[#E5E2DA] text-[#7C776D] hover:border-[#D4A373]"
                  )}
                >
                  {key}
                </button>
              ))}
            </div>
            
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#A19B8F] uppercase font-bold">Base Color</span>
                <input 
                  type="color" 
                  value={trip.theme.primary}
                  onChange={(e) => updateTheme({ primary: e.target.value })}
                  className="w-6 h-6 rounded-full overflow-hidden border-none cursor-pointer"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#A19B8F] uppercase font-bold">Typography</span>
                <select 
                  value={trip.theme.fontFamily}
                  onChange={(e) => updateTheme({ fontFamily: e.target.value as any })}
                  className="text-[10px] bg-transparent border border-[#E5E2DA] rounded px-1 outline-none"
                >
                  <option value="sans">Modern Sans</option>
                  <option value="serif">Classic Serif</option>
                  <option value="mono">Technical</option>
                </select>
              </div>
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#A19B8F] mb-4">Selection</p>
            <button 
              onClick={() => {
                setIsSelectMode(!isSelectMode);
                if (isSelectMode) setSelectedIds(new Set());
              }}
              className={cn(
                "w-full py-3 flex items-center justify-center gap-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all border",
                isSelectMode ? "bg-[#D4A373] text-white border-transparent" : "border-[#E5E2DA] text-[#7C776D] hover:bg-[#F9F8F4]"
              )}
            >
              {isSelectMode ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
              {isSelectMode ? 'Turn Off Select' : 'Multi-Select Mode'}
            </button>
          </div>

          <div className="pt-2">
            <button 
              onClick={addDay}
              className="w-full py-4 border-2 border-dashed border-[#E5E2DA] text-[11px] font-bold uppercase tracking-[0.2em] text-[#A19B8F] hover:bg-[#F9F8F4] hover:text-[#D4A373] hover:border-[#D4A373] transition-all rounded-xl active:scale-[0.98]"
            >
              + Add New Day
            </button>
          </div>

          <div className="pt-6">
            <div className="bg-[#F9F8F4] p-5 rounded-2xl border border-[#E5E2DA]">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#A19B8F]">Trip Memory</p>
                <button 
                  onClick={() => {
                    if (confirm('Erase all travel plans?')) {
                      localStorage.removeItem('trip-flow-state');
                      window.location.reload();
                    }
                  }}
                  className="text-[9px] font-bold text-red-400 hover:text-red-500 hover:underline transition-all uppercase tracking-widest"
                >
                  Clear
                </button>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-2xl font-serif italic tracking-tight">{trip.days.length} Days</span>
                <span className="text-[10px] text-[#A19B8F]">Total Duration</span>
              </div>
            </div>
          </div>
        </nav>

        <div className="p-8 border-t border-[#E5E2DA] flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#1A1A1A] flex items-center justify-center text-white text-[10px] font-bold">V</div>
          <span className="text-xs font-medium text-[#7C776D]">v1.2.0 Artistic</span>
        </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Container */}
      <main 
        className={cn(
          "flex-1 flex flex-col overflow-auto transition-all duration-500 custom-scrollbar relative",
          trip.theme.fontFamily === 'serif' ? 'font-serif' : trip.theme.fontFamily === 'mono' ? 'font-mono' : 'font-sans'
        )}
        style={{ backgroundColor: trip.theme.background }}
      >
        {view === 'timeline' ? (
          <div className="flex-1 flex flex-col min-w-max">
            {/* Header Grid */}
            <div className="flex border-b border-[#E5E2DA] bg-white sticky top-0 z-40 shrink-0">
              <div className="w-16 border-r border-[#E5E2DA] flex items-end justify-center pb-6 sticky left-0 bg-white z-50">
                <span className="text-[10px] font-black text-[#A19B8F] rotate-180" style={{ writingMode: 'vertical-rl' }}>REGION</span>
              </div>
              <div className="flex">
                {trip.days.map((day, idx) => (
                  <div key={day.id} className="w-36 md:w-72 p-4 md:p-6 border-r border-[#E5E2DA] shrink-0 bg-white">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] md:text-[11px] font-black uppercase tracking-widest" style={{ color: trip.theme.primary }}>Day {(idx + 1).toString().padStart(2, '0')}</span>
                      <button 
                        onClick={() => removeDay(day.id)}
                        className="text-[#A19B8F] hover:text-red-500 opacity-40 hover:opacity-100 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <input 
                      type="text" 
                      placeholder="Where?..."
                      value={day.area}
                      onChange={(e) => updateDayField(day.id, 'area', e.target.value)}
                      className="w-full mt-1 md:mt-2 text-base md:text-xl bg-transparent border-none focus:ring-0 p-0 placeholder-[#E5E2DA] text-[#1A1A1A] italic font-serif"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Scrollable Context (Timeline + Remarks) */}
            <div className="flex flex-1 relative">
              {/* Timeline Grid */}
              <div className="flex flex-1 relative">
                {/* Time Column */}
                <div className="w-16 sticky left-0 z-30 bg-white border-r border-[#E5E2DA] shrink-0">
                  {TIME_SLOTS.map((time, i) => (
                    <div key={time} className="h-12 border-b border-[#F0EFE9] flex items-center justify-center text-[10px] font-mono text-[#A19B8F]">
                      <span className={cn(i % 4 === 0 ? "text-[#2C2C2C] font-bold" : "")}>{time}</span>
                    </div>
                  ))}
                </div>

                {/* Days Columns */}
                <div className="flex relative">
                  {trip.days.map((day) => (
                    <div 
                      key={day.id} 
                      data-day-id={day.id}
                      className="w-36 md:w-72 border-r border-[#E5E2DA] relative group/col"
                    >
                      {/* Slots */}
                      {TIME_SLOTS.map((_, i) => (
                        <div 
                          key={i}
                          data-slot-idx={i}
                          onClick={() => !isSelectMode && addItem(day.id, i)}
                          onMouseEnter={() => setHoveredSlot({ dayId: day.id, slot: i })}
                          onMouseLeave={() => setHoveredSlot(null)}
                          className={cn(
                            "h-12 border-b border-[#F0EFE9] transition-all cursor-crosshair group/slot relative",
                            hoveredSlot?.dayId === day.id && hoveredSlot?.slot === i ? "bg-[#D4A373]/5" : ""
                          )}
                        >
                          {!isSelectMode && (
                            <div className={cn(
                              "absolute inset-x-0 bottom-0 top-0 pointer-events-none rounded-lg m-1 border-2 border-dashed border-[#D4A373] transition-opacity duration-200",
                              (hoveredSlot?.dayId === day.id && hoveredSlot?.slot === i) ? "opacity-60" : "opacity-0 group-hover/slot:opacity-30"
                            )} />
                          )}
                        </div>
                      ))}

                      {/* Items */}
                      <div className="absolute inset-0 pointer-events-none">
                        {day.items.map((item) => {
                          const isSelected = selectedIds.has(item.id);
                          return (
                            <motion.div
                              key={item.id}
                              layoutId={item.id}
                              drag={!isSelectMode}
                              dragMomentum={false}
                              dragElastic={0.05}
                              whileDrag={{ 
                                scale: 1.02, 
                                zIndex: 100, 
                                opacity: 0.9,
                                boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)"
                              }}
                              onDrag={(_, info) => {
                                const elementsAtPoint = document.elementsFromPoint(info.point.x, info.point.y);
                                const dayElement = elementsAtPoint.find(el => el.hasAttribute('data-day-id')) as HTMLElement | undefined;
                                const slotElement = elementsAtPoint.find(el => el.hasAttribute('data-slot-idx')) as HTMLElement | undefined;
                                if (dayElement && slotElement) {
                                  setHoveredSlot({ 
                                    dayId: dayElement.getAttribute('data-day-id')!, 
                                    slot: parseInt(slotElement.getAttribute('data-slot-idx')!) 
                                  });
                                }
                              }}
                              onDragEnd={(_, info) => {
                                setHoveredSlot(null);
                                onDragEnd(day.id, item.id, info);
                              }}
                              transition={{ type: 'spring', damping: 30, stiffness: 300, mass: 0.8 }}
                              style={{
                                top: `${item.startSlot * 48}px`,
                                height: `${item.duration * 48 - 4}px`,
                                backgroundColor: item.bgColor,
                                color: item.textColor,
                                borderColor: isSelected ? trip.theme.primary : 'rgba(0,0,0,0.1)',
                                ringColor: isSelected ? trip.theme.primary : 'transparent',
                                borderRadius: trip.theme.borderRadius === 'full' ? '9999px' : trip.theme.borderRadius === 'lg' ? '1rem' : trip.theme.borderRadius === 'md' ? '0.5rem' : trip.theme.borderRadius === 'sm' ? '0.25rem' : '0px',
                                boxShadow: trip.theme.shadow === 'none' ? 'none' : undefined // Let Tailwind classes handle the rest or provide style
                              } as any}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isSelectMode || e.ctrlKey || e.metaKey) {
                                  toggleSelection(item.id);
                                } else {
                                  setEditingItemIds({ dayId: day.id, itemId: item.id });
                                }
                              }}
                              className={cn(
                                "absolute left-2 right-2 mt-0.5 border p-3 pointer-events-auto overflow-hidden group/item flex flex-col z-10 transition-all",
                                trip.theme.shadow === 'lg' ? 'shadow-lg' : trip.theme.shadow === 'md' ? 'shadow-md' : trip.theme.shadow === 'sm' ? 'shadow-sm' : '',
                                isSelectMode ? "cursor-pointer" : "cursor-grab active:cursor-grabbing hover:shadow-md",
                                isSelected ? "ring-4 ring-offset-2 scale-[1.02] z-50" : ""
                              )}
                            >
                              <div className="flex justify-between items-start mb-1">
                                <span className="text-[11px] font-bold uppercase tracking-tight leading-tight line-clamp-2">{item.title}</span>
                                {isSelectMode ? (
                                  <div className={cn(
                                    "w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all",
                                    isSelected ? "bg-white border-white text-black" : "border-white/40"
                                  )}>
                                    {isSelected && <CheckSquare className="w-3 h-3" />}
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1">
                                    {item.location && (
                                      <a 
                                        href={`https://www.google.com/maps/search/?api=1&query=${item.location.lat},${item.location.lng}`} 
                                        target="_blank" 
                                        rel="noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="p-1 hover:bg-white/20 rounded transition-colors"
                                      >
                                        <MapPin className="w-3 h-3 text-white/60 hover:text-white" />
                                      </a>
                                    )}
                                    <span className="text-[9px] opacity-40 font-mono">::</span>
                                  </div>
                                )}
                              </div>
                              {item.description && (
                                <p className="text-[9px] opacity-80 leading-relaxed truncate-3-lines italic">
                                  {item.description}
                                </p>
                              )}
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bottom Remarks Section */}
              <div className="h-40 border-t-2 border-[#E5E2DA] bg-white flex shrink-0 sticky bottom-0 z-40">
                <div className="w-16 border-r border-[#E5E2DA] flex items-center justify-center bg-[#F9F8F4]/50">
                  <span className="text-[10px] font-black text-[#A19B8F] rotate-180" style={{ writingMode: 'vertical-rl' }}>REMARKS</span>
                </div>
                <div className="flex-1 overflow-x-auto no-scrollbar">
                  <div className="flex min-w-max h-full">
                    {trip.days.map((day) => (
                      <div key={day.id} className="w-72 p-5 border-r border-[#E5E2DA]">
                        <textarea 
                          className="w-full h-full text-[11px] leading-relaxed bg-transparent border-none resize-none focus:ring-0 p-0 text-[#7C776D] font-sans placeholder-[#E5E2DA] italic"
                          placeholder="Notes for today..."
                          value={day.notes}
                          onChange={(e) => updateDayField(day.id, 'notes', e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 relative bg-[#FAFAF8] p-4 md:p-8 overflow-hidden flex flex-col gap-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl md:text-3xl font-serif italic text-[#1A1A1A]">Geographic Map</h2>
                <p className="text-[10px] uppercase tracking-widest text-[#A19B8F] mt-1">Select days to toggle markers</p>
              </div>
              <div className="flex flex-wrap gap-2 md:gap-3">
                {trip.days.map((day, i) => (
                   <button 
                     key={day.id} 
                     onClick={() => {
                        const next = new Set(visibleDayIds);
                        if (next.has(day.id)) next.delete(day.id);
                        else next.add(day.id);
                        setVisibleDayIds(next);
                     }}
                     className={cn(
                       "flex items-center gap-2 px-3 py-1.5 border rounded-full text-[10px] font-bold transition-all",
                       visibleDayIds.has(day.id) 
                         ? "bg-white border-[#E5E2DA] shadow-sm text-[#1A1A1A]" 
                         : "bg-transparent border-transparent opacity-40 grayscale"
                     )}
                   >
                     <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: trip.theme.primary, opacity: 0.3 + (i * 0.1) }}></div>
                     Day {i + 1}
                   </button>
                ))}
              </div>
            </div>
            
            <div className="flex-1 rounded-2xl md:rounded-[40px] overflow-hidden border-2 md:border-8 border-white shadow-2xl relative z-10 shrink-0 mb-4">
              <MapContainer 
                center={[20, 0] as any}
                zoom={2} 
                className="w-full h-full"
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />
                <MapRefocuser />
                {trip.days.map((day, dayIdx) => 
                  visibleDayIds.has(day.id) && day.items.map(item => item.location && (
                    <Marker key={item.id} position={[item.location.lat, item.location.lng] as any}>
                      <Popup>
                        <div className="p-1 font-sans">
                          <h4 className="font-bold text-sm text-blue-600">Day {dayIdx + 1}: {item.title}</h4>
                          <a 
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.location.address)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-gray-600 mt-1 hover:underline flex items-center gap-1"
                          >
                            <MapPin className="w-3 h-3" />
                            {item.location.address}
                          </a>
                          <p className="text-[10px] text-gray-400 mt-2">{item.description}</p>
                        </div>
                      </Popup>
                    </Marker>
                  ))
                )}
              </MapContainer>
            </div>
          </div>
        )}
      </main>

      {/* Bulk Action Toolbar */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div 
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[60] bg-[#1A1A1A] text-white px-8 py-5 rounded-3xl shadow-2xl flex items-center gap-10 border border-white/10 backdrop-blur-xl"
          >
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Selected Items</span>
              <span className="text-xl font-serif italic text-[#D4A373]">{selectedIds.size} Events</span>
            </div>
            
            <div className="h-10 w-px bg-white/10" />
            
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Bulk Color</span>
              <div className="flex gap-2">
                 {[
                   { bg: '#E8F0E4', text: '#3B542E' },
                   { bg: '#F2E8E4', text: '#54342E' },
                   { bg: '#E4E9F2', text: '#2E3C54' },
                   { bg: '#F2F1E4', text: '#544D2E' },
                   { bg: '#424242', text: '#ffffff' },
                 ].map((c, i) => (
                   <button 
                    key={i}
                    onClick={() => bulkUpdateColor(c.bg, c.text)}
                    className="w-6 h-6 rounded-full border border-white/20 transition-transform hover:scale-110 active:scale-90"
                    style={{ backgroundColor: c.bg }}
                   />
                 ))}
              </div>
            </div>

            <div className="flex gap-4">
              <button 
                onClick={bulkDelete}
                className="flex items-center gap-2 px-6 py-3 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all"
              >
                <Trash2 className="w-4 h-4" />
                Delete All
              </button>
              <button 
                onClick={() => {
                  setSelectedIds(new Set());
                  setIsSelectMode(false);
                }}
                className="flex items-center gap-2 px-6 py-3 bg-white/5 text-white border border-white/10 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-white/10 transition-all"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Modal */}
      <AnimatePresence>
        {editingItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-[#2C2C2C]/60 backdrop-blur-md"
              onClick={closeEditor}
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              style={{ 
                borderRadius: trip.theme.borderRadius === 'full' ? '9999px' : trip.theme.borderRadius === 'lg' ? '1.5rem' : trip.theme.borderRadius === 'md' ? '0.75rem' : trip.theme.borderRadius === 'sm' ? '0.375rem' : '0px',
                borderWidth: `${trip.theme.borderWidth}px`,
                boxShadow: trip.theme.shadow === 'lg' ? '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)' : trip.theme.shadow === 'md' ? '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' : trip.theme.shadow === 'sm' ? '0 1px 2px 0 rgb(0 0 0 / 0.05)' : 'none'
              }}
              className="relative w-full max-w-lg bg-[#FAF9F6] border-[#E5E2DA] overflow-hidden shadow-2xl p-0"
            >
              <div className="p-8 border-b border-[#E5E2DA] flex items-center justify-between bg-white">
                <div>
                  <h3 className="font-serif italic text-2xl text-[#1A1A1A]">Event Details</h3>
                  <p className="text-[10px] uppercase tracking-widest text-[#A19B8F] mt-1">Refining your journey</p>
                </div>
                <button 
                  onClick={closeEditor}
                  className="p-3 hover:bg-[#F9F8F4] text-[#A19B8F] rounded-full transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-10 space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
                <div className="space-y-4">
                  <label className="text-[10px] font-bold text-[#A19B8F] uppercase tracking-[0.2em]">Activity Name</label>
                  <input 
                    autoFocus
                    className="w-full text-3xl font-serif italic bg-transparent border-b border-[#E5E2DA] focus:border-[#D4A373] outline-none transition-all pb-3 text-[#1A1A1A] placeholder-[#E5E2DA]"
                    value={editingItem.item.title}
                    onChange={(e) => updateItem(editingItem.dayId, editingItem.item.id, { title: e.target.value })}
                    placeholder="Temple Visit..."
                  />
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-bold text-[#A19B8F] uppercase tracking-[0.2em]">Map Location Search</label>
                  <div className="flex gap-2">
                    <input 
                      type="text"
                      placeholder="Fuzzy search (e.g. Kyoto Tower...)"
                      className="bg-[#F9F8F4] border-none px-4 py-3 rounded-xl text-sm w-full outline-none focus:ring-2 focus:ring-[#D4A373]/20"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          searchLocation((e.target as HTMLInputElement).value);
                        }
                      }}
                    />
                    <button 
                      onClick={(e) => {
                        const input = e.currentTarget.previousSibling as HTMLInputElement;
                        searchLocation(input.value);
                      }}
                      disabled={isSearchingLocation}
                      className="px-6 bg-[#1A1A1A] text-white rounded-xl text-xs font-bold hover:bg-[#D4A373] transition-all"
                    >
                      {isSearchingLocation ? '...' : 'Search'}
                    </button>
                  </div>

                  {searchResults.length > 0 && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-white border border-[#E5E2DA] rounded-xl overflow-hidden shadow-lg mt-2 absolute z-50 left-10 right-10"
                    >
                      {searchResults.map((res, i) => (
                        <button
                          key={i}
                          onClick={() => selectSearchResult(res)}
                          className="w-full text-left p-3 text-xs hover:bg-[#F9F8F4] border-b border-[#F0EFE9] last:border-0 transition-colors"
                        >
                          <p className="font-bold text-[#1A1A1A]">{res.display_name.split(',')[0]}</p>
                          <p className="text-[10px] text-[#A19B8F] truncate">{res.display_name}</p>
                        </button>
                      ))}
                    </motion.div>
                  )}
                  
                  {editingItem.item.location && (
                    <div className="p-4 bg-[#E8F0E4] rounded-xl border border-[#8FB07C]/30 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                         <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center text-[#3B542E]">
                           <MapPin className="w-4 h-4" />
                         </div>
                         <div>
                            <p className="text-[10px] font-bold text-[#3B542E] uppercase tracking-widest">Pin Dropped At</p>
                            <p className="text-xs text-[#3B542E] font-medium truncate max-w-[200px]">{editingItem.item.location.address}</p>
                         </div>
                      </div>
                      <button 
                        onClick={() => updateItem(editingItem.dayId, editingItem.item.id, { location: undefined })}
                        className="text-[10px] font-bold text-[#8FB07C] hover:text-red-500 uppercase tracking-widest"
                      >
                        Reset
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-bold text-[#A19B8F] uppercase tracking-[0.2em]">Extended Description</label>
                  <textarea 
                    className="w-full min-h-[120px] bg-white border border-[#E5E2DA] rounded-lg p-5 text-sm resize-none outline-none focus:ring-2 focus:ring-[#D4A373]/10 focus:border-[#D4A373] transition-all text-[#2C2C2C] leading-relaxed placeholder-[#E5E2DA]"
                    placeholder="Notes, locations, or reminders..."
                    value={editingItem.item.description}
                    onChange={(e) => updateItem(editingItem.dayId, editingItem.item.id, { description: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-10">
                  <div className="space-y-4">
                    <label className="text-[10px] font-bold text-[#A19B8F] uppercase tracking-[0.2em]">Duration</label>
                    <div className="relative">
                      <select 
                        className="bg-white border border-[#E5E2DA] px-5 py-3 rounded-xl text-sm font-bold w-full outline-none focus:border-[#D4A373] appearance-none"
                        value={editingItem.item.duration}
                        onChange={(e) => updateItem(editingItem.dayId, editingItem.item.id, { duration: parseInt(e.target.value) })}
                      >
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 16].map(h => (
                          <option key={h} value={h}>{h * 0.5} Hours</option>
                        ))}
                      </select>
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-[#A19B8F]">
                        <ChevronRight className="w-4 h-4 rotate-90" />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label className="text-[10px] font-bold text-[#A19B8F] uppercase tracking-[0.2em]">Palette</label>
                    <div className="flex flex-wrap gap-3">
                      {colorPresets.map((preset, i) => (
                        <button
                          key={i}
                          onClick={() => updateItem(editingItem.dayId, editingItem.item.id, { 
                            bgColor: preset.bg, 
                            textColor: preset.text 
                          })}
                          className={cn(
                            "w-10 h-10 rounded-full border-2 transition-all hover:scale-110 relative",
                            editingItem.item.bgColor === preset.bg ? "scale-110 shadow-lg" : "border-transparent"
                          )}
                          style={{ backgroundColor: preset.bg, borderColor: editingItem.item.bgColor === preset.bg ? preset.border : 'transparent' }}
                          title={preset.label}
                        >
                           {editingItem.item.bgColor === preset.bg && <div className="absolute inset-0 flex items-center justify-center"><div className="w-1.5 h-1.5 bg-white rounded-full opacity-50" /></div>}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

               <div className="pt-8 flex gap-4">
                  <button 
                    onClick={saveItem}
                    className="flex-1 py-4 text-[11px] font-bold uppercase tracking-[0.2em] bg-[#1A1A1A] text-white rounded-xl hover:bg-[#D4A373] transition-all active:scale-[0.98] shadow-lg flex items-center justify-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    Save Changes
                  </button>
                  <button 
                    onClick={closeEditor}
                    className="flex-1 py-4 text-[11px] font-bold uppercase tracking-[0.2em] border border-[#E5E2DA] rounded-xl hover:bg-[#F9F8F4] transition-all active:scale-[0.98]"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => {
                       if (confirm('Delete this event permanently?')) {
                         deleteItem(editingItem.dayId, editingItem.item.id);
                       }
                    }}
                    className="px-6 py-4 border border-[#E5E2DA] hover:border-red-200 hover:bg-red-50 text-red-400 rounded-xl transition-all active:scale-[0.98]"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
