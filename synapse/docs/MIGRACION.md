# Publicar el proyecto en el repositorio de Maricel

El proyecto nació dentro de `heindall92/Proyecto-Master-Ciberseguridad-Evolve-Yoandy`, en la rama
`claude/sweet-brahmagupta-rzk7c1`, carpeta `synapse/`. Estos scripts lo suben a
`maricelmeneses/synapse` (rama `main`) **con todo su historial** y con la autoría de cada commit.

## Un solo comando

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/heindall92/Proyecto-Master-Ciberseguridad-Evolve-Yoandy/claude/sweet-brahmagupta-rzk7c1/synapse/scripts/publicar_en_github.ps1 | iex
```

**macOS, Linux o Git Bash:**
```bash
curl -fsSL https://raw.githubusercontent.com/heindall92/Proyecto-Master-Ciberseguridad-Evolve-Yoandy/claude/sweet-brahmagupta-rzk7c1/synapse/scripts/publicar_en_github.sh | bash
```

Cuando Git pida iniciar sesión, se abre el navegador. Entra con la cuenta **maricelmeneses**.
Si en lugar del navegador pide usuario y contraseña: el usuario es `maricelmeneses`, y la
«contraseña» es un token creado en <https://github.com/settings/tokens> con el permiso `repo`.
La contraseña normal de GitHub ya no funciona en Git.

Se puede repetir cuando haya cambios nuevos: cada vez sube solo lo nuevo.

## Si GitHub rechaza la subida

- **`rejected (fetch first)`:** `main` tiene commits creados en la web (por ejemplo, un README
  automático). Si no hacen falta, repite el comando en modo forzado:
  - PowerShell: `$env:SYNAPSE_FORZAR = "1"` y, a continuación, el mismo comando.
  - Bash: `curl … | SYNAPSE_FORZAR=1 bash`
- **`Authentication failed`:** vuelve a iniciar sesión o usa un token con el permiso `repo`.

## Después de la migración
Cuando Maricel añada a `heindall92` como colaborador e instale la GitHub App de Claude en el
repositorio, se trabaja directamente allí y estos scripts ya no hacen falta.
