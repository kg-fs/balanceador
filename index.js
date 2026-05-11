const express = require("express");

const app = express();

// ==================== BACKENDS ====================

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

// ==================== MIDDLEWARE ====================

// IMPORTANTE: usar JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.set("trust proxy", 1);

// ==================== LOAD BALANCER ====================

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
        "Content-Type": "application/json"
      },

      body: ["GET", "HEAD"].includes(req.method)
        ? undefined
        : JSON.stringify(req.body)
    };

    const response = await fetch(targetUrl, fetchOptions);

    res.status(response.status);

    // copiar headers
    response.headers.forEach((value, key) => {

      const lowerKey = key.toLowerCase();

      if (
        ![
          "content-encoding",
          "content-length",
          "transfer-encoding",
          "connection"
        ].includes(lowerKey)
      ) {
        res.setHeader(key, value);
      }

    });

    const data = await response.arrayBuffer();

    let bodyText = Buffer.from(data).toString();

    const contentType = response.headers.get("content-type") || "";

    // si es json agregar info del balanceador
    if (contentType.includes("application/json")) {

      try {

        let jsonBody = JSON.parse(bodyText);

        jsonBody.balancer_info = {
          used_server: server.name,
          from: "load-balancer-vps",
          timestamp: new Date().toISOString()
        };

        return res.json(jsonBody);

      } catch (e) {
        console.log("No se pudo parsear JSON");
      }
    }

    res.send(bodyText);

  } catch (error) {

    console.error(`❌ Error con ${server.name}:`, error.message);

    res.status(502).json({
      error: "Bad Gateway",
      message: "Error conectando con backend"
    });

  }

});

// ==================== START ====================

const PORT = process.env.PORT || 3003;

app.listen(PORT, () => {

  console.log(`🚀 Balanceador corriendo en puerto ${PORT}`);

  console.log(`Backend 1: ${servers[0].url}`);

  console.log(`Backend 2: ${servers[1].url}`);

});