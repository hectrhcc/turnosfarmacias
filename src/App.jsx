import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Phone, Navigation, MapPin, User, Plus, Info, Loader2, AlertCircle, Crosshair, Clock, Target, Eye, EyeOff } from 'lucide-react';
import { renderToString } from 'react-dom/server';

const MORRO_COORD = { lat: -18.4783, lng: -70.3125 };

// --- Custom Icons ---
const createDivIcon = (component, iconSize = [40, 40], extraClass = '') => {
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

const TargetDutyIconBase = () => (
  <div className="relative">
    <div className="absolute inset-0 bg-red-500 rounded-full animate-ping opacity-75 blur-sm"></div>
    <div className="relative bg-red-600 p-2 rounded-full border-[4px] border-white shadow-2xl scale-125 z-10">
      <Target className="w-8 h-8 text-white" strokeWidth={3} />
    </div>
  </div>
);

const OtherDutyIconBase = () => (
  <div className="bg-red-500 p-1.5 rounded-full border-[2px] border-white shadow-lg">
    <Plus className="w-4 h-4 text-white" strokeWidth={4} />
  </div>
);

const GeneralIconBase = () => (
   <div className="bg-slate-200 p-1 rounded-full border-[1.5px] border-slate-300 opacity-40 grayscale scale-75">
    <Plus className="w-3 h-3 text-slate-400" strokeWidth={2} />
  </div>
);

const userIcon = createDivIcon(<UserIconBase />, [44, 44]);
const targetDutyIcon = createDivIcon(<TargetDutyIconBase />, [60, 60], 'z-[2000]');
const otherDutyIcon = createDivIcon(<OtherDutyIconBase />, [34, 34], 'z-[1000]');
const generalIcon = createDivIcon(<GeneralIconBase />, [28, 28], 'z-[500]');

// --- Utils ---
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lng2) {
  const R = 6371; 
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lng2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); 
  return R * c; 
}

function MapUpdater({ center, targetMarker }) {
  const map = useMap();
  useEffect(() => {
    if (center && targetMarker) {
      const bounds = L.latLngBounds([center, targetMarker]);
      map.fitBounds(bounds, { padding: [100, 100], maxZoom: 15, animate: true });
    } else if (center) {
      map.setView(center, 15);
    }
  }, [center, targetMarker, map]);
  return null;
}

function App() {
  const [pharmacies, setPharmacies] = useState([]);
  const [userLocation, setUserLocation] = useState(null);
  const [accuracy, setAccuracy] = useState(0);
  const [farmaciaObjetivo, setFarmaciaObjetivo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [gpsStatus, setGpsStatus] = useState('Localizando...');
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [showGeneral, setShowGeneral] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const gpsTimeoutRef = useRef(null);

  const refreshLocation = useCallback(() => {
    if (gpsTimeoutRef.current) clearTimeout(gpsTimeoutRef.current);
    setIsRecalculating(true);
    setGpsStatus('Buscando señal GPS...');
    
    if (!navigator.geolocation) {
      setUserLocation(MORRO_COORD);
      setIsRecalculating(false);
      return;
    }

    gpsTimeoutRef.current = setTimeout(() => {
      if (!userLocation || isRecalculating) {
         setUserLocation(MORRO_COORD);
         setIsRecalculating(false);
      }
    }, 15000);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (gpsTimeoutRef.current) clearTimeout(gpsTimeoutRef.current);
        setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
        setAccuracy(position.coords.accuracy);
        setIsRecalculating(false);
      },
      (err) => {
        if (gpsTimeoutRef.current) clearTimeout(gpsTimeoutRef.current);
        setUserLocation(MORRO_COORD);
        setIsRecalculating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, [userLocation, isRecalculating]);

  useEffect(() => {
    refreshLocation();
    const fetchPharmacies = async () => {
      try {
        setLoading(true);
        const res = await fetch('/farmacias_arica.json').catch(() => null);
        if (res && res.ok) {
           const result = await res.json();
           setPharmacies(result.data || []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchPharmacies();
  }, []);

  useEffect(() => {
    if (userLocation && pharmacies.length > 0) {
      const dutyPharmaciesWithDist = pharmacies
        .filter(p => p.is_on_duty)
        .map(p => {
           const lat = parseFloat(p.local_lat);
           const lng = parseFloat(p.local_lng);
           if (isNaN(lat) || isNaN(lng)) return { ...p, distance: Infinity };
           return { ...p, distance: getDistanceFromLatLonInKm(userLocation.lat, userLocation.lng, lat, lng) };
        })
        .filter(p => p.distance !== Infinity)
        .sort((a, b) => a.distance - b.distance);

      if (dutyPharmaciesWithDist.length > 0) {
         setFarmaciaObjetivo(dutyPharmaciesWithDist[0]);
      }
    }
  }, [userLocation, pharmacies]);

  if (loading) {
    return (
      <div className="w-full h-screen bg-white flex flex-col items-center justify-center space-y-4 p-6 text-center">
        <Loader2 className="w-12 h-12 text-blue-900 animate-spin" />
        <h2 className="text-blue-900 text-xl font-bold">Cargando Turnos...</h2>
      </div>
    );
  }

  const mapCenter = userLocation ? [userLocation.lat, userLocation.lng] : [MORRO_COORD.lat, MORRO_COORD.lng];
  const goalCoord = farmaciaObjetivo ? [parseFloat(farmaciaObjetivo.local_lat), parseFloat(farmaciaObjetivo.local_lng)] : null;

  return (
    <div className="relative w-full h-screen bg-white text-slate-800 flex flex-col font-sans overflow-hidden">
      
      {/* Header Centralizado */}
      <header className="absolute top-0 left-0 w-full z-20 bg-white/95 backdrop-blur-md px-6 py-4 shadow-sm border-b border-slate-50 flex flex-col items-center">
        <h1 className="text-3xl font-black text-blue-900 text-center tracking-tighter" onClick={() => setShowDebug(!showDebug)}>
          Farmacias Arica
        </h1>
        <div className="text-[10px] font-black text-red-600 mt-1 uppercase tracking-widest flex items-center gap-2">
           <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse"></div>
           FARMACIA DE TURNO ABIERTA
        </div>
      </header>

      {/* Debug Info */}
      {showDebug && (
        <div className="absolute top-[85px] right-4 z-[100] bg-black/80 text-white p-3 rounded-lg text-[10px] font-mono pointer-events-none">
          <p>T:{pharmacies.length} D:{pharmacies.filter(p => p.is_on_duty).length}</p>
          <p>GPS:{userLocation?.lat.toFixed(3)},{userLocation?.lng.toFixed(3)}</p>
        </div>
      )}

      {/* Mapa */}
      <div className="flex-1 w-full relative z-0">
        <MapContainer center={mapCenter} zoom={15} zoomControl={false} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapUpdater center={userLocation ? [userLocation.lat, userLocation.lng] : null} targetMarker={goalCoord} />
          
          {userLocation && (
            <>
              <Marker position={[userLocation.lat, userLocation.lng]} icon={userIcon}>
                <Popup className="font-bold">Tu posición</Popup>
              </Marker>
              {accuracy > 0 && accuracy < 500 && (
                <Circle 
                  center={[userLocation.lat, userLocation.lng]}
                  radius={accuracy}
                  pathOptions={{ fillColor: '#3b82f6', color: '#3b82f6', fillOpacity: 0.1, weight: 1 }}
                />
              )}
            </>
          )}

          {pharmacies.map(pharma => {
            const lat = parseFloat(pharma.local_lat);
            const lng = parseFloat(pharma.local_lng);
            if (isNaN(lat) || isNaN(lng)) return null;

            const isTarget = farmaciaObjetivo && farmaciaObjetivo.local_id === pharma.local_id;
            const markerIcon = isTarget ? targetDutyIcon : (pharma.is_on_duty ? otherDutyIcon : generalIcon);

            // Mostrar locales normales sólo si showGeneral es true
            if (!pharma.is_on_duty && !isTarget && !showGeneral) return null;

            return (
              <Marker 
                key={pharma.local_id} 
                position={[lat, lng]} 
                icon={markerIcon}
                zIndexOffset={isTarget ? 3000 : (pharma.is_on_duty ? 1000 : 0)}
              >
                <Popup className="min-w-[150px]">
                  <div className="p-1">
                    <strong className={`${pharma.is_on_duty ? 'text-red-700' : 'text-slate-500'} text-sm block mb-1`}>
                      {pharma.local_nombre} 
                    </strong>
                    <span className="text-slate-400 text-[10px] block">{pharma.local_direccion}</span>
                    {!pharma.is_on_duty && (
                       <span className="text-slate-300 text-[9px] font-bold block mt-2">Cerrada (Horario General)</span>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>

        {/* FABs Area */}
        <div className="absolute right-6 bottom-32 z-30 flex flex-col gap-3">
          <button 
            onClick={() => setShowGeneral(!showGeneral)}
            className={`p-4 rounded-full shadow-2xl border transition-all flex items-center justify-center gap-2 ${showGeneral ? 'bg-blue-600 text-white border-blue-500' : 'bg-white text-blue-900 border-slate-100'}`}
            title="Ver farmacias normales"
          >
            {showGeneral ? <EyeOff className="w-6 h-6" /> : <Eye className="w-6 h-6" />}
            {showGeneral && <span className="text-[10px] font-black uppercase">Ocultar Grales</span>}
          </button>
          
          <button 
            onClick={refreshLocation}
            className="bg-white p-4 rounded-full shadow-2xl border border-slate-100 text-blue-900 active:scale-90 transition-all flex items-center justify-center"
            title="Actualizar GPS"
          >
            <Crosshair className={`w-7 h-7 ${isRecalculating ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Tarjeta Principal Unificada */}
      {farmaciaObjetivo && (
        <div className="absolute bottom-0 w-full z-20 pb-10 px-4 bg-gradient-to-t from-white via-white/80 to-transparent flex flex-col items-center pt-8">
          
          <div className="bg-white border-t-[8px] border-red-600 rounded-[35px] p-8 shadow-[0_-20px_50px_-12px_rgba(220,38,38,0.25)] w-full max-w-md mx-auto relative overflow-hidden">
            <div className="absolute top-0 right-0 p-5">
               <div className="bg-red-50 text-red-700 px-4 py-2 rounded-full text-xs font-black border border-red-100 shadow-sm whitespace-nowrap">
                  A {farmaciaObjetivo.distance.toFixed(2)} KM
               </div>
            </div>

            <div className="mb-6 pr-20">
              <h2 className="text-2xl font-black text-slate-900 leading-none mb-2">
                {farmaciaObjetivo.local_nombre}
              </h2>
              <div className="text-red-600 text-[10px] font-black uppercase tracking-widest mb-3 flex items-center gap-2">
                 <div className="w-2 h-2 bg-red-600 rounded-full animate-ping"></div>
                 FARMACIA DE TURNO MÁS CERCANA
              </div>
              <p className="text-slate-400 text-sm font-bold flex items-center gap-2">
                <MapPin className="w-4 h-4 text-slate-300" />
                {farmaciaObjetivo.local_direccion}
              </p>
            </div>

            <div className="flex gap-3 mb-6">
                {farmaciaObjetivo.local_telefono && (
                  <a 
                    href={`tel:${farmaciaObjetivo.local_telefono}`} 
                    className="flex-1 flex items-center justify-center gap-2 bg-slate-50 text-slate-900 py-4 border border-slate-200 rounded-[25px] text-sm font-black shadow-sm"
                  >
                    <Phone className="w-4 h-4 text-red-600" />
                    LLAMAR
                  </a>
                )}
            </div>

            <button 
              onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&origin=${userLocation?.lat},${userLocation?.lng}&destination=${farmaciaObjetivo.local_lat},${farmaciaObjetivo.local_lng}`, '_blank')}
              className="w-full flex items-center justify-center gap-4 bg-red-600 hover:bg-red-700 text-white font-black text-xl py-6 rounded-[30px] shadow-[0_20px_40px_-5px_rgba(220,38,38,0.4)] active:scale-[0.98] transition-all"
            >
              <Navigation className="w-7 h-7" />
              <span>TRAZAR RUTA</span>
            </button>
          </div>
          
          <p className="text-[10px] text-slate-300 font-bold mt-4 tracking-tight uppercase text-center bg-slate-50 px-4 py-1 rounded-full">
            {pharmacies.length} farmacias en base de datos
          </p>
        </div>
      )}

    </div>
  );
}

export default App;
