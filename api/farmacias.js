export default async function handler(req, res) {
  try {
    const response = await fetch('https://midas.minsal.cl/farmacia_v2/WS/getLocalesTurnos.php');
    
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Error fetching data from MINSAL' });
    }

    const data = await response.json();

    // Clean special characters like '\u00b0' etc. if needed
    // The requirement says: clean special characters from JSON. 
    // And filter comuna_nombre to "ARICA".
    const filteredData = data.filter(farmacia => {
      if (!farmacia.comuna_nombre) return false;
      const comuna = farmacia.comuna_nombre.trim().toUpperCase();
      return comuna === 'ARICA';
    }).map(farmacia => {
      // Clean string fields
      const cleanStr = (str) => {
        if (typeof str !== 'string') return str;
        return str.replace(/\u00b0/g, '°').trim();
      };
      
      const cleaned = {};
      for (const [key, value] of Object.entries(farmacia)) {
        cleaned[key] = cleanStr(value);
      }
      return cleaned;
    });

    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.status(200).json(filteredData);
  } catch (error) {
    console.error('Error in proxy:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
