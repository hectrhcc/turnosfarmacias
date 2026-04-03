import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Phone, Navigation, MapPin, User, Plus, Info, Loader2, AlertCircle, Crosshair, RefreshCw, Calendar, Clock } from 'lucide-react';
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
  <div className="bg-blue-500 p-2 rounded-full border-2 border-white shadow-lg animate-pulse">
    <User className="w-6 h-6 text-white" />
  </div>
);

const NearestIconBase = () => (
  <div className="bg-red-600 p-2 rounded-full border-[3px] border-white shadow-2xl scale-110">
    <Plus className="w-8 h-8 text-white" strokeWidth={4} />
  </div>
);

const OtherIconBase = () => (
  <div className="bg-slate-300 p-1.5 rounded-full border-[2px] border-slate-400 shadow-sm opacity-60 grayscale">
    <Plus className="w-4 h-4 text-slate-600" strokeWidth={3} />
  </div>
);

const userIcon = createDivIcon(<UserIconBase />, [44, 44]);
const nearestIcon = createDivIcon(<NearestIconBase />, [56, 56], 'z-[1000]');
const otherIcon = createDivIcon(<OtherIconBase />, [32, 32]);

// --- Utils ---
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  const R = 6371; 
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); 
  return R * c; 
}

function MapUpdater({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView(center, 15);
    }
  }, [center, map]);
  return null;
}

function App() {
  const [pharmacies, setPharmacies] = useState([]);
  const [userLocation, setUserLocation] = useState(null);
  const [accuracy, setAccuracy] = useState(0);
  const [nearestPharmacy, setNearestPharmacy] = useState(null);
  const [lastUpdated, setLastUpdated] = useState('');
  const [usingFallback, setUsingFallback] = useState(false);
  const [loading, setLoading] = useState(true);
  const [gpsStatus, setGpsStatus] = useState('Iniciando...');
  const [isRecalculating, setIsRecalculating] = useState(false);
  const gpsTimeoutRef = useRef(null);

  const refreshLocation = useCallback(() => {
    if (gpsTimeoutRef.current) clearTimeout(gpsTimeoutRef.current);
    setIsRecalculating(true);
    setGpsStatus('Buscando señal...');
    if (!navigator.geolocation) {
      setUserLocation(MORRO_COORD);
      setUsingFallback(true);
      setIsRecalculating(false);
      return;
    }
    gpsTimeoutRef.current = setTimeout(() => {
      if (!userLocation || isRecalculating) {
         setUserLocation(MORRO_COORD);
         setUsingFallback(true);
         setIsRecalculating(false);
      }
    }, 15000);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (gpsTimeoutRef.current) clearTimeout(gpsTimeoutRef.current);
        setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
        setAccuracy(position.coords.accuracy);
        setUsingFallback(false);
        setIsRecalculating(false);
        setGpsStatus('Posición fijada');
      },
      (err) => {
        if (gpsTimeoutRef.current) clearTimeout(gpsTimeoutRef.current);
        setUserLocation(MORRO_COORD);
        setUsingFallback(true);
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
        const resStatic = await fetch('/farmacias_arica.json').catch(() => null);
        if (resStatic && resStatic.ok) {
           const result = await resStatic.json();
           setPharmacies(result.data || []);
           setLastUpdated(result.last_updated);
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
      let nearest = null;
      let minDistance = Infinity;

      // Buscamos la más cercana SÓLO entre las que están de turno
      pharmacies.filter(p => p.is_on_duty).forEach(pharma => {
        const lat = parseFloat(pharma.local_lat);
        const lng = parseFloat(pharma.local_lng);
        if (isNaN(lat) || isNaN(lng)) return;
        const dist = getDistanceFromLatLonInKm(userLocation.lat, userLocation.lng, lat, lng);
        if (dist < minDistance) {
          minDistance = dist;
          nearest = { ...pharma, distance: dist };
        }
      });
      setNearestPharmacy(nearest);
    }
  }, [userLocation, pharmacies]);

  if (loading) {
    return (
      <div className="w-full h-screen bg-white flex flex-col items-center justify-center space-y-8 p-6 text-center">
        <Loader2 className="w-20 h-20 text-blue-900 animate-spin" />
        <h2 className="text-blue-900 text-3xl font-extrabold tracking-tight">Farmacias Arica</h2>
        <p className="text-slate-500 font-medium">{gpsStatus}</p>
      </div>
    );
  }

  const mapCenter = userLocation ? [userLocation.lat, userLocation.lng] : [MORRO_COORD.lat, MORRO_COORD.lng];

  return (
    <div className="relative w-full h-screen bg-white text-slate-800 flex flex-col font-sans overflow-hidden">
      
      {/* Header Mobile V5 */}
      <header className="absolute top-0 left-0 w-full z-20 bg-white/95 backdrop-blur-md px-6 py-4 shadow-sm border-b border-slate-100 flex flex-col items-center">
        <h1 className="text-4xl font-extrabold text-blue-900 text-center tracking-tight">
          Farmacias Arica
        </h1>
        <div className="text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-widest flex items-center gap-2">
           <Clock className="w-3 h-3" />
           Turnos de hoy resaltados en Rojo
        </div>
      </header>

      {/* Floating GPS Retrying Alert */}
      {usingFallback && (
        <div className="absolute top-[105px] left-0 w-full flex justify-center z-20 px-4 pointer-events-none">
          <button 
            onClick={refreshLocation}
            className="bg-red-600 text-white py-2 px-6 rounded-full text-xs font-extrabold shadow-2xl flex items-center gap-3 pointer-events-auto border-2 border-white transition-all scale-105 active:scale-95"
          >
            <Crosshair className="w-4 h-4" />
            Recalibrar señal GPS
          </button>
        </div>
      )}

      {/* Mapa */}
      <div className="flex-1 w-full relative z-0">
        <MapContainer center={mapCenter} zoom={15} zoomControl={false} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapUpdater center={mapCenter} />
          
          {userLocation && (
            <>
              <Marker position={[userLocation.lat, userLocation.lng]} icon={userIcon}>
                <Popup className="font-bold text-blue-900">Ubicación Actual</Popup>
              </Marker>
              {accuracy > 0 && !usingFallback && (
                <Circle 
                  center={[userLocation.lat, userLocation.lng]}
                  radius={accuracy}
                  pathOptions={{ fillColor: '#3b82f6', color: '#3b82f6', fillOpacity: 0.15, weight: 1, dashArray: '5, 5' }}
                />
              )}
            </>
          )}

          {pharmacies.map(pharma => {
            const lat = parseFloat(pharma.local_lat);
            const lng = parseFloat(pharma.local_lng);
            if (isNaN(lat) || isNaN(lng)) return null;

            const isNearest = nearestPharmacy && nearestPharmacy.local_id === pharma.local_id;
            const markerIcon = pharma.is_on_duty ? nearestIcon : otherIcon;

            return (
              <Marker 
                key={pharma.local_id} 
                position={[lat, lng]} 
                icon={markerIcon}
                zIndexOffset={pharma.is_on_duty ? 1000 : 0}
              >
                <Popup className="min-w-[180px]">
                  <div className="text-slate-800 flex flex-col gap-1 p-1">
                    <strong className={`${pharma.is_on_duty ? 'text-red-600' : 'text-slate-600'} text-lg leading-tight`}>
                      {pharma.local_nombre} 
                      {pharma.is_on_duty && <span className="block text-[10px] uppercase font-black text-red-500">¡DE TURNO!</span>}
                    </strong>
                    <span className="text-slate-500 text-sm">{pharma.local_direccion}</span>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>

        {/* FAB: Recalcular */}
        {!isRecalculating && (
          <button 
            onClick={refreshLocation}
            className="absolute right-6 bottom-32 z-30 bg-white p-4 rounded-full shadow-2xl border border-slate-100 text-blue-900 active:scale-95 transition-all outline-none"
          >
            <Crosshair className="w-7 h-7" />
          </button>
        )}
      </div>

      {/* Botonera Flotante Inferior (SÓLO para la más cercana DE TURNO) */}
      {nearestPharmacy && (
        <div className="absolute bottom-0 w-full z-20 pb-8 px-4 bg-gradient-to-t from-white via-white/80 to-transparent flex flex-col items-center">
          
          <div className="bg-white border border-red-100 rounded-[32px] p-6 shadow-2xl w-full max-w-md mx-auto border-t-[6px] border-t-red-600">
            <div className="flex justify-between items-start mb-4">
               <div>
                  <h2 className="text-2xl font-black text-slate-900 leading-none mb-1">
                    {nearestPharmacy.local_nombre}
                  </h2>
                  <p className="text-red-600 text-[10px] font-black uppercase tracking-widest mb-2 flex items-center gap-1">
                     <Clock className="w-3 h-3" /> Turno Abierto Hoy
                  </p>
                  <p className="text-slate-500 text-sm">{nearestPharmacy.local_direccion}</p>
               </div>
               <div className="bg-red-50 text-red-700 px-3 py-1 rounded-full text-xs font-black border border-red-100">
                  A {nearestPharmacy.distance.toFixed(1)} km
               </div>
            </div>

            <div className="flex gap-3 mb-6">
                {nearestPharmacy.local_telefono && (
                  <a 
                    href={`tel:${nearestPharmacy.local_telefono}`} 
                    className="flex-1 flex items-center justify-center gap-2 bg-slate-50 text-blue-900 py-4 border border-slate-200 rounded-3xl text-sm font-bold shadow-sm"
                  >
                    <Phone className="w-5 h-5 text-red-600" />
                    Llamar Urgencia
                  </a>
                )}
            </div>

            <button 
              onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&origin=${userLocation ? userLocation.lat : MORRO_COORD.lat},${userLocation ? userLocation.lng : MORRO_COORD.lng}&destination=${nearestPharmacy.local_lat},${nearestPharmacy.local_lng}`, '_blank')}
              className="w-full flex items-center justify-center gap-3 bg-red-600 text-white font-extrabold text-xl py-5 rounded-[40px] shadow-2xl active:scale-[0.98] transition-all"
            >
              <Navigation className="w-7 h-7" />
              <span>IR AL TURNO</span>
            </button>
          </div>

          <p className="text-[9px] text-slate-400 font-bold mt-4 tracking-tighter uppercase text-center px-4">
            Actualizado: {new Date(lastUpdated).toLocaleDateString()}
          </p>
        </div>
      )}

    </div>
  );
}

export default App;
