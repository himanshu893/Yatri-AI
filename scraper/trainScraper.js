const { Builder, By, until } = require("selenium-webdriver");

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

function normalizeStation(station) {
  return encodeURIComponent(station.trim().toUpperCase());
}

function buildSearchUrl(fromStation, toStation, dateString) {
  return `https://www.confirmtkt.com/rbooking/trains/from/${normalizeStation(fromStation)}/to/${normalizeStation(toStation)}/${dateString}`;
}

async function scrapeTrainData(driver, url) {
  await driver.get(url);

  await driver.wait(until.elementLocated(By.css("div[id^='train-']")), 30000);
  await driver.wait(async () => {
    const elements = await driver.findElements(By.css("div[id^='train-']"));
    return elements.length > 0;
  }, 30000);
  await driver.sleep(6000);

  return driver.executeScript(() => {
    const trainRows = Array.from(document.querySelectorAll("div[id^='train-']"));

    const cleanText = (text) => (text || "").replace(/\s+/g, " ").trim();
    const firstText = (root, selectors) => {
      for (const selector of selectors) {
        const node = root.querySelector(selector);
        const value = cleanText(node?.textContent);
        if (value) return value;
      }
      return "";
    };

    const parseScheduleFromText = (text) => {
      const timeMatches = text.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/g) || [];
      const durationMatch = text.match(/\b\d{1,2}h\s*\d{1,2}m\b|\b\d{1,2}:\d{2}\b/i);
      return {
        departure: timeMatches[0] || "",
        arrival: timeMatches[1] || "",
        duration: durationMatch ? cleanText(durationMatch[0]) : "",
      };
    };

    return trainRows.map((trainDiv) => {
      const id = trainDiv.id || "";
      const trainNumber = id.startsWith("train-") ? id.slice("train-".length) : "";
      if (!/^\d+$/.test(trainNumber)) return null;
      const scheduleParent = trainDiv.querySelector(".flex-start.flex.items-start.text-center");
      const children = scheduleParent ? scheduleParent.children : [];

      const dep = children[0] ? cleanText(children[0].textContent).split(" ")[0] : "";
      const dur = children[1] ? cleanText(children[1].textContent) : "";
      const arr = children[2] ? cleanText(children[2].textContent).split(" ")[0] : "";

      const trainName = trainDiv.querySelector(".mr-5")
        ? cleanText(trainDiv.querySelector(".mr-5").textContent)
        : "";

      const availabilityRow = trainDiv.querySelector("#tg-available-row");
      const availability = [];

      if (availabilityRow) {
        const classWrappers = Array.from(availabilityRow.children);
        classWrappers.forEach((wrapper) => {
          const classType = cleanText(wrapper.getAttribute("data-key"));
          if (!classType) return;

          const statusEl = wrapper.querySelector(
            "div.body-sm.truncate, div.body-sm.font-medium.text-success-subtle, div.body-sm.font-medium.text-critical, p.body-sm.truncate, p.body-sm.font-medium.text-success-subtle, p.body-sm.font-medium.text-critical"
          );
          const status = statusEl ? cleanText(statusEl.textContent) : "";
          const fare = cleanText(wrapper.querySelector(".body-xs.text-\\[length\\:inherit\\]")?.textContent);

          availability.push({
            classType,
            fare,
            status,
          });
        });
      }

      return {
        id: trainNumber,
        trainNumber,
        trainName,
        dep,
        dur,
        arr,
        availability,
      };
    }).filter(Boolean);
  });
}

function parseArgs() {
  const [, , from, to, date] = process.argv;
  if (!from || !to || !date) {
    throw new Error("Usage: node trainScraper.js <from> <to> <date>");
  }
  return {
    from: from.trim(),
    to: to.trim(),
    date: formatDateForUrl(date),
  };
}

async function run() {
  const inputData = parseArgs();
  const url = buildSearchUrl(inputData.from, inputData.to, inputData.date);
  const options = new (require("selenium-webdriver/chrome").Options)();
  options.addArguments("--headless=new", "--disable-gpu", "--no-sandbox", "--window-size=1920,1080");

  const driver = await new Builder().forBrowser("chrome").setChromeOptions(options).build();

  try {
    const trains = await scrapeTrainData(driver, url);
    console.log(JSON.stringify({ source: "train", searchUrl: url, total: trains.length, options: trains }));
  } finally {
    await driver.quit();
  }
}

run().catch((error) => {
  console.log(JSON.stringify({ source: "train", total: 0, options: [], error: error.message }));
  process.exit(1);
});
