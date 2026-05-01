import httpx
from app.settings import settings

class WazuhClient:
    def __init__(self):
        self.base_url = settings.wazuh_api.rstrip("/")
        self.user = settings.wazuh_user
        self.pwd = settings.wazuh_pass
        self.token = None

    async def _get_token(self):
        async with httpx.AsyncClient(verify=False) as client:
            r = await client.get(f"{self.base_url}/security/user/authenticate", auth=(self.user, self.pwd))
            if r.status_code == 200:
                self.token = r.json().get("data", {}).get("token")
            return self.token

    async def request(self, method: str, path: str, **kwargs):
        if not self.token:
            await self._get_token()
        
        headers = kwargs.get("headers", {})
        headers["Authorization"] = f"Bearer {self.token}"
        kwargs["headers"] = headers

        async with httpx.AsyncClient(verify=False) as client:
            r = await client.request(method, f"{self.base_url}{path}", **kwargs)
            if r.status_code == 401: # Token expired?
                await self._get_token()
                headers["Authorization"] = f"Bearer {self.token}"
                r = await client.request(method, f"{self.base_url}{path}", **kwargs)
            return r

    async def get_agents(self):
        r = await self.request("GET", "/agents")
        return r.json().get("data", {}).get("affected_items", [])

    async def get_sca_checks(self, agent_id: str, policy_id: str = "win_audit"):
        # Wazuh SCA checks for LSA usually match specific IDs
        r = await self.request("GET", f"/sca/{agent_id}/checks/{policy_id}")
        return r.json().get("data", {}).get("affected_items", [])

    async def run_active_response(self, agent_id: str, command: str, arguments: list[str] = None):
        payload = {"command": command, "arguments": arguments or []}
        r = await self.request("POST", f"/active-response/{agent_id}", json=payload)
        return r.json()

wazuh = WazuhClient()
