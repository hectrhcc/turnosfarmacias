export default async function handler(req, res) {
  const MOCK_DATA = [
     {
      local_id: "mock-1",
      local_nombre: "Cruz Verde (Centro)",
      local_direccion: "21 de Mayo 201, Arica",
      local_lat: "-18.478051",
      local_lng: "-70.320152",
      local_telefono: "800802800",
      funcionamiento_hora_apertura: "08:00",
      funcionamiento_hora_cierre: "23:59",
      comuna_nombre: "ARICA"
    },
    {
      local_id: "mock-2",
      local_nombre: "Ahumada (Centro)",
      local_direccion: "21 de Mayo 330, Arica",
      local_lat: "-18.479124",
      local_lng: "-70.318532",
      local_telefono: "6002224000",
      funcionamiento_hora_apertura: "08:30",
      funcionamiento_hora_cierre: "23:00",
      comuna_nombre: "ARICA"
    },
    {
      local_id: "mock-3",
      local_nombre: "Salcobrand (Saucache)",
      local_direccion: "Av. 18 de Septiembre 2100, Arica",
      local_lat: "-18.483921",
      local_lng: "-70.301235",
      local_telefono: "6003606000",
      funcionamiento_hora_apertura: "09:00",
      funcionamiento_hora_cierre: "22:00",
      comuna_nombre: "ARICA"
    }
  ];

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s Timeout per request

    const response = await fetch('https://midas.minsal.cl/farmacia_v2/WS/getLocalesTurnos.php', {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
      }
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`MINSAL Server Error: ${response.status}`);
    }

    const data = await response.json();

    // Cleaning and robust filtering for "ARICA"
    const filteredData = data.filter(farmacia => {
      if (!farmacia.comuna_nombre) return false;
      const comuna = String(farmacia.comuna_nombre).trim().toUpperCase();
      return comuna === 'ARICA';
    }).map(farmacia => {
      const cleanStr = (str) => typeof str === 'string' ? str.replace(/\u00b0/g, '°').trim() : str;
      const cleaned = {};
      for (const [key, value] of Object.entries(farmacia)) {
        cleaned[key] = cleanStr(value);
      }
      return cleaned;
    });

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json({
      success: true,
      data: filteredData,
      isMocked: false
    });

  } catch (error) {
    console.warn('MINSAL Live Fetch Failed, providing Mock Data:', error.message);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json({
      success: true,
      data: MOCK_DATA,
      isMocked: true,
      error: error.message
    });
  }
}
