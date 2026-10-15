import { useEffect, useRef, useState } from 'react';

// Google Places API (New). The key is public by design: restrict it by HTTP referrer in Google Cloud.
const KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
const EDMONTON = { lat: 53.5461, lng: -113.4938 }; // ranks nearby results first; still allows all of Canada

let placesLib: Promise<any> | null = null;
function loadPlaces(): Promise<any> {
  if (!KEY) return Promise.reject(new Error('No Google Maps key configured'));
  if (placesLib) return placesLib;
  placesLib = new Promise((resolve, reject) => {
    const w = window as any;
    const ready = () => w.google.maps.importLibrary('places').then(resolve, reject);
    if (w.google?.maps?.importLibrary) return ready();
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(KEY)}&loading=async&v=weekly`;
    s.async = true;
    s.onload = ready;
    s.onerror = () => reject(new Error('Google Maps failed to load'));
    document.head.appendChild(s);
  });
  placesLib.catch(() => { placesLib = null; });
  return placesLib;
}

type Item = { text: string; prediction: any };
type Props = { id: string; value: string; onChange: (v: string) => void; placeholder?: string };

/** A normal text input that suggests Canadian addresses. With no key, or if Google fails, it stays a plain input. */
export default function AddressInput({ id, value, onChange, placeholder }: Props) {
  const lib = useRef<any>(null);
  const token = useRef<any>(null);
  const seq = useRef(0);
  const timer = useRef<number>();
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  useEffect(() => {
    let alive = true;
    loadPlaces().then((l) => { if (alive) { lib.current = l; token.current = new l.AutocompleteSessionToken(); } }).catch(() => {});
    return () => { alive = false; window.clearTimeout(timer.current); };
  }, []);

  function onType(next: string) {
    onChange(next);
    window.clearTimeout(timer.current);
    if (!lib.current || next.trim().length < 3) { setItems([]); setOpen(false); return; }
    const mine = ++seq.current; // drop answers that arrive after newer keystrokes
    timer.current = window.setTimeout(async () => {
      try {
        const { suggestions } = await lib.current.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: next, sessionToken: token.current, includedRegionCodes: ['ca'], origin: EDMONTON
        });
        if (mine !== seq.current) return;
        const list: Item[] = (suggestions as any[]).slice(0, 5).map((s) => ({ text: s.placePrediction.text.text, prediction: s.placePrediction }));
        setItems(list); setOpen(list.length > 0); setActive(-1);
      } catch { setItems([]); setOpen(false); }
    }, 250);
  }

  async function choose(item: Item) {
    setOpen(false); setItems([]);
    let address = item.text;
    try {
      const place = item.prediction.toPlace();
      await place.fetchFields({ fields: ['formattedAddress'] });
      if (place.formattedAddress) address = place.formattedAddress;
    } catch { /* the suggestion text is still a usable address */ }
    onChange(address.replace(/,\s*Canada$/, ''));
    token.current = new lib.current.AutocompleteSessionToken(); // a new session starts after each pick
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % items.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a <= 0 ? items.length - 1 : a - 1)); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); choose(items[active]); }
    else if (e.key === 'Escape') setOpen(false);
  }

  return (
    <div className="relative">
      <input
        id={id} className="field" required autoComplete="off" value={value} placeholder={placeholder}
        role="combobox" aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${id}-opt-${active}` : undefined}
        onChange={(e) => onType(e.target.value)} onKeyDown={onKeyDown}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
      />
      {open && (
        <ul id={`${id}-list`} role="listbox" className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          {items.map((it, i) => (
            <li
              key={it.text} id={`${id}-opt-${i}`} role="option" aria-selected={i === active}
              className={`cursor-pointer px-3 py-2 text-sm font-normal ${i === active ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
              onMouseDown={(e) => { e.preventDefault(); choose(it); }}
            >{it.text}</li>
          ))}
          <li className="border-t border-slate-100 px-3 py-1 text-right text-[10px] text-slate-400" aria-hidden>Powered by Google</li>
        </ul>
      )}
    </div>
  );
}
