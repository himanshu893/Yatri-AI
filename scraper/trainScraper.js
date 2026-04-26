const readline = require("node:readline/promises");
const { stdin: input, stdout: output } = require("node:process");
const https = require("node:https");

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatDateForUrl(rawDate) {
  const value = rawDate.trim();
  if (/^\d{2}-\d{2}-\d{4}$/.test(value)) {
    return value;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [yyyy, mm, dd] = value.split("-");
    return `${dd}-${mm}-${yyyy}`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid date. Use DD-MM-YYYY or YYYY-MM-DD.");
  }

  return `${pad(parsed.getDate())}-${pad(parsed.getMonth() + 1)}-${parsed.getFullYear()}`;
}

const PLACE_ALIASES = new Map([
  ["mumabi", "Mumbai"],
  ["bombay", "Mumbai"],
  ["csmt", "Mumbai"],
  ["cstm", "Mumbai"],
  ["mumbai csmt", "Mumbai"],
  ["mumbai cstm", "Mumbai"],
  ["lokmanya tilak terminus", "Mumbai"],
  ["ltt", "Mumbai"],
  ["nagpur junction railway station", "Nagpur"],
  ["nagpur junction", "Nagpur"],
  ["ngp", "Nagpur"],
  ["new delhi", "Delhi"],
  ["ndls", "Delhi"],
  ["nzm", "Delhi"],
]);

function titleCasePlace(place) {
  return clean(place)
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function canonicalPlace(place) {
  const trimmed = clean(place)
    .replace(/\b(?:railway station|train station|junction|jn|station)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const key = trimmed.toLowerCase();
  return PLACE_ALIASES.get(key) || titleCasePlace(trimmed);
}

function slugifyPlace(place) {
  return canonicalPlace(place)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildSearchUrl(fromPlace, toPlace) {
  const fromSlug = slugifyPlace(fromPlace);
  const toSlug = slugifyPlace(toPlace);
  if (!fromSlug || !toSlug) {
    throw new Error("Could not build ConfirmTkt route URL from the supplied places.");
  }
  return `https://www.confirmtkt.com/trains/${fromSlug}-to-${toSlug}-train-tickets`;
}

async function askUserInputs() {
  const rl = readline.createInterface({ input, output });
  try {
    const from = await rl.question("Enter starting station/city: ");
    const to = await rl.question("Enter destination station/city: ");
    const travelDate = await rl.question("Enter date (DD-MM-YYYY or YYYY-MM-DD): ");

    if (!clean(from) || !clean(to) || !clean(travelDate)) {
      throw new Error("Starting place, destination place, and date are required.");
    }

    return {
      from: clean(from),
      to: clean(to),
      date: formatDateForUrl(travelDate),
    };
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

  return {
    from: lines[0],
    to: lines[1],
    date: formatDateForUrl(lines[2]),
  };
}

function fetchText(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          "Accept": "text/html,application/xhtml+xml",
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
            reject(new Error("Too many redirects while fetching ConfirmTkt."));
            return;
          }
          const redirectedUrl = new URL(location, url).toString();
          fetchText(redirectedUrl, redirectCount + 1).then(resolve, reject);
          return;
        }

        if (statusCode >= 400) {
          response.resume();
          reject(new Error(`ConfirmTkt returned HTTP ${statusCode}.`));
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

    request.setTimeout(30000, () => {
      request.destroy(new Error("Timed out while fetching ConfirmTkt."));
    });
    request.on("error", reject);
  });
}

function decodeHtml(value) {
  const named = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: "\"",
    apos: "'",
    nbsp: " ",
  };

  return String(value || "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(parseInt(code, 10)))
    .replace(/&([a-z]+);/gi, (_, name) => named[name.toLowerCase()] || `&${name};`);
}

function htmlToLines(html) {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, "\n")
      .replace(/<style[\s\S]*?<\/style>/gi, "\n")
      .replace(/<!--[\s\S]*?-->/g, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:a|div|li|p|h[1-6]|td|tr|span|section|article)>/gi, "\n")
      .replace(/<[^>]+>/g, "\n")
  )
    .split(/\r?\n/)
    .map((line) => clean(line))
    .filter(Boolean);
}

function stripHtmlText(fragment) {
  return clean(decodeHtml(String(fragment || "").replace(/<[^>]+>/g, " ")));
}

function parseTrainHeader(line) {
  const match = clean(line).match(/^(\d{4,5})\s+([A-Z0-9][A-Z0-9 .'\-]{2,})$/);
  if (!match) {
    return null;
  }
  return {
    trainNumber: match[1],
    trainName: clean(match[2]),
  };
}

function isDaysLine(line) {
  return /^S\s+M\s+T\s+W\s+T\s+F\s+S$/i.test(clean(line));
}

function isTrainHeaderAt(lines, index) {
  if (!parseTrainHeader(lines[index])) {
    return false;
  }

  for (let offset = 1; offset <= 3 && index + offset < lines.length; offset += 1) {
    if (isDaysLine(lines[index + offset])) {
      return true;
    }
  }

  return false;
}

function parseTimeStation(line) {
  const match = clean(line).match(/^([01]?\d|2[0-3]):([0-5]\d)\s+([A-Z][A-Z0-9]{1,5})$/);
  if (!match) {
    return null;
  }
  return {
    time: `${match[1].padStart(2, "0")}:${match[2]}`,
    station: match[3],
  };
}

function parseDuration(line) {
  const match = clean(line).match(/^(\d{1,2}h\s*\d{1,2}m|\d{1,2}:\d{2}\s*hrs?)$/i);
  return match ? clean(match[1]) : null;
}

function parseAvailabilityLine(line) {
  const match = clean(line).match(/^(1A|2A|3A|3E|SL|CC|EC|2S|FC|EA|EV)\s+(?:\u20b9|Rs\.?)?\s*([\d,]+)\s*(.*)$/i);
  if (!match) {
    return null;
  }

  return {
    classType: match[1].toUpperCase(),
    fare: `\u20b9${match[2].replace(/,/g, "")}`,
    status: clean(match[3]) || "N/A",
  };
}

function findNext(lines, start, maxOffset, parser) {
  const end = Math.min(lines.length, start + maxOffset + 1);
  for (let index = start; index < end; index += 1) {
    const parsed = parser(lines[index]);
    if (parsed) {
      return { index, parsed };
    }
  }
  return null;
}

function parseStaticTrainPage(html) {
  const cardTrains = parseTrainCards(html);
  const faqTrains = parseFaqTrains(html);
  const mergedTrains = mergeTrains(cardTrains, faqTrains);
  if (mergedTrains.length) {
    return sortTrainsByDeparture(mergedTrains);
  }

  const lines = htmlToLines(html);
  const trains = [];
  const seenTrainNumbers = new Set();

  for (let index = 0; index < lines.length; index += 1) {
    if (!isTrainHeaderAt(lines, index)) {
      continue;
    }

    const header = parseTrainHeader(lines[index]);
    const departure = findNext(lines, index + 1, 8, parseTimeStation);
    if (!departure) {
      continue;
    }

    const duration = findNext(lines, departure.index + 1, 4, parseDuration);
    if (!duration) {
      continue;
    }

    const arrival = findNext(lines, duration.index + 1, 4, parseTimeStation);
    if (!arrival) {
      continue;
    }

    const availability = [];
    let cursor = arrival.index + 1;
    while (cursor < lines.length) {
      if (isTrainHeaderAt(lines, cursor)) {
        break;
      }
      if (/^(Why Book|Trains from|Frequently Asked|Explore more)/i.test(lines[cursor])) {
        break;
      }

      const classAvailability = parseAvailabilityLine(lines[cursor]);
      if (classAvailability) {
        availability.push(classAvailability);
      }
      cursor += 1;
    }

    if (!seenTrainNumbers.has(header.trainNumber)) {
      seenTrainNumbers.add(header.trainNumber);
      trains.push({
        trainNumber: header.trainNumber,
        trainName: header.trainName,
        dep: departure.parsed.time,
        fromStation: departure.parsed.station,
        dur: duration.parsed,
        arr: arrival.parsed.time,
        toStation: arrival.parsed.station,
        availability,
      });
    }

    index = Math.max(index, cursor - 1);
  }

  return trains;
}

function sortTrainsByDeparture(trains) {
  return [...trains].sort((a, b) => clean(a.dep).localeCompare(clean(b.dep)));
}

function parseTrainCards(html) {
  const trains = [];
  const seenTrainNumbers = new Set();
  const cards = String(html || "").split(/<div class="train-desktop">/i).slice(1);

  for (const card of cards) {
    const headerMatch = card.match(/train-schedule\/(\d{4,5})-[^"]*">([\s\S]*?)<\/a>/i);
    if (!headerMatch) {
      continue;
    }

    const headerText = stripHtmlText(headerMatch[2]);
    const header = parseTrainHeader(headerText.replace(/\s{2,}/g, " "));
    if (!header || seenTrainNumbers.has(header.trainNumber)) {
      continue;
    }

    const stationTimes = [];
    const stationRegex = /<div class="train-stn-redirect">([\s\S]*?)<\/div>/gi;
    let stationMatch;
    while ((stationMatch = stationRegex.exec(card)) !== null) {
      const parsed = parseTimeStation(stripHtmlText(stationMatch[1]));
      if (parsed) {
        stationTimes.push(parsed);
      }
    }

    if (stationTimes.length < 2) {
      continue;
    }

    const durationMatch = card.match(/<span class="train-duration-text">\s*([\s\S]*?)\s*<\/span>/i);
    const duration = durationMatch ? stripHtmlText(durationMatch[1]) : "N/A";
    const availability = [];
    const availabilityRegex = /rbooking\/trains\/from\/([^/]+)\/to\/([^/]+)\/[^'"]+['"][\s\S]*?<div class='flexy avl-price text-gray'>\s*<div>([^<]+)<\/div>\s*<div>[\s\S]*?(?:&#8377;|\u20b9|Rs\.?)\s*([\d,]+)<\/div>\s*<\/div>\s*<div class='prediction[^']*'>([\s\S]*?)<\/div>\s*<div class='prediction-sub[^']*'>([\s\S]*?)<\/div>/gi;
    let availabilityMatch;
    while ((availabilityMatch = availabilityRegex.exec(card)) !== null) {
      const availabilityFrom = decodeURIComponent(availabilityMatch[1]).toUpperCase();
      const availabilityTo = decodeURIComponent(availabilityMatch[2]).toUpperCase();
      if (availabilityFrom !== stationTimes[0].station || availabilityTo !== stationTimes[1].station) {
        continue;
      }

      const status = [stripHtmlText(availabilityMatch[5]), stripHtmlText(availabilityMatch[6])]
        .filter(Boolean)
        .join(" ");
      availability.push({
        classType: stripHtmlText(availabilityMatch[3]).toUpperCase(),
        fare: `\u20b9${availabilityMatch[4].replace(/,/g, "")}`,
        status: status || "N/A",
      });
    }

    seenTrainNumbers.add(header.trainNumber);
    trains.push({
      trainNumber: header.trainNumber,
      trainName: header.trainName,
      dep: stationTimes[0].time,
      fromStation: stationTimes[0].station,
      dur: duration,
      arr: stationTimes[1].time,
      toStation: stationTimes[1].station,
      availability,
    });
  }

  return trains;
}

function parseFaqTrains(html) {
  const text = decodeHtml(String(html || "").replace(/<[^>]+>/g, " "));
  const trains = [];
  const seenTrainNumbers = new Set();
  const faqRegex = /\b(\d{4,5})\s+([A-Z0-9][A-Z0-9 .'\-]+?)\s+departs\s+[^.]*?\s+at\s+([0-2]?\d:[0-5]\d)\s+and\s+reaches\s+[^.]*?\s+at\s+([0-2]?\d:[0-5]\d)\s+Running days:\s+([A-Za-z ]+)/gi;
  let match;

  while ((match = faqRegex.exec(text)) !== null) {
    const trainNumber = match[1];
    if (seenTrainNumbers.has(trainNumber)) {
      continue;
    }
    seenTrainNumbers.add(trainNumber);
    trains.push({
      trainNumber,
      trainName: clean(match[2]).toUpperCase(),
      dep: match[3].padStart(5, "0"),
      fromStation: "",
      dur: "N/A",
      arr: match[4].padStart(5, "0"),
      toStation: "",
      runningDays: clean(match[5]),
      availability: [],
    });
  }

  return trains;
}

function mergeTrains(primary, secondary) {
  const merged = [];
  const seenTrainNumbers = new Set();

  for (const train of [...primary, ...secondary]) {
    if (seenTrainNumbers.has(train.trainNumber)) {
      continue;
    }
    seenTrainNumbers.add(train.trainNumber);
    merged.push(train);
  }

  return merged;
}

async function run() {
  let inputData;
  try {
    inputData = await readLinesFromStdin();
    if (!inputData) {
      inputData = await askUserInputs();
    }
  } catch (error) {
    inputData = await askUserInputs();
  }

  const fromResolved = canonicalPlace(inputData.from);
  const toResolved = canonicalPlace(inputData.to);
  const url = buildSearchUrl(fromResolved, toResolved);
  const html = await fetchText(url);
  const trains = parseStaticTrainPage(html);

  console.log(JSON.stringify({
    mode: "train",
    source: "confirmtkt-static-page",
    searchUrl: url,
    search: {
      ...inputData,
      fromResolved,
      toResolved,
    },
    totalTrains: trains.length,
    trains,
  }, null, 2));
}

run().catch((error) => {
  console.error("Scraping failed:", error.message);
  process.exit(1);
});
