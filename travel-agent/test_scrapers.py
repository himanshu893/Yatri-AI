import subprocess
import json

def test_scraper(script_name, origin, destination):
    script_path = f"../scraper/{script_name}"
    date_value = "2026-05-15"
    stdin_payload = f"{origin}\n{destination}\n{date_value}\n"
    command = ["node", script_path]
    if script_name == "busScraper.js":
        command = ["node", script_path, origin, destination, date_value]
    
    print(f"\n🧪 Testing {script_name}")
    print(f"Input: {origin} -> {destination}")
    
    try:
        result = subprocess.run(
            command,
            input=None if script_name == "busScraper.js" else stdin_payload,
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
        )
        
        print(f"Return code: {result.returncode}")
        print(f"Stdout length: {len(result.stdout)}")
        print(f"Stderr: {result.stderr[:200] if result.stderr else 'None'}")
        
        # Try to extract JSON
        start = result.stdout.find("{")
        end = result.stdout.rfind("}")
        if start != -1 and end != -1:
            json_str = result.stdout[start:end+1]
            data = json.loads(json_str)
            print(f"✅ Valid JSON parsed")
            print(f"Keys: {list(data.keys())}")
            if "options" in data:
                print(f"Options count: {len(data['options'])}")
            if "buses" in data:
                print(f"Buses count: {len(data['buses'])}")
        else:
            print(f"❌ No JSON found in output")
            print(f"First 200 chars: {result.stdout[:200]}")
    except Exception as e:
        print(f"❌ Error: {e}")

# Test all scrapers
test_scraper("trainScraper.js", "Delhi", "Manali")
test_scraper("flightScraper.js", "Delhi", "Manali")
test_scraper("busScraper.js", "Delhi", "Manali")
