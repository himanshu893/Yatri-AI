const readline = require("node:readline/promises");
const { stdin: input, stdout: output } = require("node:process");

function clean(value) {
  return String(value || "").trim();
}

function normalizeCity(value) {
  return clean(value).toLowerCase();
}

function toNumberFare(value) {
  const digits = clean(value).replace(/[^\d]/g, "");
  return digits ? Number(digits) : null;
}

function sortByFareAndDuration(options) {
  return [...options].sort((a, b) => {
    const aFare = a.fare == null ? Number.MAX_SAFE_INTEGER : a.fare;
    const bFare = b.fare == null ? Number.MAX_SAFE_INTEGER : b.fare;
    if (aFare !== bFare) return aFare - bFare;
    return clean(a.duration).localeCompare(clean(b.duration));
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

    return {
      from: clean(from),
      to: clean(to),
      date: clean(travelDate),
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

  const lines = data.split(/\r?\n/).map(l => clean(l)).filter(l => l);
  if (lines.length < 3) {
    return null;
  }

  return {
    from: lines[0],
    to: lines[1],
    date: lines[2],
  };
}

function getFlightSeedData() {
  return [
    {
      flightCode: "AI101",
      flightName: "Air India AI101",
      from: "Mumbai",
      to: "Delhi",
      duration: "2 hours",
      classes: [{ classType: "Economy", fare: "₹5000", status: "Available" }],
    },
    {
      flightCode: "AI103",
      flightName: "Air India AI103",
      from: "Mumbai",
      to: "Chandigarh",
      duration: "2.5 hours",
      classes: [{ classType: "Economy", fare: "₹6000", status: "Available" }],
    },
    {
      flightCode: "6E221",
      flightName: "IndiGo 6E221",
      from: "Mumbai",
      to: "Delhi",
      duration: "2 hours 10 minutes",
      classes: [{ classType: "Economy", fare: "₹5400", status: "Available" }],
    },
    {
      flightCode: "UK955",
      flightName: "Vistara UK955",
      from: "Delhi",
      to: "Chandigarh",
      duration: "1.2 hours",
      classes: [{ classType: "Economy", fare: "₹3800", status: "Available" }],
    },
  ];
}

function createFallbackOption(from, to) {
  return {
    flightCode: "AI900",
    flightName: `${from} to ${to} Express`,
    from,
    to,
    duration: "N/A",
    classes: [{ classType: "Economy", fare: "N/A", status: "Check airline portal" }],
    fallback: true,
  };
}

function mapToTransportOption(flight) {
  const fares = (flight.classes || []).map((x) => toNumberFare(x.fare)).filter((x) => x != null);
  return {
    type: "flight",
    name: flight.flightName,
    route: `${flight.from} to ${flight.to}`,
    code: flight.flightCode,
    duration: flight.duration,
    fare: fares.length ? Math.min(...fares) : null,
    classes: flight.classes || [],
    fallback: Boolean(flight.fallback),
  };
}

async function run() {
  let inputData;
  try {
    // Try to read from piped stdin first
    inputData = await readLinesFromStdin();
  } catch (e) {
    // Fall back to interactive input
    inputData = await askUserInputs();
  }
  
  const fromKey = normalizeCity(inputData.from);
  const toKey = normalizeCity(inputData.to);

  const flights = getFlightSeedData()
    .filter((f) => normalizeCity(f.from) === fromKey && normalizeCity(f.to) === toKey);

  const selected = flights.length ? flights : [createFallbackOption(inputData.from, inputData.to)];
  const options = sortByFareAndDuration(selected.map(mapToTransportOption));

  const isFallback = options.length === 1 && options[0].fallback === true;
  console.log(
    JSON.stringify(
      {
        mode: "flight",
        source: "seed-data",
        fallback: isFallback,
        search: inputData,
        totalOptions: options.length,
        options,
      },
      null,
      2
    )
  );
}

run().catch((error) => {
  console.error("Flight scraping failed:", error.message);
  process.exit(1);
});
