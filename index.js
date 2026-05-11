const express = require("express");

const app = express();

// 🔥 Servidores backend en Render (cámbialos si cambian las URLs)
const servers = [
  {
    url: "http://177.7.42.180:3001",
    name: "Server 1"
  },
  {
    url: "http://177.7.42.180:3002",
    name: "Server 2"
  }
];

let current = 0;

// Middleware para body raw (importante para POST, PUT, etc.)
app.use(express.raw({ type: '*/*', limit: '10mb' }));

// 🔥 IMPORTANTE para Render
app.set('trust proxy', 1);

app.use(async (req, res) => {
  const server = servers[current];
  current = (current + 1) % servers.length;

  const targetUrl = server.url + req.originalUrl;

  console.log(`→ ${req.method} ${req.originalUrl} → ${server.name}`);

  try {
    const fetchOptions = {
      method: req.method,
      headers: {
        ...req.headers,
        host: undefined,
      },
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body,
    };

    const response = await fetch(targetUrl, fetchOptions);

    res.status(response.status);

    // Copiar headers
    response.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (!['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(lowerKey)) {
        res.setHeader(key, value);
      }
    });

    const data = await response.arrayBuffer();
    let bodyText = Buffer.from(data).toString();

    // Agregar info del balanceador si es JSON
    const contentType = response.headers.get('content-type') || '';
    
    if (contentType.includes('application/json')) {
      try {
        let jsonBody = JSON.parse(bodyText);
        
        jsonBody.balancer_info = {
          used_server: server.name,
          from: "load-balancer-render",
          timestamp: new Date().toISOString()
        };

        res.json(jsonBody);
        return;
      } catch (e) {
        console.log("No se pudo parsear JSON");
      }
    }

    res.send(bodyText);

  } catch (error) {
    console.error(`❌ Error con ${server.name}:`, error.message);

    // Fallback
    const fallback = servers[current];
    console.log(`🔄 Fallback → ${fallback.name}`);

    try {
      const fallbackResponse = await fetch(fallback.url + req.originalUrl, {
        method: req.method,
        headers: { ...req.headers, host: undefined },
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body,
      });

      res.status(fallbackResponse.status);

      const fallbackData = await fallbackResponse.arrayBuffer();
      let fallbackBody = Buffer.from(fallbackData).toString();

      const fbContentType = fallbackResponse.headers.get('content-type') || '';

      if (fbContentType.includes('application/json')) {
        try {
          let jsonBody = JSON.parse(fallbackBody);
          jsonBody.balancer_info = {
            used_server: fallback.name + " (fallback)",
            from: "load-balancer-render",
            timestamp: new Date().toISOString()
          };
          res.json(jsonBody);
          return;
        } catch (e) {}
      }

      res.send(fallbackBody);
      console.log(`✅ Fallback exitoso con ${fallback.name}`);

    } catch (err) {
      console.error("💀 Ambos servidores fallaron");
      res.status(502).json({
        error: "Bad Gateway",
        message: "Los dos servidores backend no responden 💀"
      });
    }
  }
});

// 🔥 Render usa process.env.PORT
const PORT = process.env.PORT || 3003;

app.listen(PORT, () => {
  console.log(`🚀 Balanceador de carga corriendo en puerto ${PORT}`);
  console.log(`Backend 1: ${servers[0].url}`);
  console.log(`Backend 2: ${servers[1].url}`);
});