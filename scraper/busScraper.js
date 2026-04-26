const { Builder, By, until } = require("selenium-webdriver");

async function scrapeBusData(driver, from, to, date) {
  const query = encodeURIComponent(`${from} to ${to} bus ${date}`);
  const url = `https://www.redbus.in/search?fromCityName=${encodeURIComponent(from)}&toCityName=${encodeURIComponent(to)}&onward=${encodeURIComponent(date)}`;

  try {
    await driver.get(url);
    await driver.wait(until.elementLocated(By.css("body")), 15000);
    await driver.sleep(5000);
  } catch {
    await driver.get(`https://www.google.com/search?q=${query}`);
    await driver.wait(until.elementLocated(By.css("body")), 15000);
    await driver.sleep(2000);
  }

  return driver.executeScript(() => {
    const clean = (text) => (text || "").replace(/\s+/g, " ").trim();
    const cards = Array.from(document.querySelectorAll("[class*='bus'], [id*='bus'], li, article, .tupleWrapper"));
    const seen = new Set();
    const options = [];

    for (const card of cards) {
      const text = clean(card.textContent);
      if (!text || text.length < 20) continue;

      const fareMatch = text.match(/(?:₹|Rs\.?)\s?(\d{2,6})/i);
      const timeMatches = text.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/g) || [];
      const durationMatch = text.match(/\b\d{1,2}\s?h(?:\s?\d{1,2}\s?m)?\b/i);
      const idMatch = text.match(/\b([A-Z]{2,5}\d{2,6}|\d{5,8})\b/);

      if (!fareMatch || timeMatches.length < 1) continue;

      const name = clean(text.split("₹")[0]).slice(0, 60) || "Bus Option";
      const key = `${name}-${fareMatch[1]}-${timeMatches[0]}`;
      if (seen.has(key)) continue;
      seen.add(key);

      options.push({
        type: "bus",
        name,
        id: idMatch ? idMatch[1] : "",
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
    throw new Error("Usage: node busScraper.js <from> <to> <date>");
  }

  const options = new (require("selenium-webdriver/chrome").Options)();
  options.addArguments("--headless=new", "--disable-gpu", "--no-sandbox", "--window-size=1920,1080");
  const driver = await new Builder().forBrowser("chrome").setChromeOptions(options).build();

  try {
    const buses = await scrapeBusData(driver, from, to, date);
    console.log(JSON.stringify({ source: "bus", total: buses.length, options: buses }));
  } finally {
    await driver.quit();
  }
}

run().catch((error) => {
  console.log(JSON.stringify({ source: "bus", total: 0, options: [], error: error.message }));
  process.exit(1);
});
