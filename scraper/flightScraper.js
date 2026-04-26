const { Builder, By, until } = require("selenium-webdriver");

async function scrapeFlightData(driver, from, to, date) {
  const query = encodeURIComponent(`${from} to ${to} flight ${date} fare`);
  const url = `https://www.google.com/search?q=${query}`;

  await driver.get(url);
  await driver.wait(until.elementLocated(By.css("body")), 15000);
  await driver.sleep(2000);

  return driver.executeScript(() => {
    const clean = (text) => (text || "").replace(/\s+/g, " ").trim();
    const nodes = Array.from(document.querySelectorAll("div, li, article, g-card"));
    const options = [];
    const seen = new Set();

    for (const node of nodes) {
      const text = clean(node.textContent);
      if (!text || text.length < 20) continue;
      if (!/flight|air|indigo|spicejet|air india|vistara|akasa/i.test(text)) continue;

      const fareMatch = text.match(/(?:₹|Rs\.?)\s?(\d{3,7})/i);
      const timeMatches = text.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/g) || [];
      const durationMatch = text.match(/\b\d{1,2}\s?h(?:\s?\d{1,2}\s?m)?\b/i);
      const flightIdMatch = text.match(/\b([A-Z]{2}\s?\d{3,4})\b/);

      if (!fareMatch) continue;

      const nameMatch = text.match(/(IndiGo|SpiceJet|Air India|Vistara|Akasa Air)/i);
      const name = nameMatch ? nameMatch[1] : "Flight Option";
      const key = `${name}-${fareMatch[1]}-${timeMatches[0] || ""}`;
      if (seen.has(key)) continue;
      seen.add(key);

      options.push({
        type: "flight",
        name,
        id: flightIdMatch ? flightIdMatch[1].replace(/\s+/g, "") : "",
        fare: Number(fareMatch[1]),
        dep: timeMatches[0] || "",
        arr: timeMatches[1] || "",
        duration: durationMatch ? clean(durationMatch[0]) : "",
      });

      if (options.length >= 20) break;
    }

    return options;
  });
}

async function run() {
  const [, , from, to, date] = process.argv;
  if (!from || !to || !date) {
    throw new Error("Usage: node flightScraper.js <from> <to> <date>");
  }

  const options = new (require("selenium-webdriver/chrome").Options)();
  options.addArguments("--headless=new", "--disable-gpu", "--no-sandbox", "--window-size=1920,1080");
  const driver = await new Builder().forBrowser("chrome").setChromeOptions(options).build();

  try {
    const flights = await scrapeFlightData(driver, from, to, date);
    console.log(JSON.stringify({ source: "flight", total: flights.length, options: flights }));
  } finally {
    await driver.quit();
  }
}

run().catch((error) => {
  console.log(JSON.stringify({ source: "flight", total: 0, options: [], error: error.message }));
  process.exit(1);
});
