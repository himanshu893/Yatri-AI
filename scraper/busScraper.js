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
  ["bangalore", "Bengaluru"],
]);

function canonicalCity(value) {
  const cleaned = clean(value)
    .replace(/\b(?:bus terminal|bus stand|railway station|airport)\b/gi, " ")
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

function buildSourceUrl(fromCity, toCity) {
  const fromSlug = slugifyCity(fromCity);
  const toSlug = slugifyCity(toCity);
  if (!fromSlug || !toSlug) {
    return null;
  }
  return `https://www.redbus.in/bus-tickets/${fromSlug}-to-${toSlug}`;
}

function buildReaderUrl(sourceUrl) {
  return `https://r.jina.ai/${sourceUrl}`;
}

function fetchText(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          Accept: "text/markdown,text/plain,text/html",
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
            reject(new Error("Too many redirects while fetching bus data."));
            return;
          }
          fetchText(new URL(location, url).toString(), redirectCount + 1).then(resolve, reject);
          return;
        }

        if (statusCode >= 400) {
          response.resume();
          reject(new Error(`Bus source returned HTTP ${statusCode}.`));
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

    request.setTimeout(60000, () => {
      request.destroy(new Error("Timed out while fetching bus data."));
    });
    request.on("error", reject);
  });
}

function toNumberFare(value) {
  const digits = clean(value).replace(/[^\d]/g, "");
  return digits ? Number(digits) : null;
}

function normalizeDuration(value) {
  return clean(value)
    .replace(/\bhrs?\b/gi, "h")
    .replace(/\bmins?\b/gi, "m")
    .replace(/\s+/g, " ") || "N/A";
}

function parseMarkdownBusCards(markdown, fromCity, toCity, sourceUrl) {
  const normalized = String(markdown || "").replace(/\r/g, "");
  const cardMatches = [...normalized.matchAll(/^\*\s+([A-Z]{2}\d{2}[A-Z]{1,3}\d{4})\s*([\s\S]*?)(?=^\*\s+[A-Z]{2}\d{2}[A-Z]{1,3}\d{4}\s*$|^Ask RAY\b|^## Mumbai to .* Bus Service\b|(?![\s\S]))/gm)];
  const options = [];
  const seen = new Set();

  for (const match of cardMatches) {
    const plate = match[1];
    const block = match[2];
    const compact = clean(block);
    const times = [...block.matchAll(/\b([01]?\d|2[0-3]):[0-5]\d\b/g)].map((m) => m[0].padStart(5, "0"));
    const durationMatch = block.match(/\b\d{1,2}h(?:\s+\d{1,2}m)?\b/i);
    const fareValues = [...block.matchAll(/₹\s*([\d,]+)/g)].map((m) => toNumberFare(m[1])).filter(Boolean);
    const fare = fareValues.length ? Math.min(...fareValues) : null;
    const seatsMatch = compact.match(/\b(\d+)\s+Seats?\b/i);
    const typeMatch = compact.match(/\b((?:Mercedes Benz|Volvo 9600|Bharat Benz|VE|Benz)?\s*(?:A\/C|AC|Non-AC)?\s*(?:Sleeper|Seater|Semi Sleeper|Multi-Axle)[A-Za-z0-9 /()+-]*)\s+\d(?:\.\d)?\s+\d+\b/i);
    const afterFare = fareValues.length ? compact.replace(/^.*₹\s*[\d,]+(?:\.\d+)?\s*/, "") : compact;
    const operatorMatch = afterFare.match(/^(.+?)\s+(?:Live tracking|Ad\s+)?(?:A\/C|AC|Non-AC|Mercedes|Volvo|Bharat|VE|Benz)\b/i);
    const ratingMatch = compact.match(/\b([1-5](?:\.\d)?)\s+\d+\s+Highlights\b/i);

    if (times.length < 2 || !durationMatch || !fare || !operatorMatch) {
      continue;
    }

    const operator = clean(operatorMatch[1].replace(/\bLive tracking\b/gi, "").replace(/^Ad\s+/i, ""));
    const busType = typeMatch ? clean(typeMatch[1].replace(/^Ad\s+/i, "")) : "Bus";
    const key = [plate, operator, times[0], times[1], fare].join("|");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    options.push({
      type: "bus",
      name: operator,
      route: `${canonicalCity(fromCity)} to ${canonicalCity(toCity)}`,
      code: plate,
      duration: normalizeDuration(durationMatch[0]),
      fare,
      classes: [{
        classType: busType,
        fare: `\u20b9${fare}`,
        status: seatsMatch ? `${seatsMatch[1]} seats left` : "Check operator portal",
      }],
      departure: times[0],
      arrival: times[1],
      description: [
        ratingMatch ? `Rating ${ratingMatch[1]}` : "",
        "Source: redBus",
        sourceUrl,
      ].filter(Boolean).join(" | "),
    });
  }

  return options;
}

function parseOperatorTable(markdown, fromCity, toCity, sourceUrl) {
  const tableSectionMatch = String(markdown || "").match(/## .* Bus Timings & Fare([\s\S]*?)(?:## .* Bus Overview|## .* Bus Tickets|$)/i);
  if (!tableSectionMatch) {
    return [];
  }

  const options = [];
  const rows = tableSectionMatch[1].split(/\r?\n/).map((line) => line.trim());
  for (const row of rows) {
    if (!row.startsWith("|") || /---|Bus Operator/i.test(row)) {
      continue;
    }

    const cells = row.split("|").map((cell) => clean(cell.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"))).filter(Boolean);
    if (cells.length < 4) {
      continue;
    }

    const [operator, firstBus, lastBus, duration] = cells;
    const firstTime = (firstBus.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/) || [])[0] || "N/A";
    const lastTime = (lastBus.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/) || [])[0] || "N/A";
    options.push({
      type: "bus",
      name: operator,
      route: `${canonicalCity(fromCity)} to ${canonicalCity(toCity)}`,
      code: "OPERATOR",
      duration: normalizeDuration(duration),
      fare: null,
      classes: [{
        classType: "Operator schedule",
        fare: "N/A",
        status: `First ${firstTime}, last ${lastTime}`,
      }],
      departure: firstTime,
      arrival: "N/A",
      description: `Operator summary | Source: redBus | ${sourceUrl}`,
    });
  }

  return options;
}

function parseBusMarkdown(markdown, fromCity, toCity, sourceUrl) {
  const cardOptions = parseMarkdownBusCards(markdown, fromCity, toCity, sourceUrl);
  const operatorSummaries = parseOperatorTable(markdown, fromCity, toCity, sourceUrl);
  if (cardOptions.length) {
    const cardOperators = new Set(cardOptions.map((option) => option.name.toLowerCase()));
    const missingOperatorSummaries = operatorSummaries.filter(
      (option) => !cardOperators.has(option.name.toLowerCase())
    );
    return [...cardOptions, ...missingOperatorSummaries].sort((a, b) => {
      const fareDiff = (a.fare ?? Number.MAX_SAFE_INTEGER) - (b.fare ?? Number.MAX_SAFE_INTEGER);
      if (fareDiff) return fareDiff;
      return clean(a.departure).localeCompare(clean(b.departure));
    });
  }

  return operatorSummaries;
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
  let inputData;
  try {
    inputData = await readLinesFromStdin();
    if (!inputData) {
      inputData = await askUserInputs();
    }
  } catch {
    inputData = await askUserInputs();
  }

  const sourceUrl = buildSourceUrl(inputData.from, inputData.to);
  if (!sourceUrl) {
    console.log(JSON.stringify({
      mode: "bus",
      source: "redbus-reader",
      fallback: true,
      search: inputData,
      totalOptions: 0,
      options: [],
      warning: "Could not build a bus route URL.",
    }, null, 2));
    return;
  }

  const markdown = await fetchText(buildReaderUrl(sourceUrl));
  const options = parseBusMarkdown(markdown, inputData.from, inputData.to, sourceUrl);

  console.log(JSON.stringify({
    mode: "bus",
    source: "redbus-reader",
    fallback: options.length === 0,
    searchUrl: sourceUrl,
    search: {
      ...inputData,
      fromResolved: canonicalCity(inputData.from),
      toResolved: canonicalCity(inputData.to),
    },
    totalOptions: options.length,
    options,
  }, null, 2));
}

run().catch((error) => {
  console.error("Bus scraping failed:", error.message);
  process.exit(1);
});
