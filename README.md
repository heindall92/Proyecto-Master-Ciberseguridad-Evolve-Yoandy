# 🛡️ Valhalla SOC v1.0.0 — Tactical Cyberpunk Backend

Bienvenido a la versión estable de Valhalla SOC. Este backend ha sido endurecido (Hardened) y auditado bajo los estándares de la Fase 5 (Pentest Interno).

## 🚀 Estado de las Fases
- [x] **Fase 4: Hardening & Seguridad**: CSP, Trusted Types, Sanitización DOM, Rate Limiting.
- [x] **Fase 5: Pentest Interno**: Validado bloqueo de fuerza bruta y mitigación de XSS/SQLi.
- [x] **Fase 6: QA & Automatización**: Suite de tests unitarios con `pytest`.
- [x] **Fase 7: Despliegue**: Auditoría de dependencias y documentación final.

## 🛠️ Requisitos de Instalación
```bash
cd backend
pip install -r requirements.txt
```

## 🔐 Características de Seguridad Implementadas
1. **Rate Limiter Inteligente**: Bloqueo automático por IP tras 5 intentos fallidos o exceso de tráfico.
2. **CSP Estricta**: Content-Security-Policy con Nonces dinámicos y restricción de dominios.
3. **Input Validator**: Validación por regex de todos los campos sensibles y protección contra inyección.
4. **Audit Logs**: Registro persistente de todas las acciones administrativas en `audit_logs`.
5. **Secure Headers**: Eliminación de cabeceras de servidor y protección contra Clickjacking/Sniffing.

## 🧪 Ejecución de Tests
Para validar la integridad del sistema:
```bash
cd backend
$env:PYTHONPATH="."
pytest tests/test_security.py
```

## 📜 Licencia
Desarrollado para el Proyecto SOC - Valhalla Defense Systems.
Tipografía y Logo: **Alexana** (Propiedad Protegida).
