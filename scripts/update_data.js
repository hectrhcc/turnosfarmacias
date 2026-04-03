import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function updateData() {
  console.log('🔄 Sincronizando datos de farmacias desde MINSAL...');
  
  try {
    const response = await fetch('https://midas.minsal.cl/farmacia_v2/WS/getLocalesTurnos.php', {
       headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
       }
    });
    
    if (!response.ok) throw new Error(`MINSAL Error: ${response.status}`);

    const data = await response.json();
    
    // Filtro robusto para Arica
    const filteredData = data.filter(f => {
      const comuna = String(f.comuna_nombre || '').trim().toUpperCase();
      return comuna === 'ARICA';
    }).map(f => {
       const cleanStr = (str) => typeof str === 'string' ? str.replace(/\u00b0/g, '°').trim() : str;
       const cleaned = {};
       for (const [key, value] of Object.entries(f)) {
         cleaned[key] = cleanStr(value);
       }
       return cleaned;
    });

    const outputPath = path.join(__dirname, '..', 'public', 'farmacias_arica.json');
    
    fs.writeFileSync(outputPath, JSON.stringify({
      last_updated: new Date().toISOString(),
      count: filteredData.length,
      data: filteredData
    }, null, 2));

    console.log(`✅ ¡Sincronizado! ${filteredData.length} farmacias de turno guardadas en /public/farmacias_arica.json`);
    console.log('🚀 Ahora sólo debes hacer git commit y push para que Vercel tenga los datos frescos.');
  } catch (error) {
    console.error('❌ Error fatal en la sincronización:', error.message);
  }
}

updateData();
