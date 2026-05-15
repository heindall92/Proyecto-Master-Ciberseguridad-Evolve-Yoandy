import asyncio
import httpx
import json

async def debug():
    url = "https://wazuh.indexer:9200"
    auth = ("admin", "admin")
    async with httpx.AsyncClient(auth=auth, verify=False) as client:
        res = await client.get(f"{url}/wazuh-alerts-*/_mapping")
        mapping = res.json()
        props = list(mapping.values())[0]["mappings"]["properties"]
        mitre = props.get("rule", {}).get("properties", {}).get("mitre", {}).get("properties", {})
        print("MITRE mapping:", json.dumps(mitre, indent=2))

asyncio.run(debug())
