const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");
const readline = require("node:readline/promises");
const { stdin: input, stdout: output } = require("node:process");

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function titleCase(value) {
  return clean(value)
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const CITY_ALIASES = new Map([
  ["mumabi", "Mumbai"],
  ["bombay", "Mumbai"],
  ["new delhi", "Delhi"],
  ["delhi", "Delhi"],
  ["bengaluru", "Bengaluru"],
  ["bangalore", "Bengaluru"],
]);

const AIRPORT_CODES = new Map([
  ["mumbai", "BOM"],
  ["nagpur", "NAG"],
  ["delhi", "DEL"],
  ["bengaluru", "BLR"],
  ["bangalore", "BLR"],
  ["hyderabad", "HYD"],
  ["chennai", "MAA"],
  ["kolkata", "CCU"],
  ["pune", "PNQ"],
  ["goa", "GOI"],
  ["jaipur", "JAI"],
  ["ahmedabad", "AMD"],
  ["kochi", "COK"],
  ["indore", "IDR"],
  ["guwahati", "GAU"],
  ["patna", "PAT"],
  ["srinagar", "SXR"],
  ["chandigarh", "IXC"],
  ["surat", "STV"],
  ["varanasi", "VNS"],
]);

function loadAirportCodesFromFile() {
  const filePath = path.join(__dirname, "923042218-Airport-Codes.txt");
  if (!fs.existsSync(filePath)) {
    return;
  }

  const text = fs.readFileSync(filePath, "utf8");
  const matches = text.matchAll(/([A-Za-z][A-Za-z ()-]{2,}?)\s+([A-Z]{3})\b/g);
  for (const match of matches) {
    const city = clean(match[1].replace(/\([^)]*\)/g, " "));
    if (city && !/Airport|International|Domestic|Code|Name/i.test(city)) {
      AIRPORT_CODES.set(city.toLowerCase(), match[2]);
    }
  }
}

function canonicalCity(value) {
  const cleaned = clean(value)
    .replace(/\b(?:airport|international|domestic|terminal|railway station|bus terminal)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return CITY_ALIASES.get(cleaned.toLowerCase()) || titleCase(cleaned);
}

function slugifyCity(value) {
  return canonicalCity(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function airportCodeForCity(city) {
  return AIRPORT_CODES.get(canonicalCity(city).toLowerCase()) || null;
}

function buildSearchUrl(fromCity, toCity) {
  const fromCode = airportCodeForCity(fromCity);
  const toCode = airportCodeForCity(toCity);
  if (!fromCode || !toCode) {
    return null;
  }
  return `https://www.ixigo.com/cheap-flights/${slugifyCity(fromCity)}-${slugifyCity(toCity)}-${fromCode.toLowerCase()}-${toCode.toLowerCase()}`;
}

function fetchText(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-IN,en;q=0.9",
          "User-Agent": "Mozilla/5.0 YatriAI/1.0",
        },
      },
      (response) => {
        const statusCode = response.statusCode || 0;
        const location = response.headers.location;

        if ([301, 302, 303, 307, 308].includes(statusCode) && location) {
          response.resume();
          if (redirectCount >= 5) {
            reject(new Error("Too many redirects while fetching ixigo."));
            return;
          }
          fetchText(new URL(location, url).toString(), redirectCount + 1).then(resolve, reject);
          return;
        }

        if (statusCode >= 400) {
          response.resume();
          reject(new Error(`ixigo returned HTTP ${statusCode}.`));
          return;
        }

        response.setEncoding("utf8");
        let body = "";
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => resolve(body));
      }
    );

    request.setTimeout(45000, () => {
      request.destroy(new Error("Timed out while fetching ixigo."));
    });
    request.on("error", reject);
  });
}

function decodeHtml(value) {
  const named = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " };
  return String(value || "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(parseInt(code, 10)))
    .replace(/&([a-z]+);/gi, (_, name) => named[name.toLowerCase()] || `&${name};`);
}

function extractJsonLdBlocks(html) {
  const blocks = [];
  const regex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const raw = decodeHtml(match[1]).trim();
    try {
      blocks.push(JSON.parse(raw));
    } catch {
      // Ignore malformed non-flight schema blocks.
    }
  }
  return blocks;
}

function flattenJsonLd(value) {
  if (Array.isArray(value)) {
    return value.flatMap(flattenJsonLd);
  }
  if (value && typeof value === "object") {
    const graph = Array.isArray(value["@graph"]) ? value["@graph"].flatMap(flattenJsonLd) : [];
    return [value, ...graph];
  }
  return [];
}

function isoDurationToText(value) {
  const match = clean(value).match(/^PT(?:(\d+)H)?(?:(\d+)M)?$/i);
  if (!match) {
    return clean(value) || "N/A";
  }
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const parts = [];
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  return parts.join(" ") || "N/A";
}

function normalizeTime(value) {
  const match = clean(value).match(/^(\d{1,2}):([0-5]\d)\s*(AM|PM)$/i);
  if (!match) {
    return clean(value).replace(/\s+/g, " ") || "N/A";
  }

  let hours = Number(match[1]);
  const minutes = match[2];
  const suffix = match[3].toUpperCase();
  if (suffix === "PM" && hours < 12) {
    hours += 12;
  } else if (suffix === "AM" && hours === 12) {
    hours = 0;
  }
  return `${String(hours).padStart(2, "0")}:${minutes}`;
}

function fareFromOffer(offer) {
  const price = offer && typeof offer === "object" ? offer.price : null;
  const digits = clean(price).replace(/[^\d]/g, "");
  return digits ? Number(digits) : null;
}

function parseFlightSchemas(html, fromCity, toCity) {
  const sourceUrl = buildSearchUrl(fromCity, toCity);
  const allSchemas = extractJsonLdBlocks(html).flatMap(flattenJsonLd);
  const flights = [];
  const seen = new Set();

  for (const schema of allSchemas) {
    const type = schema["@type"];
    const isFlight = type === "Flight" || (Array.isArray(type) && type.includes("Flight"));
    if (!isFlight || !schema.flightNumber) {
      continue;
    }

    const code = clean(schema.flightNumber).toUpperCase();
    const fare = fareFromOffer(schema.offers);
    const airline = clean(schema.name).replace(new RegExp(`\\s+${code}\\b.*$`, "i"), "") || "Flight";
    const fromCode = schema.departureAirport?.iataCode || airportCodeForCity(fromCity) || "";
    const toCode = schema.arrivalAirport?.iataCode || airportCodeForCity(toCity) || "";
    const key = [code, normalizeTime(schema.departureTime), normalizeTime(schema.arrivalTime), fare || ""].join("|");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    flights.push({
      type: "flight",
      name: `${airline} ${code}`,
      route: `${canonicalCity(fromCity)} to ${canonicalCity(toCity)}`,
      code,
      duration: isoDurationToText(schema.estimatedFlightDuration),
      fare,
      classes: [{
        classType: "Economy",
        fare: fare ? `\u20b9${fare}` : "N/A",
        status: schema.offers?.availability ? "Available" : "Check airline portal",
      }],
      departure: normalizeTime(schema.departureTime),
      arrival: normalizeTime(schema.arrivalTime),
      description: [fromCode && toCode ? `${fromCode} to ${toCode}` : "", sourceUrl ? "Source: ixigo" : ""].filter(Boolean).join(" | "),
    });
  }

  return flights.sort((a, b) => {
    const fareDiff = (a.fare ?? Number.MAX_SAFE_INTEGER) - (b.fare ?? Number.MAX_SAFE_INTEGER);
    if (fareDiff) return fareDiff;
    return clean(a.departure).localeCompare(clean(b.departure));
  });
}

async function askUserInputs() {
  const rl = readline.createInterface({ input, output });
  try {
    const from = await rl.question("Enter origin city: ");
    const to = await rl.question("Enter destination city: ");
    const travelDate = await rl.question("Enter date (DD-MM-YYYY or YYYY-MM-DD): ");

    if (!clean(from) || !clean(to) || !clean(travelDate)) {
      throw new Error("Origin, destination, and date are required.");
    }

    return { from: clean(from), to: clean(to), date: clean(travelDate) };
  } finally {
    rl.close();
  }
}

async function readLinesFromStdin() {
  if (process.stdin.isTTY) {
    return null;
  }

  process.stdin.setEncoding("utf8");
  let data = "";
  for await (const chunk of input) {
    data += chunk;
  }

  const lines = data.split(/\r?\n/).map((line) => clean(line)).filter(Boolean);
  if (lines.length < 3) {
    return null;
  }

  return { from: lines[0], to: lines[1], date: lines[2] };
}

async function run() {
  loadAirportCodesFromFile();

  let inputData;
  try {
    inputData = await readLinesFromStdin();
    if (!inputData) {
      inputData = await askUserInputs();
    }
  } catch {
    inputData = await askUserInputs();
  }

  const searchUrl = buildSearchUrl(inputData.from, inputData.to);
  if (!searchUrl) {
    console.log(JSON.stringify({
      mode: "flight",
      source: "ixigo-static-page",
      fallback: true,
      search: inputData,
      totalOptions: 0,
      options: [],
      warning: "No airport code found for this route.",
    }, null, 2));
    return;
  }

  const html = await fetchText(searchUrl);
  const options = parseFlightSchemas(html, inputData.from, inputData.to);

  console.log(JSON.stringify({
    mode: "flight",
    source: "ixigo-static-page",
    fallback: options.length === 0,
    searchUrl,
    search: {
      ...inputData,
      fromResolved: canonicalCity(inputData.from),
      toResolved: canonicalCity(inputData.to),
      fromAirport: airportCodeForCity(inputData.from),
      toAirport: airportCodeForCity(inputData.to),
    },
    totalOptions: options.length,
    options,
  }, null, 2));
}

run().catch((error) => {
  console.error("Flight scraping failed:", error.message);
  process.exit(1);
});
