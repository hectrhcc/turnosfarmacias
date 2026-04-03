import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Phone, Navigation, MapPin, User, Plus, Loader2, Crosshair, Target, Clock, Map, Layers, Activity } from 'lucide-react';
import { renderToString } from 'react-dom/server';

const MORRO_COORD = { lat: -18.4783, lng: -70.3125 };
const NEARBY_RADIUS_KM = 2;

// --- Custom Icons ---
const createDivIcon = (component, iconSize, extraClass = '') => {
  const html = renderToString(component);
  return L.divIcon({
    html,
    className: `custom-div-icon ${extraClass}`,
    iconSize,
    iconAnchor: [iconSize[0] / 2, iconSize[1]],
    popupAnchor: [0, -iconSize[1]],
  });
};

const UserIconBase = () => (
  <div className="bg-blue-600 p-2 rounded-full border-2 border-white shadow-lg animate-pulse">
    <User className="w-6 h-6 text-white" />
  </div>
);

const NearbyIconBase = () => (
  <div className="bg-green-500 p-1.5 rounded-full border-2 border-white shadow-md">
    <Plus className="w-5 h-5 text-white" strokeWidth={3} />
  </div>
);

const DutyIconBase = () => (
  <div className="relative">
    <div className="absolute inset-0 bg-red-500 rounded-full animate-ping opacity-60"></div>
    <div className="relative bg-red-600 p-2 rounded-full border-[3px] border-white shadow-xl z-10">
      <Clock className="w-5 h-5 text-white" strokeWidth={2.5} />
    </div>
  </div>
);

const TargetIconBase = () => (
  <div className="relative">
    <div className="absolute inset-0 rounded-full animate-ping opacity-70" style={{background: 'radial-gradient(circle, #16a34a, transparent)'}}></div>
    <div className="relative rounded-full border-[4px] border-white shadow-2xl z-10 p-2.5" style={{background: 'linear-gradient(135deg, #16a34a, #15803d)'}}>
      <Target className="w-7 h-7 text-white" strokeWidth={2.5} />
    </div>
  </div>
);

const ClosedIconBase = () => (
  <div className="bg-slate-300 p-1 rounded-full border border-slate-400 opacity-50">
    <Plus className="w-3 h-3 text-slate-500" strokeWidth={2} />
  </div>
);

const userIcon    = createDivIcon(<UserIconBase />, [44, 44]);
const nearbyIcon  = createDivIcon(<NearbyIconBase />, [38, 38], 'z-[800]');
const dutyIcon    = createDivIcon(<DutyIconBase />, [46, 46], 'z-[900]');
const targetIcon  = createDivIcon(<TargetIconBase />, [60, 60], 'z-[2000]');
const closedIcon  = createDivIcon(<ClosedIconBase />, [22, 22], 'z-[300]');

// --- Utils ---
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Attach distance to each pharmacy
function withDistance(pharmacies, userLat, userLng) {
  return pharmacies.map(p => {
    const lat = parseFloat(p.local_lat);
    const lng = parseFloat(p.local_lng);
    if (isNaN(lat) || isNaN(lng)) return { ...p, distance: Infinity };
    return { ...p, distance: haversine(userLat, userLng, lat, lng) };
  }).filter(p => p.distance !== Infinity);
}

// Map auto-bounds updater
function MapController({ mode, userLocation, filteredPharmacies }) {
  const map = useMap();
  useEffect(() => {
    if (!userLocation) return;
    const userLatlng = [userLocation.lat, userLocation.lng];
    if (filteredPharmacies.length === 0) {
      map.setView(userLatlng, 14, { animate: true });
      return;
    }
    const points = [userLatlng, ...filteredPharmacies.map(p => [parseFloat(p.local_lat), parseFloat(p.local_lng)]).filter(([a,b]) => !isNaN(a) && !isNaN(b))];
    if (points.length > 1) {
      map.fitBounds(L.latLngBounds(points), { padding: [80, 80], maxZoom: 16, animate: true });
    } else {
      map.setView(userLatlng, 15, { animate: true });
    }
  }, [mode, userLocation, map]);
  return null;
}

const MODES = [
  { id: 'cercanas', label: 'Cercanas', icon: Activity, color: 'green', desc: 'Radio 2 km' },
  { id: 'turno',    label: 'De Turno', icon: Clock,    color: 'red',   desc: 'Turno legal' },
  { id: 'todas',    label: 'Todas',    icon: Layers,   color: 'slate', desc: 'Todo Arica' },
];

export default function App() {
  const [pharmacies, setPharmacies]         = useState([]);
  const [userLocation, setUserLocation]     = useState(null);
  const [accuracy, setAccuracy]             = useState(0);
  const [usingFallback, setUsingFallback]   = useState(false);
  const [loading, setLoading]               = useState(true);
  const [mode, setMode]                     = useState('cercanas');
  const [isRecalculating, setIsRecalculating] = useState(false);
  const gpsTimeoutRef = useRef(null);

  // --- Derived data ---
  const refLat = userLocation?.lat ?? MORRO_COORD.lat;
  const refLng = userLocation?.lng ?? MORRO_COORD.lng;

  const pharmaciesWithDist = withDistance(pharmacies, refLat, refLng)
    .sort((a, b) => a.distance - b.distance);

  const nearby  = pharmaciesWithDist.filter(p => p.distance <= NEARBY_RADIUS_KM);
  const onDuty  = pharmaciesWithDist.filter(p => p.is_on_duty);
  const all     = pharmaciesWithDist;

  const currentList = mode === 'cercanas' ? nearby : mode === 'turno' ? onDuty : all;
  const primaryPharmacy = currentList[0] ?? null;

  // --- Geolocation ---
  const refreshLocation = useCallback(() => {
    if (gpsTimeoutRef.current) clearTimeout(gpsTimeoutRef.current);
    setIsRecalculating(true);
    if (!navigator.geolocation) {
      setUserLocation(MORRO_COORD);
      setUsingFallback(true);
      setIsRecalculating(false);
      return;
    }
    gpsTimeoutRef.current = setTimeout(() => {
      setUserLocation(MORRO_COORD);
      setUsingFallback(true);
      setIsRecalculating(false);
    }, 15000);

    navigator.geolocation.getCurrentPosition(
      pos => {
        clearTimeout(gpsTimeoutRef.current);
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setAccuracy(pos.coords.accuracy);
        setUsingFallback(false);
        setIsRecalculating(false);
      },
      () => {
        clearTimeout(gpsTimeoutRef.current);
        setUserLocation(MORRO_COORD);
        setUsingFallback(true);
        setIsRecalculating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, []);

  useEffect(() => {
    refreshLocation();
    fetch('/farmacias_arica.json')
      .then(r => r.json())
      .then(result => setPharmacies(result.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
    return () => clearTimeout(gpsTimeoutRef.current);
  }, []);

  if (loading) {
    return (
      <div className="w-full h-screen bg-white flex flex-col items-center justify-center gap-5">
        <Loader2 className="w-14 h-14 text-blue-900 animate-spin" />
        <p className="text-blue-900 font-black text-xl tracking-tight">Farmacias Pro Arica</p>
        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Sincronizando...</p>
      </div>
    );
  }

  const mapCenter = [refLat, refLng];

  return (
    <div className="flex w-full h-screen bg-slate-100 overflow-hidden font-sans">

      {/* ===================== MAPA ===================== */}
      <div className="relative flex-1 h-full">
        <MapContainer center={mapCenter} zoom={14} zoomControl={false} style={{ height: '100%', width: '100%' }} className="z-0">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapController mode={mode} userLocation={userLocation} filteredPharmacies={currentList} />

          {/* Marcador de usuario */}
          {userLocation && (
            <>
              <Marker position={[userLocation.lat, userLocation.lng]} icon={userIcon}>
                <Popup><strong className="text-blue-900">Tu posición</strong>{accuracy > 0 && <><br/><small className="text-slate-500">±{accuracy.toFixed(0)}m</small></>}</Popup>
              </Marker>
              {accuracy > 0 && accuracy < 800 && !usingFallback && (
                <Circle center={[userLocation.lat, userLocation.lng]} radius={accuracy}
                  pathOptions={{ fillColor: '#3b82f6', color: '#3b82f6', fillOpacity: 0.08, weight: 1 }} />
              )}
            </>
          )}

          {/* Marcadores de farmacias */}
          {(mode === 'todas' ? all : mode === 'turno' ? onDuty : nearby).map((pharma, i) => {
            const lat = parseFloat(pharma.local_lat);
            const lng = parseFloat(pharma.local_lng);
            if (isNaN(lat) || isNaN(lng)) return null;
            const isTarget = primaryPharmacy?.local_id === pharma.local_id;
            let icon = closedIcon;
            if (isTarget) icon = targetIcon;
            else if (pharma.is_on_duty) icon = dutyIcon;
            else if (pharma.distance <= NEARBY_RADIUS_KM) icon = nearbyIcon;

            return (
              <Marker key={pharma.local_id} position={[lat, lng]} icon={icon} zIndexOffset={isTarget ? 3000 : (pharma.is_on_duty ? 1000 : 0)}>
                <Popup>
                  <div className="min-w-[160px] p-1">
                    <p className={`font-black text-sm mb-1 ${pharma.is_on_duty ? 'text-red-700' : 'text-slate-700'}`}>{pharma.local_nombre}</p>
                    <p className="text-slate-400 text-xs mb-2">{pharma.local_direccion}</p>
                    <p className={`text-[10px] font-black uppercase tracking-widest ${pharma.is_on_duty ? 'text-red-600' : 'text-slate-400'}`}>
                      {pharma.is_on_duty ? '🔴 DE TURNO' : '⚫ Horario General'}
                    </p>
                    <p className="text-green-700 text-[10px] font-bold mt-1">A {pharma.distance.toFixed(2)} km</p>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>

        {/* Header flotante sobre el mapa */}
        <div className="absolute top-4 left-4 right-4 z-30 pointer-events-none">
          <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-xl px-5 py-3 flex items-center justify-between pointer-events-auto">
            <div>
              <h1 className="text-xl font-black text-blue-900 tracking-tight">Farmacias Arica</h1>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                {mode === 'cercanas' && `${nearby.length} en radio de 2km`}
                {mode === 'turno' && `${onDuty.length} farmacias de turno hoy`}
                {mode === 'todas' && `${all.length} farmacias en Arica`}
              </p>
            </div>
            <button onClick={refreshLocation}
              className="p-2.5 rounded-xl bg-blue-50 text-blue-900 hover:bg-blue-100 transition-colors active:scale-90"
              disabled={isRecalculating}>
              <Crosshair className={`w-5 h-5 ${isRecalculating ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Badge de fallback */}
        {usingFallback && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 z-30">
            <button onClick={refreshLocation}
              className="bg-amber-500 text-white text-[10px] font-black uppercase px-4 py-2 rounded-full shadow-lg flex items-center gap-2 active:scale-95">
              <Crosshair className="w-3 h-3" /> GPS no detectado — Toca para reintentar
            </button>
          </div>
        )}

        {/* ===================== BOTTOM SHEET (MÓVIL) / PANEL LATERAL ===================== */}
        {/* Este contenedor cambia de layout en desktop: se convierte en panel derecho */}
        <div className="absolute bottom-0 left-0 right-0 z-20 md:left-auto md:top-0 md:right-0 md:w-80 md:h-full md:flex md:flex-col">

          {/* Tabs de Modo */}
          <div className="md:hidden bg-white/95 backdrop-blur-md border-t border-slate-100 px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
            <div className="flex gap-2 mb-4">
              {MODES.map(m => {
                const Icon = m.icon;
                const active = mode === m.id;
                const activeClass = m.id === 'cercanas' ? 'bg-green-600 text-white shadow-green-200/80' : m.id === 'turno' ? 'bg-red-600 text-white shadow-red-200/80' : 'bg-slate-700 text-white shadow-slate-200/80';
                return (
                  <button key={m.id} onClick={() => setMode(m.id)}
                    className={`flex-1 flex flex-col items-center py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-tight transition-all shadow-lg ${active ? activeClass : 'bg-slate-100 text-slate-500'}`}>
                    <Icon className="w-4 h-4 mb-1" strokeWidth={active ? 3 : 2} />
                    {m.label}
                  </button>
                );
              })}
            </div>

            {/* Tarjeta principal */}
            {primaryPharmacy ? (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-2">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1 pr-3">
                    <h2 className="text-base font-black text-slate-900 leading-tight">{primaryPharmacy.local_nombre}</h2>
                    <p className="text-slate-400 text-xs mt-1 font-medium">{primaryPharmacy.local_direccion}</p>
                  </div>
                  <div className={`px-3 py-1 rounded-full text-[10px] font-black whitespace-nowrap border ${primaryPharmacy.is_on_duty ? 'bg-red-50 text-red-700 border-red-100' : 'bg-green-50 text-green-700 border-green-100'}`}>
                    A {primaryPharmacy.distance.toFixed(1)} km
                  </div>
                </div>
                {primaryPharmacy.is_on_duty && (
                  <div className="flex items-center gap-1 text-red-600 text-[10px] font-black uppercase tracking-widest mb-3">
                    <div className="w-1.5 h-1.5 bg-red-600 rounded-full animate-ping"></div>
                    DE TURNO OFICIAL HOY
                  </div>
                )}
                <div className="flex gap-2">
                  {primaryPharmacy.local_telefono && (
                    <a href={`tel:${primaryPharmacy.local_telefono}`}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-slate-50 text-slate-800 py-3 border border-slate-100 rounded-xl text-xs font-black">
                      <Phone className="w-4 h-4 text-green-600" /> LLAMAR
                    </a>
                  )}
                  <button onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&origin=${refLat},${refLng}&destination=${primaryPharmacy.local_lat},${primaryPharmacy.local_lng}`, '_blank')}
                    className={`flex-[2] flex items-center justify-center gap-2 text-white py-3 rounded-xl text-xs font-black shadow-lg ${primaryPharmacy.is_on_duty ? 'bg-red-600 shadow-red-200' : 'bg-green-600 shadow-green-200'}`}>
                    <Navigation className="w-4 h-4" />
                    {primaryPharmacy.is_on_duty ? 'IR AL TURNO' : 'VER RUTA'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-slate-400 text-sm font-bold">No hay farmacias en este filtro</p>
              </div>
            )}
          </div>

          {/* ===================== DESKTOP SIDEBAR ===================== */}
          <div className="hidden md:flex flex-col h-full bg-white/95 backdrop-blur-md border-l border-slate-100 shadow-2xl">
            {/* Header sidebar */}
            <div className="p-6 border-b border-slate-100">
              <h1 className="text-2xl font-black text-blue-900 tracking-tight mb-1">Farmacias Arica</h1>
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Turnos y Cercanía</p>
            </div>

            {/* Tabs Desktop */}
            <div className="p-4 border-b border-slate-100">
              <div className="flex flex-col gap-2">
                {MODES.map(m => {
                  const Icon = m.icon;
                  const active = mode === m.id;
                  const colors = {
                    cercanas: active ? 'bg-green-600 text-white' : 'text-green-700 hover:bg-green-50',
                    turno:    active ? 'bg-red-600 text-white'   : 'text-red-700 hover:bg-red-50',
                    todas:    active ? 'bg-slate-700 text-white' : 'text-slate-600 hover:bg-slate-50',
                  };
                  return (
                    <button key={m.id} onClick={() => setMode(m.id)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-black transition-all ${colors[m.id]}`}>
                      <Icon className="w-5 h-5" />
                      <span>{m.label}</span>
                      <span className="ml-auto text-[10px] font-bold opacity-70">{m.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Lista de farmacias en sidebar */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {currentList.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-sm">Sin resultados para este modo</div>
              ) : currentList.map((pharma, i) => {
                const isTarget = pharma.local_id === primaryPharmacy?.local_id;
                return (
                  <div key={pharma.local_id}
                    className={`p-4 rounded-2xl border transition-all ${isTarget ? 'border-2 border-green-500 bg-green-50/50 shadow-md shadow-green-100' : 'border-slate-100 bg-white hover:shadow-sm'}`}>
                    <div className="flex justify-between items-start mb-1">
                      <p className={`font-black text-sm ${isTarget ? 'text-slate-900' : 'text-slate-700'}`}>{pharma.local_nombre}</p>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ml-2 ${pharma.is_on_duty ? 'bg-red-50 text-red-600 border-red-100' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
                        {pharma.distance.toFixed(1)} km
                      </span>
                    </div>
                    <p className="text-slate-400 text-[11px] font-medium mb-2">{pharma.local_direccion}</p>
                    {pharma.is_on_duty && (
                      <span className="text-[9px] bg-red-100 text-red-700 font-black px-2 py-0.5 rounded-full uppercase tracking-widest">🔴 De Turno</span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Tarjeta Acción Sidebar */}
            {primaryPharmacy && (
              <div className="p-4 border-t border-slate-100 bg-white space-y-3">
                <div>
                  <h2 className="font-black text-lg text-slate-900 leading-tight">{primaryPharmacy.local_nombre}</h2>
                  <p className="text-slate-400 text-xs font-medium mt-1">{primaryPharmacy.local_direccion}</p>
                </div>
                <div className="flex gap-2">
                  {primaryPharmacy.local_telefono && (
                    <a href={`tel:${primaryPharmacy.local_telefono}`}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-slate-50 border border-slate-100 text-slate-900 py-3 rounded-xl text-xs font-black">
                      <Phone className="w-4 h-4 text-green-600" /> LLAMAR
                    </a>
                  )}
                  <button onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&origin=${refLat},${refLng}&destination=${primaryPharmacy.local_lat},${primaryPharmacy.local_lng}`, '_blank')}
                    className={`flex-[2] flex items-center justify-center gap-2 text-white py-3 rounded-xl text-sm font-black shadow-lg ${primaryPharmacy.is_on_duty ? 'bg-red-600 shadow-red-200' : 'bg-green-600 shadow-green-200'}`}>
                    <Navigation className="w-4 h-4" />
                    {primaryPharmacy.is_on_duty ? 'IR AL TURNO' : 'VER RUTA'}
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>

    </div>
  );
}
