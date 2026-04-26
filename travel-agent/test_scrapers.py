import subprocess
import json

def test_scraper(script_name, origin, destination):
    script_path = f"../scraper/{script_name}"
    stdin_payload = f"{origin}\n{destination}\n15-12-2026\n"
    
    print(f"\n🧪 Testing {script_name}")
    print(f"Input: {origin} -> {destination}")
    
    try:
        result = subprocess.run(
            ["node", script_path],
            input=stdin_payload,
            capture_output=True,
            text=True,
            timeout=30,
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
        else:
            print(f"❌ No JSON found in output")
            print(f"First 200 chars: {result.stdout[:200]}")
    except Exception as e:
        print(f"❌ Error: {e}")

# Test all scrapers
test_scraper("trainScraper.js", "Delhi", "Manali")
test_scraper("flightScraper.js", "Delhi", "Manali")
test_scraper("busScraper.js", "Delhi", "Manali")
