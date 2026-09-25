import { useEffect, useState } from "react";
import { Bug, Crosshair, Globe2 } from "lucide-react";
import IntelIocs from "./IntelIocs";
import IntelVulns from "./IntelVulns";
import ThreatMapView from "../ThreatMapView";
import "../premium/dashboard.css";
import "../premium/workspace.css";
import "../premium/executive.css";
import "./intel.css";

/** Inteligencia: une Threat Intel (IOCs), CVE Intel (vulnerabilidades) y Threat Map en una sección. */
export type IntelTab = "iocs" | "vulns" | "map";

export default function IntelHub({ lang = "es", initialTab = "iocs", initialIp }: { lang?: string; initialTab?: IntelTab; initialIp?: string }) {
  const es = lang === "es";
  const [tab, setTab] = useState<IntelTab>(initialTab);
  const [ip, setIp] = useState<string | undefined>(initialIp);
  useEffect(() => { setIp(initialIp); }, [initialIp]);
  useEffect(() => { setTab(initialTab); }, [initialTab]);
  useEffect(() => { if (initialIp) setTab("iocs"); }, [initialIp]);

  const tabs: [IntelTab, typeof Bug, string, string][] = [
    ["iocs", Crosshair, "IOCs", es ? "VirusTotal · AbuseIPDB · lista de vigilancia" : "VirusTotal · AbuseIPDB · watchlist"],
    ["vulns", Bug, es ? "Vulnerabilidades" : "Vulnerabilities", "CISA KEV · NVD · Exploits"],
    ["map", Globe2, es ? "Mapa" : "Map", es ? "Origen de los ataques" : "Attack origin"],
  ];

  return (
    <div className="view in">
      <div className="wk-head">
        <div>
          <h1>{es ? "Inteligencia" : "Intelligence"}</h1>
          <p>{tabs.find(t => t[0] === tab)?.[3]}</p>
        </div>
        <div className="vx-seg in-hubtabs" role="tablist" aria-label={es ? "Inteligencia" : "Intelligence"}>
          {tabs.map(([id, I, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} aria-pressed={tab === id} onClick={() => setTab(id)}><I size={14} /> {label}</button>
          ))}
        </div>
      </div>
      <div className="in-body">
        {tab === "iocs" && <IntelIocs es={es} initialIp={ip} />}
        {tab === "vulns" && <IntelVulns es={es} />}
        {tab === "map" && <div className="in-map"><ThreatMapView lang={lang} onAnalyze={(x) => { setIp(x); setTab("iocs"); }} /></div>}
      </div>
    </div>
  );
}
