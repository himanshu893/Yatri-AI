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
  return new Promise((resolve, reject) => {
    let data = "";
    const timeout = setTimeout(() => {
      input.removeListener("data", onData);
      input.removeListener("end", onEnd);
      reject(new Error("No stdin data within 100ms"));
    }, 100);

    const onData = (chunk) => {
      data += chunk;
    };

    const onEnd = () => {
      clearTimeout(timeout);
      input.removeListener("data", onData);
      const lines = data.split("\n").map(l => clean(l)).filter(l => l);
      if (lines.length < 3) {
        reject(new Error("Expected 3 lines"));
      } else {
        resolve({
          from: lines[0],
          to: lines[1],
          date: lines[2],
        });
      }
    };

    input.on("data", onData);
    input.on("end", onEnd);
  });
}

function getBusSeedData() {
  return [
    {
      busCode: "HRTC101",
      busName: "HRTC Volvo",
      from: "Delhi",
      to: "Manali",
      duration: "12 hours",
      classes: [
        { classType: "Semi-Sleeper", fare: "₹1000", status: "Available" },
        { classType: "Sleeper", fare: "₹1500", status: "Available" },
      ],
    },
    {
      busCode: "ZING200",
      busName: "Zingbus AC Sleeper",
      from: "Delhi",
      to: "Manali",
      duration: "11.5 hours",
      classes: [{ classType: "Sleeper", fare: "₹1400", status: "Available" }],
    },
    {
      busCode: "RSRTC77",
      busName: "RSRTC Express",
      from: "Jaipur",
      to: "Delhi",
      duration: "6 hours",
      classes: [{ classType: "Seater", fare: "₹700", status: "Available" }],
    },
  ];
}

function createFallbackOption(from, to) {
  return {
    busCode: "BUS900",
    busName: `${from} to ${to} Bus Service`,
    from,
    to,
    duration: "N/A",
    classes: [{ classType: "Standard", fare: "N/A", status: "Check operator portal" }],
  };
}

function mapToTransportOption(bus) {
  const fares = (bus.classes || []).map((x) => toNumberFare(x.fare)).filter((x) => x != null);
  return {
    type: "bus",
    name: bus.busName,
    route: `${bus.from} to ${bus.to}`,
    code: bus.busCode,
    duration: bus.duration,
    fare: fares.length ? Math.min(...fares) : null,
    classes: bus.classes || [],
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

  const buses = getBusSeedData()
    .filter((b) => normalizeCity(b.from) === fromKey && normalizeCity(b.to) === toKey);

  const selected = buses.length ? buses : [createFallbackOption(inputData.from, inputData.to)];
  const options = sortByFareAndDuration(selected.map(mapToTransportOption));

  console.log(
    JSON.stringify(
      {
        mode: "bus",
        source: "seed-data",
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
  console.error("Bus scraping failed:", error.message);
  process.exit(1);
});
