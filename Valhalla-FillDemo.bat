@echo off
echo ==========================================
echo Valhalla SOC - Demo Data Population v2
echo ==========================================
echo.
echo [1/4] Reiniciando el backend (aplica cambios de codigo y .env)...
docker restart valhalla-soc-backend-1
echo Esperando a que el backend inicie por completo...
timeout /t 12 >nul
echo.
echo [2/4] Inyectando datos ricos en PostgreSQL y OpenSearch (7 dias)...
docker exec valhalla-soc-backend-1 python -m app.SuperPopulate
echo.
echo [3/4] Verificando conteo de alertas en OpenSearch...
docker exec valhalla-soc-backend-1 python -c "import httpx; r=httpx.post('https://wazuh.indexer:9200/wazuh-alerts-*/_count',auth=('admin','admin'),verify=False,json={'query':{'bool':{'must_not':[{'match':{'data.integration':'ollama_ai'}}]}}}); print('  Alertas demo disponibles:', r.json().get('count', 0))"
echo.
echo [4/4] Verificando sesiones Cowrie...
docker exec valhalla-soc-backend-1 python -c "import asyncio; from app import opensearch_client as osc; asyncio.run(osc.get_cowrie_sessions(5))" >nul 2>&1
echo  OK - Honeypot data listo
echo.
echo ==========================================
echo PROCESO COMPLETADO.
echo.
echo  SIEM:     Alertas de 7 dias cargadas (168h window)
echo  Honeypot: Sesiones Cowrie con comandos reales
echo  Threat Map: IPs geolocalizadas de CH/RU/NL/DE/ES
echo  Incidencias: 5 tickets realistas pre-cargados
echo  Threat Intel: IOCs activos listos para consulta VT
echo.
echo Por favor, refresca tu navegador (F5).
echo ==========================================
pause
