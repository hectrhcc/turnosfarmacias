import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Phone, Navigation, MapPin, User, Plus, Info, Loader2, AlertCircle, Crosshair, RefreshCw } from 'lucide-react';
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
  <div className="bg-green-600 p-1.5 rounded-full border-[2px] border-white shadow-md opacity-90">
    <Plus className="w-5 h-5 text-white" strokeWidth={3} />
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
  const [usingFallback, setUsingFallback] = useState(false);
  const [isMocked, setIsMocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [gpsStatus, setGpsStatus] = useState('Iniciando...');
  const [isRecalculating, setIsRecalculating] = useState(false);
  const gpsTimeoutRef = useRef(null);

  // 1. Geolocalización blindada (Timeout de 15s)
  const refreshLocation = useCallback(() => {
    if (gpsTimeoutRef.current) clearTimeout(gpsTimeoutRef.current);
    
    setIsRecalculating(true);
    setGpsStatus('Buscando satélites GPS... (Esto puede tardar unos segundos)');

    if (!navigator.geolocation) {
      setGpsStatus('GPS no disponible');
      setUserLocation(MORRO_COORD);
      setUsingFallback(true);
      setIsRecalculating(false);
      return;
    }

    // Timer de seguridad para el Fallback (15s reales)
    gpsTimeoutRef.current = setTimeout(() => {
      if (!userLocation || isRecalculating) {
         console.warn("GPS Timeout (15s) reached, applying Fallback.");
         setUserLocation(MORRO_COORD);
         setUsingFallback(true);
         setIsRecalculating(false);
         setGpsStatus('Timeout: Usando Morro de Arica');
      }
    }, 15000);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (gpsTimeoutRef.current) clearTimeout(gpsTimeoutRef.current);
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
        setAccuracy(position.coords.accuracy);
        setUsingFallback(false);
        setIsRecalculating(false);
        setGpsStatus('Ubicación precisa obtenida');
      },
      (err) => {
        if (gpsTimeoutRef.current) clearTimeout(gpsTimeoutRef.current);
        console.error("GPS Error:", err.message);
        setUserLocation(MORRO_COORD);
        setUsingFallback(true);
        setIsRecalculating(false);
        setGpsStatus('Error GPS: Usando Morro de Arica');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, [userLocation, isRecalculating]);

  // 2. Fetch Farmacias (Con limpieza robusta)
  useEffect(() => {
    refreshLocation();
    
    const fetchPharmacies = async () => {
      try {
        setLoading(true);
        // Intentamos nuestra API de Vercel (que tiene Mock interno si falla Minsal)
        const res = await fetch('/api/farmacias').catch(() => null);
        let dataToSet = [];
        
        if (res && res.ok) {
          const result = await res.json();
          dataToSet = result.data || [];
          setIsMocked(result.isMocked || false);
        } else {
           // Si Vercel falla, intentamos AllOrigins como última opción (CORS Proxy alternativo)
           const altRes = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent('https://midas.minsal.cl/farmacia_v2/WS/getLocalesTurnos.php')}`);
           const altJson = await altRes.json();
           const rawData = JSON.parse(altJson.contents);
           dataToSet = rawData.filter(f => f.comuna_nombre && f.comuna_nombre.trim().toUpperCase() === 'ARICA');
           setIsMocked(false);
        }
        
        setPharmacies(dataToSet);
      } catch (err) {
        console.error("Critical Fetch Error:", err);
        setIsMocked(true); // Forzamos mensaje de error/mock
      } finally {
        setLoading(false);
      }
    };
    fetchPharmacies();

    return () => { if (gpsTimeoutRef.current) clearTimeout(gpsTimeoutRef.current); };
  }, []);

  // 3. Calculo de Distancia
  useEffect(() => {
    if (userLocation && pharmacies.length > 0) {
      let nearest = null;
      let minDistance = Infinity;

      pharmacies.forEach(pharma => {
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
        <div className="relative">
          <Loader2 className="w-20 h-20 text-blue-900 animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <MapPin className="text-blue-900 w-8 h-8 opacity-50" />
          </div>
        </div>
        <div className="space-y-3">
          <h2 className="text-blue-900 text-3xl font-extrabold tracking-tight">Sincronizando Turnos</h2>
          <p className="text-slate-500 font-medium px-4">{gpsStatus}</p>
        </div>
      </div>
    );
  }

  const mapCenter = userLocation ? [userLocation.lat, userLocation.lng] : [MORRO_COORD.lat, MORRO_COORD.lng];

  return (
    <div className="relative w-full h-screen bg-white text-slate-800 flex flex-col font-sans overflow-hidden">
      
      {/* Header Mobile V3 */}
      <header className="absolute top-0 left-0 w-full z-20 bg-white/95 backdrop-blur-md px-6 py-4 shadow-sm border-b border-slate-100 flex flex-col items-center">
        <h1 className="text-4xl font-extrabold text-blue-900 text-center tracking-tight">
          Farmacias Arica
        </h1>
        <div className="text-[10px] font-bold text-green-700 mt-1 uppercase tracking-widest flex items-center gap-2">
          {isMocked ? <AlertCircle className="w-3 h-3 text-orange-600" /> : <RefreshCw className="w-3 h-3 animate-spin-slow" />}
          {isMocked ? <span className="text-orange-600 group">Modo Contingencia (Servidor Fallando)</span> : "Turnos Reales Actualizados"}
        </div>
      </header>

      {/* Floating GPS Retrying Alert */}
      {usingFallback && (
        <div className="absolute top-[105px] left-0 w-full flex justify-center z-20 px-4 pointer-events-none">
          <button 
            onClick={refreshLocation}
            className="bg-red-600 text-white py-2 px-6 rounded-full text-xs font-extrabold shadow-2xl flex items-center gap-3 pointer-events-auto border-2 border-white hover:bg-red-700 transition-all scale-105 active:scale-95"
          >
            <Crosshair className="w-4 h-4 animate-pulse" />
            ¿No es tu ubicación? Clic para reintentar GPS
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
                <Popup className="font-bold text-blue-900">Estás aquí</Popup>
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
            const distPop = getDistanceFromLatLonInKm(userLocation ? userLocation.lat : MORRO_COORD.lat, userLocation ? userLocation.lng : MORRO_COORD.lng, lat, lng);

            return (
              <Marker 
                key={pharma.local_id} 
                position={[lat, lng]} 
                icon={isNearest ? nearestIcon : otherIcon}
                zIndexOffset={isNearest ? 1000 : 0}
              >
                <Popup className="min-w-[180px]">
                  <div className="text-slate-800 flex flex-col gap-1 p-1">
                    <strong className="text-blue-900 text-lg leading-tight">{pharma.local_nombre}</strong>
                    <span className="text-slate-500 text-sm leading-snug">{pharma.local_direccion}</span>
                    <span className="text-green-700 font-black text-xs">A {distPop.toFixed(2)} km</span>
                    <hr className="my-1 border-slate-100" />
                    <div className="text-[10px] text-slate-400">
                      Horario: {pharma.funcionamiento_hora_apertura} - {pharma.funcionamiento_hora_cierre}
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>

        {/* Floating Action Button: Recalcular (Mobile thumb area) */}
        {!isRecalculating && (
          <button 
            onClick={refreshLocation}
            className="absolute right-6 bottom-32 md:bottom-40 z-30 bg-white p-4 rounded-full shadow-[0_10px_40px_rgba(0,0,0,0.15)] border border-slate-100 text-blue-900 hover:scale-110 active:scale-95 transition-all outline-none"
            title="Sintonizar GPS"
          >
            <Crosshair className="w-7 h-7" />
          </button>
        )}
      </div>

      {/* Botonera Flotante Inferior */}
      {nearestPharmacy && (
        <div className="absolute bottom-0 w-full z-20 pb-8 px-4 bg-gradient-to-t from-white via-white/80 to-transparent flex flex-col items-center">
          
          <div className="bg-white border border-slate-100 rounded-[32px] p-6 shadow-2xl w-full max-w-md mx-auto transition-all">
            <div className="flex justify-between items-start mb-4">
               <div className="flex-1">
                  <h2 className="text-2xl font-black text-blue-900 leading-none mb-2 break-words">
                    {nearestPharmacy.local_nombre}
                  </h2>
                  <p className="text-slate-500 text-sm leading-relaxed">{nearestPharmacy.local_direccion}</p>
               </div>
               <div className="bg-green-100 text-green-700 px-3 py-1.5 rounded-full text-xs font-black border border-green-200 ml-2 whitespace-nowrap">
                  A {nearestPharmacy.distance.toFixed(1)} km
               </div>
            </div>

            <div className="flex gap-3 mb-6">
                {nearestPharmacy.local_telefono && (
                  <a 
                    href={`tel:${nearestPharmacy.local_telefono}`} 
                    className="flex-1 flex items-center justify-center gap-2 bg-slate-50 hover:bg-slate-100 text-blue-900 py-4 px-4 border border-slate-200 rounded-2xl text-base font-bold shadow-sm transition-colors"
                  >
                    <Phone className="w-5 h-5 text-green-600" />
                    Llamar
                  </a>
                )}
            </div>

            <button 
              onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&origin=${userLocation ? userLocation.lat : MORRO_COORD.lat},${userLocation ? userLocation.lng : MORRO_COORD.lng}&destination=${nearestPharmacy.local_lat},${nearestPharmacy.local_lng}`, '_blank')}
              className="w-full flex items-center justify-center gap-3 bg-blue-900 hover:bg-blue-800 text-white font-extrabold text-xl py-5 px-6 rounded-3xl shadow-[0_15px_30px_rgba(30,58,138,0.3)] transition-all active:scale-[0.98] group"
            >
              <Navigation className="w-7 h-7 group-hover:rotate-12 transition-transform" />
              <span>TRAZAR RUTA</span>
            </button>
          </div>

          <p className="text-[10px] text-slate-400 font-bold mt-4 tracking-tighter uppercase px-6 text-center">
            {isMocked ? "Servidor Minsal Offline - Datos frecuentes de respaldo" : "Datos en vivo desde MINSAL Chile"}
          </p>
        </div>
      )}

    </div>
  );
}

export default App;
