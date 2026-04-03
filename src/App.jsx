import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Phone, Navigation, MapPin, User, Plus, Info, Loader2, AlertCircle } from 'lucide-react';
import { renderToString } from 'react-dom/server';

const MORRO_COORD = { lat: -18.4783, lng: -70.3125 };

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
  <div className="bg-blue-100 p-2 rounded-full border-2 border-blue-500 shadow-md">
    <User className="w-6 h-6 text-blue-600" />
  </div>
);

const NearestIconBase = () => (
  <div className="bg-white p-2 rounded-full border-[3px] border-red-600 shadow-xl animate-bounce">
    <Plus className="w-8 h-8 text-red-600" strokeWidth={4} />
  </div>
);

const OtherIconBase = () => (
  <div className="bg-green-50 p-1.5 rounded-full border-[2px] border-green-600 shadow-sm opacity-90">
    <Plus className="w-5 h-5 text-green-700" strokeWidth={3} />
  </div>
);

const userIcon = createDivIcon(<UserIconBase />, [44, 44]);
const nearestIcon = createDivIcon(<NearestIconBase />, [56, 56], 'z-[1000]');
const otherIcon = createDivIcon(<OtherIconBase />, [32, 32]);

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
      map.setView(center, 14);
    }
  }, [center, map]);
  return null;
}

function App() {
  const [pharmacies, setPharmacies] = useState([]);
  const [userLocation, setUserLocation] = useState(null);
  const [nearestPharmacy, setNearestPharmacy] = useState(null);
  const [usingFallback, setUsingFallback] = useState(false);
  const [isMocked, setIsMocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // 1. Geolocalización blindada con fallback a los 5 segundos
  useEffect(() => {
    const getLocation = new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        return reject(new Error('Geolocalización no soportada.'));
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 5000, 
        maximumAge: 0
      });
    });

    getLocation.then((position) => {
      setUserLocation({
        lat: position.coords.latitude,
        lng: position.coords.longitude
      });
    }).catch((err) => {
      console.warn("Error o denegación de GPS, usando Morro de Arica como fallback", err);
      setUserLocation(MORRO_COORD);
      setUsingFallback(true);
    });
  }, []);

  // 2. Fetch Farmacias
  useEffect(() => {
    const fetchPharmacies = async () => {
      try {
        const res = await fetch('/api/farmacias').catch(() => null);
        let dataToSet = [];
        
        if (res && res.ok) {
          const result = await res.json();
          dataToSet = result.data || [];
          setIsMocked(result.isMocked || false);
        } else {
          // Si Vercel Function falla totalmente (sin Mock interno)
          throw new Error('API Response Error');
        }
        
        setPharmacies(dataToSet);
      } catch (err) {
        console.error("Critical Fetch Error:", err);
        setErrorMsg('Servidor Minsal no disponible temporalmente.');
        // Si todo falla, intentamos cargar localmente un pequeño arreglo si es necesario pero asumimos que el mock ya viene por API
        setLoading(false);
      }
    };
    fetchPharmacies();
  }, []);

  // 3. Calculo de Distancia cuando la ubicación y las farmacias están listas
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
      setLoading(false);
    } else if (!loading && pharmacies.length === 0 && userLocation) {
        // Handle case with no pharmacies
        setLoading(false);
    }
  }, [userLocation, pharmacies]);

  // Si pasaron 8 segundos y sigue cargando, forzamos el fin (Seguridad adicional)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (loading) setLoading(false);
    }, 8000);
    return () => clearTimeout(timer);
  }, [loading]);


  if (loading) {
    return (
      <div className="w-full h-screen bg-white flex flex-col items-center justify-center space-y-6">
        <Loader2 className="w-16 h-16 text-blue-900 animate-spin" />
        <div className="text-center">
          <h2 className="text-blue-900 text-2xl font-bold mb-2">Buscando Farmacias...</h2>
          <p className="text-slate-500">Conectando con el Servidor Nacional de Turnos</p>
        </div>
      </div>
    );
  }

  const mapCenter = userLocation ? [userLocation.lat, userLocation.lng] : [MORRO_COORD.lat, MORRO_COORD.lng];

  return (
    <div className="relative w-full h-screen bg-white text-slate-800 flex flex-col font-sans overflow-hidden">
      
      {/* Header Rediseñado */}
      <header className="absolute top-0 left-0 w-full z-20 bg-white/95 backdrop-blur-md p-4 shadow-sm border-b border-slate-100 flex flex-col items-center">
        <h1 className="text-4xl md:text-5xl font-extrabold text-blue-900 text-center tracking-tight">
          Farmacias Arica
        </h1>
        <p className="text-sm font-medium text-green-700 mt-1 uppercase tracking-widest flex items-center gap-2">
          {isMocked ? <AlertCircle className="w-4 h-4" /> : null}
          {isMocked ? "Modo Emergencia Local" : "Turnos Reales de Hoy"}
        </p>
      </header>

      {/* Alertas dinámicas */}
      <div className="absolute top-[105px] left-0 w-full flex flex-col items-center gap-2 z-20 px-4 pointer-events-none">
        {usingFallback && (
          <div className="bg-blue-50 text-blue-800 py-2 px-4 rounded-full text-[10px] font-bold shadow-sm border border-blue-100 flex items-center gap-2 pointer-events-auto uppercase tracking-wide">
            <Info className="w-3 h-3" />
            Ubicación: Morro de Arica (Fallback)
          </div>
        )}
      </div>

      {/* Mapa */}
      <div className="flex-1 w-full relative z-0 mt-[80px]">
        <MapContainer center={mapCenter} zoom={14} zoomControl={false} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapUpdater center={mapCenter} />
          
          {userLocation && (
            <Marker position={[userLocation.lat, userLocation.lng]} icon={userIcon}>
              <Popup className="font-bold text-center text-blue-900">Tu Ubicación</Popup>
            </Marker>
          )}

          {pharmacies.map(pharma => {
            const lat = parseFloat(pharma.local_lat);
            const lng = parseFloat(pharma.local_lng);
            if (isNaN(lat) || isNaN(lng)) return null;

            const isNearest = nearestPharmacy && nearestPharmacy.local_id === pharma.local_id;
            
            // Re-calculate distance here for popup
            const dist = getDistanceFromLatLonInKm(userLocation ? userLocation.lat : MORRO_COORD.lat, userLocation ? userLocation.lng : MORRO_COORD.lng, lat, lng);

            return (
              <Marker 
                key={pharma.local_id} 
                position={[lat, lng]} 
                icon={isNearest ? nearestIcon : otherIcon}
                zIndexOffset={isNearest ? 1000 : 0}
              >
                <Popup className="min-w-[180px]">
                  <div className="text-slate-800 flex flex-col pt-1">
                    <strong className="text-blue-900 text-[15px] leading-tight mb-1">{pharma.local_nombre}</strong>
                    <span className="text-slate-600 text-sm mb-1">{pharma.local_direccion}</span>
                    <span className="text-green-700 font-bold text-sm mb-2">A {dist.toFixed(1)} km de ti</span>
                    <div className="bg-slate-50 rounded p-2 text-[10px] border border-slate-100">
                      <strong>Horario turnos frecuentes:</strong> <br/>
                      {pharma.funcionamiento_hora_apertura} - {pharma.funcionamiento_hora_cierre}
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>

      {/* Botonera Flotante */}
      {nearestPharmacy && (
        <div className="absolute bottom-0 w-full z-20 pb-4 bg-gradient-to-t from-white via-white/95 to-transparent flex flex-col items-center pt-10">
          
          {/* Tarjeta de Farmacia */}
          <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-[0_-10px_40px_-5px_rgba(0,0,0,0.08)] w-[92%] max-w-md mx-auto relative bottom-2 transition-all">
            <h2 className="text-xl font-bold text-blue-900 flex items-center gap-2 mb-2">
              <MapPin className="text-red-600 w-5 h-5 flex-shrink-0"/>
              <span className="truncate">{nearestPharmacy.local_nombre}</span>
            </h2>
            <p className="text-slate-600 mb-4 ml-7 text-sm">{nearestPharmacy.local_direccion}</p>
            
            <div className="flex justify-between items-center ml-7 mb-4">
              <div className="px-3 py-1 bg-green-50 text-green-700 rounded-full text-xs font-bold border border-green-100">
                A {nearestPharmacy.distance.toFixed(1)} km de ti
              </div>
              {nearestPharmacy.local_telefono && (
                <a 
                  href={`tel:${nearestPharmacy.local_telefono}`} 
                  className="flex items-center gap-2 bg-slate-50 hover:bg-slate-100 text-blue-900 px-4 py-2 border border-slate-200 rounded-xl text-sm font-semibold transition-colors"
                >
                  <Phone className="w-4 h-4 text-green-600" />
                  Llamar
                </a>
              )}
            </div>

            {/* Accion Principal - Google Maps */}
            <button 
              onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&origin=${userLocation ? userLocation.lat : MORRO_COORD.lat},${userLocation ? userLocation.lng : MORRO_COORD.lng}&destination=${nearestPharmacy.local_lat},${nearestPharmacy.local_lng}`, '_blank')}
              className="w-full flex items-center justify-center gap-3 bg-blue-900 hover:bg-blue-800 text-white font-extrabold text-lg py-4 px-6 rounded-2xl shadow-xl transition-all active:scale-[0.98]"
            >
              <Navigation className="w-6 h-6 animate-pulse" />
              <span>IR A LA MÁS CERCANA</span>
            </button>
          </div>

          <p className="text-[10px] text-slate-400 font-medium mt-1">
            {isMocked ? "Mostrando turnos frecuentes (Servidor Minsal no disponible temporalmente)" : "App diseñada para funcionar offline una vez cargada."}
          </p>
        </div>
      )}

      {/* Si no hay farmacias ni errores pero cargó (vacío raro) */}
      {!loading && pharmacies.length === 0 && (
         <div className="absolute bottom-10 w-full px-4 z-20">
           <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-lg text-center">
             <p className="text-slate-700 font-medium text-sm">Error cargando información. Intente más tarde.</p>
           </div>
         </div>
      )}

    </div>
  );
}

export default App;
