import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Base de farmacias permanentes conocidas en Arica para "llenar" el mapa promedios
const ARICA_BASELINE = [
  {
    local_id: "gen-1",
    local_nombre: "Cruz Verde - 21 de Mayo",
    local_direccion: "21 de Mayo 201",
    local_lat: "-18.478051",
    local_lng: "-70.320152",
    local_telefono: "800802800",
    comuna_nombre: "ARICA",
    funcionamiento_hora_apertura: "08:30",
    funcionamiento_hora_cierre: "22:00"
  },
  {
    local_id: "gen-2",
    local_nombre: "Ahumada - Bolognesi",
    local_direccion: "Bolognesi 330",
    local_lat: "-18.479124",
    local_lng: "-70.318532",
    local_telefono: "6002224000",
    comuna_nombre: "ARICA",
    funcionamiento_hora_apertura: "09:00",
    funcionamiento_hora_cierre: "21:30"
  },
  {
    local_id: "gen-3",
    local_nombre: "Salcobrand - Saucache",
    local_direccion: "Av. 18 de Septiembre 2100",
    local_lat: "-18.483921",
    local_lng: "-70.301235",
    local_telefono: "6003606000",
    comuna_nombre: "ARICA",
    funcionamiento_hora_apertura: "09:00",
    funcionamiento_hora_cierre: "22:00"
  },
  {
    local_id: "gen-4",
    local_nombre: "Cruz Verde - Diego Portales",
    local_direccion: "Diego Portales 2291",
    local_lat: "-18.473551",
    local_lng: "-70.298552",
    local_telefono: "800802800",
    comuna_nombre: "ARICA",
    funcionamiento_hora_apertura: "09:00",
    funcionamiento_hora_cierre: "22:00"
  },
  {
    local_id: "gen-5",
    local_nombre: "Ahumada - Mall Plaza",
    local_direccion: "Av. Diego Portales 640",
    local_lat: "-18.468224",
    local_lng: "-70.302132",
    local_telefono: "6002224000",
    comuna_nombre: "ARICA",
    funcionamiento_hora_apertura: "10:00",
    funcionamiento_hora_cierre: "21:00"
  },
  {
    local_id: "gen-6",
    local_nombre: "Farmacia Popular Arica",
    local_direccion: "18 de Septiembre 450",
    local_lat: "-18.480112",
    local_lng: "-70.315534",
    local_telefono: "582206000",
    comuna_nombre: "ARICA",
    funcionamiento_hora_apertura: "08:30",
    funcionamiento_hora_cierre: "17:30"
  },
  {
     local_id: "gen-7",
     local_nombre: "Cruz Verde - Thompson",
     local_direccion: "Thompson 201",
     local_lat: "-18.479551",
     local_lng: "-70.316152",
     local_telefono: "800802800",
     comuna_nombre: "ARICA",
     funcionamiento_hora_apertura: "09:00",
     funcionamiento_hora_cierre: "21:00"
  }
];

async function updateData() {
  console.log('🔄 Sincronizando turnos y mapeando base general de Arica...');
  
  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
    };

    // Obtener turnos
    const resTurnos = await fetch('https://midas.minsal.cl/farmacia_v2/WS/getLocalesTurnos.php', { headers });
    const turnosData = await resTurnos.json();

    const aricaTurnos = turnosData.filter(f => {
      const comuna = String(f.comuna_nombre || '').trim().toUpperCase();
      return comuna === 'ARICA';
    }).map(f => {
       const cleanStr = (str) => typeof str === 'string' ? str.replace(/\u00b0/g, '°').trim() : str;
       const cleaned = {};
       for (const [key, value] of Object.entries(f)) {
         cleaned[key] = cleanStr(value);
       }
       cleaned.is_on_duty = true;
       return cleaned;
    });

    // Combinar con la base general
    // Si una farmacia de la base general tiene la misma dirección o nombre que una de turno, se ignora la general
    const finalMap = new Map();
    
    // Primero añadimos las generales
    ARICA_BASELINE.forEach(f => {
      finalMap.set(f.local_direccion.toUpperCase(), { ...f, is_on_duty: false });
    });
    
    // Luego sobrescribimos o añadimos las de turno
    aricaTurnos.forEach(f => {
      finalMap.set(f.local_direccion.toUpperCase(), f);
    });

    const combinedData = Array.from(finalMap.values());

    const outputPath = path.join(__dirname, '..', 'public', 'farmacias_arica.json');
    
    fs.writeFileSync(outputPath, JSON.stringify({
      last_updated: new Date().toISOString(),
      count: combinedData.length,
      on_duty_count: aricaTurnos.length,
      data: combinedData
    }, null, 2));

    console.log(`✅ ¡Sincronizado! ${combinedData.length} farmacias mapeadas.`);
    console.log(`📡 Turnos de hoy: ${aricaTurnos.length}`);
  } catch (error) {
    console.error('❌ Error fatal:', error.message);
  }
}

updateData();
