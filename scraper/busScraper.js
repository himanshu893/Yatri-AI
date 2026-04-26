const readline = require("node:readline/promises");
const { stdin: input, stdout: output } = require("node:process");
const { Builder, By, until } = require("selenium-webdriver");

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatDateForPaytmUrl(rawDate) {
  const value = rawDate.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  if (/^\d{2}-\d{2}-\d{4}$/.test(value)) {
    const [dd, mm, yyyy] = value.split("-");
    return `${yyyy}-${mm}-${dd}`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid date. Use YYYY-MM-DD or DD-MM-YYYY.");
  }

  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
}

function normalizePlace(value) {
  return encodeURIComponent(value.trim());
}

function buildSearchUrl(from, to, yyyyMmDd) {
  return `https://tickets.paytm.com/bus/search/${normalizePlace(from)}/${normalizePlace(to)}/${yyyyMmDd}/1`;
}

async function askUserInputs() {
  const rl = readline.createInterface({ input, output });
  try {
    const from = await rl.question("Enter from city: ");
    const to = await rl.question("Enter to city: ");
    const travelDate = await rl.question("Enter date (YYYY-MM-DD or DD-MM-YYYY): ");

    if (!from.trim() || !to.trim() || !travelDate.trim()) {
      throw new Error("From city, to city, and date are required.");
    }

    return {
      from: from.trim(),
      to: to.trim(),
      date: formatDateForPaytmUrl(travelDate),
    };
  } finally {
    rl.close();
  }
}

function getInputsFromArgs() {
  const args = process.argv.slice(2);
  if (args.length < 3) return null;
  const [fromRaw, toRaw, dateRaw] = args;
  const from = (fromRaw || "").trim();
  const to = (toRaw || "").trim();
  const date = formatDateForPaytmUrl(dateRaw || "");
  if (!from || !to || !date) return null;
  return { from, to, date };
}

async function scrapeBusData(driver, url) {
  await driver.get(url);

  await driver.wait(until.elementLocated(By.css(".ngaSw")), 30000);
  await driver.wait(async () => {
    const cards = await driver.findElements(By.css(".ngaSw"));
    return cards.length > 0;
  }, 30000);
  await driver.sleep(4000);

  return driver.executeScript(() => {
    const cleanText = (text) => (text || "").replace(/\s+/g, " ").trim();
    const cards = Array.from(document.querySelectorAll(".ngaSw"));

    return cards
      .map((card) => {
        const busName = cleanText(card.querySelector(".oT4dy")?.textContent);
        const timeNodes = card.querySelectorAll(".Edhtr");
        const departureTime = cleanText(timeNodes[0]?.textContent);
        const arrivalTime = cleanText(timeNodes[1]?.textContent);
        const arrivalDate = cleanText(card.querySelector(".W_ZkM")?.textContent);
        const price = cleanText(card.querySelector(".RAalN.x90ZC")?.textContent);

        if (!busName && !departureTime && !arrivalTime && !arrivalDate && !price) return null;

        return {
          busName,
          departureTime,
          arrivalTime,
          arrivalDate,
          price,
        };
      })
      .filter(Boolean);
  });
}

async function run() {
  const inputData = getInputsFromArgs() ?? (await askUserInputs());
  const url = buildSearchUrl(inputData.from, inputData.to, inputData.date);

  const options = new (require("selenium-webdriver/chrome").Options)();
  options.addArguments("--headless=new", "--disable-gpu", "--no-sandbox", "--window-size=1920,1080");

  const driver = await new Builder().forBrowser("chrome").setChromeOptions(options).build();

  try {
    const buses = await scrapeBusData(driver, url);
    console.log(JSON.stringify({
      mode: "bus",
      source: "paytm-selenium",
      searchUrl: url,
      search: inputData,
      totalBuses: buses.length,
      buses,
    }, null, 2));
  } finally {
    await driver.quit();
  }
}

run().catch((error) => {
  console.error("Scraping failed:", error.message);
  process.exit(1);
});

