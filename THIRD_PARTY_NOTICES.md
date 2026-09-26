# Avisos de terceros

Valhalla SOC se distribuye bajo **GPLv2** (ver [LICENSE](LICENSE)). Incluye o usa los componentes de terceros listados aquí, cada uno bajo su propia licencia. Inventario generado el 26/09/2026 con `pip-licenses` (backend) y `license-checker --production` (consola); se regenera con cada cambio de dependencias.

## Revisión de compatibilidad

- Todas las dependencias usan licencias permisivas (MIT, BSD, Apache-2.0, ISC, PSF, 0BSD) o de copyleft débil compatibles con el uso que se hace de ellas: **psycopg** (LGPL-3.0, enlazada como biblioteca sin modificar), **certifi** y **DOMPurify** (MPL-2.0; DOMPurify con doble licencia MPL-2.0 / Apache-2.0).
- **Eliminadas por incompatibilidad** en esta revisión: **PyMuPDF** (AGPL-3.0: incompatible con GPLv2 y no se usaba en el código) y **react-leaflet** (Hippocratic-2.1: añade restricciones de uso, prohibidas por la GPLv2; sustituido por Leaflet, BSD-2-Clause).
- **Modelo de IA**: Qwen2.5-3B-Instruct se distribuye bajo la *Qwen Research License* (uso de investigación, no comercial). No se incluye en el repositorio: el contenedor `ollama-init` lo descarga en la instalación. Para un uso comercial hay que cambiar `OLLAMA_MODEL` por un modelo con licencia permisiva.

## Servicios e imágenes de contenedor

| Componente | Uso | Licencia |
|---|---|---|
| Wazuh manager, indexer y dashboard 4.9.2 | SIEM | GPLv2 (indexer: Apache-2.0, basado en OpenSearch) |
| Cowrie | Honeypot SSH/Telnet | BSD-3-Clause |
| Ollama | Servidor de modelos de IA local | MIT |
| Qwen2.5-3B-Instruct | Modelo de lenguaje | Qwen Research License |
| PostgreSQL 16 | Base de datos | PostgreSQL License |
| Tailscale (opcional, en el host) | VPN | BSD-3-Clause (cliente) |
| Kali Linux (perfil `labs`) | Atacante del laboratorio | Varias (paquetes Debian) |
| Teselas de Esri | Fondo del mapa de ataques | Términos de uso de Esri (atribución visible en el mapa) |
| Lucide | Iconos de la consola y del README | ISC |

## Backend (Python) — 81 paquetes

| Paquete | Versión | Licencia | Proyecto |
|---|---|---|---|
| aiofiles | 25.1.0 | Apache Software License | https://github.com/Tinche/aiofiles |
| aiosqlite | 0.22.1 | MIT License | https://aiosqlite.omnilib.dev |
| annotated-doc | 0.0.4 | MIT | https://github.com/fastapi/annotated-doc |
| annotated-types | 0.7.0 | MIT License | https://github.com/annotated-types/annotated-types |
| anyio | 4.14.2 | MIT | https://anyio.readthedocs.io/en/stable/versionhistory.html |
| bcrypt | 5.0.0 | Apache Software License | https://github.com/pyca/bcrypt/ |
| blinker | 1.9.0 | MIT License | https://github.com/pallets-eco/blinker/ |
| boolean.py | 5.0 | BSD-2-Clause | https://github.com/bastikr/boolean.py |
| CacheControl | 0.14.4 | Apache-2.0 | https://pypi.org/project/CacheControl/ |
| certifi | 2026.2.25 | Mozilla Public License 2.0 (MPL 2.0) | https://github.com/certifi/python-certifi |
| cffi | 2.0.0 | MIT | https://cffi.readthedocs.io/en/latest/whatsnew.html |
| charset-normalizer | 3.4.7 | MIT | https://github.com/jawah/charset_normalizer/blob/master/CHANGELOG.md |
| click | 8.3.3 | BSD-3-Clause | https://github.com/pallets/click/ |
| colorama | 0.4.6 | BSD License | https://github.com/tartley/colorama |
| cryptography | 50.0.0 | Apache-2.0 OR BSD-3-Clause | https://github.com/pyca/cryptography |
| cyclonedx-python-lib | 11.7.0 | Apache Software License | https://github.com/CycloneDX/cyclonedx-python-lib/#readme |
| defusedxml | 0.7.1 | Python Software Foundation License | https://github.com/tiran/defusedxml |
| Deprecated | 1.3.1 | MIT License | https://github.com/laurent-laporte-pro/deprecated |
| fastapi | 0.136.0 | MIT | https://github.com/fastapi/fastapi |
| filelock | 3.29.0 | MIT | https://github.com/tox-dev/py-filelock |
| Flask | 3.1.3 | BSD-3-Clause | https://github.com/pallets/flask/ |
| flask-cors | 6.0.2 | MIT | https://corydolphin.github.io/flask-cors/ |
| greenlet | 3.4.0 | MIT AND PSF-2.0 | https://greenlet.readthedocs.io |
| h11 | 0.16.0 | MIT License | https://github.com/python-hyper/h11 |
| httpcore | 1.0.9 | BSD-3-Clause | https://www.encode.io/httpcore/ |
| httptools | 0.7.1 | MIT | https://github.com/MagicStack/httptools |
| httpx | 0.28.1 | BSD License | https://github.com/encode/httpx |
| idna | 3.15 | BSD-3-Clause | https://github.com/kjd/idna |
| iniconfig | 2.3.0 | MIT | https://github.com/pytest-dev/iniconfig |
| itsdangerous | 2.2.0 | BSD License | https://github.com/pallets/itsdangerous/ |
| Jinja2 | 3.1.6 | BSD License | https://github.com/pallets/jinja/ |
| license-expression | 30.4.4 | Apache-2.0 | https://github.com/aboutcode-org/license-expression |
| limits | 5.8.0 | MIT | https://limits.readthedocs.org |
| markdown-it-py | 4.0.0 | MIT License | https://github.com/executablebooks/markdown-it-py |
| MarkupSafe | 3.0.3 | BSD-3-Clause | https://github.com/pallets/markupsafe/ |
| mdurl | 0.1.2 | MIT License | https://github.com/executablebooks/mdurl |
| msgpack | 1.2.1 | Apache-2.0 | https://msgpack.org/ |
| packageurl-python | 0.17.6 | MIT License | https://github.com/package-url/packageurl-python |
| packaging | 26.1 | Apache-2.0 OR BSD-2-Clause | https://github.com/pypa/packaging |
| passlib | 1.7.4 | BSD | https://passlib.readthedocs.io |
| pillow | 12.3.0 | MIT-CMU | https://python-pillow.github.io |
| pip-api | 0.0.34 | Apache Software License | http://github.com/di/pip-api |
| pip-requirements-parser | 32.0.1 | MIT | https://github.com/nexB/pip-requirements-parser |
| pip_audit | 2.10.0 | Apache Software License | https://pypi.org/project/pip-audit/ |
| platformdirs | 4.9.6 | MIT | https://github.com/tox-dev/platformdirs |
| pluggy | 1.6.0 | MIT License | UNKNOWN |
| psycopg | 3.3.3 | LGPL-3.0-only | https://psycopg.org/ |
| psycopg-binary | 3.3.3 | LGPL-3.0-only | https://psycopg.org/ |
| py-serializable | 2.1.0 | Apache Software License | https://github.com/madpah/serializable#readme |
| pycparser | 3.0 | BSD-3-Clause | https://github.com/eliben/pycparser |
| pydantic | 2.13.2 | MIT | https://github.com/pydantic/pydantic |
| pydantic-settings | 2.14.2 | MIT | https://github.com/pydantic/pydantic-settings |
| pydantic_core | 2.46.2 | MIT | https://github.com/pydantic |
| Pygments | 2.20.0 | BSD-2-Clause | https://pygments.org |
| PyJWT | 2.13.0 | MIT | https://github.com/jpadilla/pyjwt |
| pyparsing | 3.3.2 | MIT | https://github.com/pyparsing/pyparsing/ |
| pytest | 9.0.3 | MIT | https://docs.pytest.org/en/latest/ |
| pytest-asyncio | 1.3.0 | Apache-2.0 | https://github.com/pytest-dev/pytest-asyncio |
| python-dotenv | 1.2.2 | BSD-3-Clause | https://github.com/theskumar/python-dotenv |
| python-frontmatter | 1.1.0 | MIT License | https://github.com/eyeseast/python-frontmatter |
| python-json-logger | 4.1.0 | BSD-2-Clause | https://nhairs.github.io/python-json-logger |
| python-magic | 0.4.27 | MIT License | http://github.com/ahupp/python-magic |
| python-multipart | 0.0.31 | Apache-2.0 | https://github.com/Kludex/python-multipart |
| PyYAML | 6.0.3 | MIT License | https://pyyaml.org/ |
| requests | 2.33.1 | Apache Software License | https://github.com/psf/requests |
| rich | 15.0.0 | MIT License | https://github.com/Textualize/rich |
| slowapi | 0.1.9 | MIT License | https://github.com/laurents/slowapi |
| sortedcontainers | 2.4.0 | Apache Software License | http://www.grantjenks.com/docs/sortedcontainers/ |
| SQLAlchemy | 2.0.49 | MIT | https://www.sqlalchemy.org |
| starlette | 1.3.1 | BSD-3-Clause | https://github.com/Kludex/starlette |
| structlog | 25.5.0 | MIT OR Apache-2.0 | https://github.com/hynek/structlog/blob/main/CHANGELOG.md |
| tomli_w | 1.2.0 | MIT License | https://github.com/hukkin/tomli-w |
| typing-inspection | 0.4.2 | MIT | https://github.com/pydantic/typing-inspection |
| typing_extensions | 4.15.0 | PSF-2.0 | https://github.com/python/typing_extensions |
| tzdata | 2026.1 | Apache-2.0 | https://github.com/python/tzdata |
| urllib3 | 2.7.0 | MIT | https://github.com/urllib3/urllib3/blob/main/CHANGES.rst |
| uvicorn | 0.44.0 | BSD-3-Clause | https://uvicorn.dev/ |
| watchfiles | 1.1.1 | MIT License | https://github.com/samuelcolvin/watchfiles |
| websockets | 16.0 | BSD-3-Clause | https://github.com/python-websockets/websockets |
| Werkzeug | 3.1.8 | BSD-3-Clause | https://github.com/pallets/werkzeug/ |
| wrapt | 2.1.2 | BSD-2-Clause | https://github.com/GrahamDumpleton/wrapt |

## Consola (npm, dependencias de producción) — 133 paquetes

| Paquete | Licencia | Repositorio |
|---|---|---|
| @babel/code-frame@7.29.7 | MIT | https://github.com/babel/babel |
| @babel/generator@7.29.8 | MIT | https://github.com/babel/babel |
| @babel/helper-globals@7.29.7 | MIT | https://github.com/babel/babel |
| @babel/helper-module-imports@7.29.7 | MIT | https://github.com/babel/babel |
| @babel/helper-string-parser@7.29.7 | MIT | https://github.com/babel/babel |
| @babel/helper-validator-identifier@7.29.7 | MIT | https://github.com/babel/babel |
| @babel/parser@7.29.9 | MIT | https://github.com/babel/babel |
| @babel/runtime@7.29.2 | MIT | https://github.com/babel/babel |
| @babel/template@7.29.7 | MIT | https://github.com/babel/babel |
| @babel/traverse@7.29.8 | MIT | https://github.com/babel/babel |
| @babel/types@7.29.8 | MIT | https://github.com/babel/babel |
| @emotion/babel-plugin@11.13.5 | MIT | https://github.com/emotion-js/emotion/tree/main/packages/babel-plugin |
| @emotion/cache@11.14.0 | MIT | https://github.com/emotion-js/emotion/tree/main/packages/cache |
| @emotion/hash@0.9.2 | MIT | https://github.com/emotion-js/emotion/tree/main/packages/hash |
| @emotion/is-prop-valid@1.4.0 | MIT | https://github.com/emotion-js/emotion/tree/main/packages/is-prop-valid |
| @emotion/memoize@0.9.0 | MIT | https://github.com/emotion-js/emotion/tree/main/packages/memoize |
| @emotion/react@11.14.0 | MIT | https://github.com/emotion-js/emotion/tree/main/packages/react |
| @emotion/serialize@1.3.3 | MIT | https://github.com/emotion-js/emotion/tree/main/packages/serialize |
| @emotion/sheet@1.4.0 | MIT | https://github.com/emotion-js/emotion/tree/main/packages/sheet |
| @emotion/styled@11.14.1 | MIT | https://github.com/emotion-js/emotion/tree/main/packages/styled |
| @emotion/unitless@0.10.0 | MIT | https://github.com/emotion-js/emotion/tree/main/packages/unitless |
| @emotion/use-insertion-effect-with-fallbacks@1.2.0 | MIT | https://github.com/emotion-js/emotion/tree/main/packages/use-insertion-effect-with-fallbacks |
| @emotion/utils@1.4.2 | MIT | https://github.com/emotion-js/emotion/tree/main/packages/utils |
| @emotion/weak-memoize@0.4.0 | MIT | https://github.com/emotion-js/emotion/tree/main/packages/weak-memoize |
| @jridgewell/gen-mapping@0.3.13 | MIT | https://github.com/jridgewell/sourcemaps |
| @jridgewell/resolve-uri@3.1.2 | MIT | https://github.com/jridgewell/resolve-uri |
| @jridgewell/sourcemap-codec@1.5.5 | MIT | https://github.com/jridgewell/sourcemaps |
| @jridgewell/trace-mapping@0.3.31 | MIT | https://github.com/jridgewell/sourcemaps |
| @mui/core-downloads-tracker@6.5.0 | MIT | https://github.com/mui/material-ui |
| @mui/icons-material@6.5.0 | MIT | https://github.com/mui/material-ui |
| @mui/material@6.5.0 | MIT | https://github.com/mui/material-ui |
| @mui/private-theming@6.4.9 | MIT | https://github.com/mui/material-ui |
| @mui/styled-engine@6.5.0 | MIT | https://github.com/mui/material-ui |
| @mui/system@6.5.0 | MIT | https://github.com/mui/material-ui |
| @mui/types@7.2.24 | MIT | https://github.com/mui/material-ui |
| @mui/utils@6.4.9 | MIT | https://github.com/mui/material-ui |
| @popperjs/core@2.11.8 | MIT | https://github.com/popperjs/popper-core |
| @reduxjs/toolkit@2.11.2 | MIT | https://github.com/reduxjs/redux-toolkit |
| @standard-schema/spec@1.1.0 | MIT | https://github.com/standard-schema/standard-schema |
| @standard-schema/utils@0.3.0 | MIT | https://github.com/standard-schema/standard-schema |
| @types/geojson@7946.0.16 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/leaflet@1.9.21 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/pako@2.0.4 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/parse-json@4.0.2 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/prop-types@15.7.15 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/raf@3.4.3 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/react-transition-group@4.4.12 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/react@19.2.14 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/trusted-types@2.0.7 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/use-sync-external-store@0.0.6 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| babel-plugin-macros@3.1.0 | MIT | https://github.com/kentcdodds/babel-plugin-macros |
| base64-arraybuffer@1.0.2 | MIT | https://github.com/niklasvh/base64-arraybuffer |
| callsites@3.1.0 | MIT | https://github.com/sindresorhus/callsites |
| canvg@3.0.11 | MIT | https://github.com/canvg/canvg |
| clsx@2.1.1 | MIT | https://github.com/lukeed/clsx |
| convert-source-map@1.9.0 | MIT | https://github.com/thlorenz/convert-source-map |
| cookie@1.1.1 | MIT | https://github.com/jshttp/cookie |
| core-js@3.49.0 | MIT | https://github.com/zloirock/core-js |
| cosmiconfig@7.1.0 | MIT | https://github.com/davidtheclark/cosmiconfig |
| css-line-break@2.1.0 | MIT | https://github.com/niklasvh/css-line-break |
| csstype@3.2.3 | MIT | https://github.com/frenic/csstype |
| debug@4.4.3 | MIT | https://github.com/debug-js/debug |
| dom-helpers@5.2.1 | MIT | https://github.com/react-bootstrap/dom-helpers |
| dompurify@3.4.16 | (MPL-2.0 OR Apache-2.0) | https://github.com/cure53/DOMPurify |
| error-ex@1.3.4 | MIT | https://github.com/qix-/node-error-ex |
| es-errors@1.3.0 | MIT | https://github.com/ljharb/es-errors |
| escape-string-regexp@4.0.0 | MIT | https://github.com/sindresorhus/escape-string-regexp |
| fast-equals@4.0.3 | MIT | https://github.com/planttheidea/fast-equals |
| fast-png@6.4.0 | MIT | https://github.com/image-js/fast-png |
| fflate@0.8.3 | MIT | https://github.com/101arrowz/fflate |
| find-root@1.1.0 | MIT | https://github.com/js-n/find-root |
| framer-motion@12.38.0 | MIT | https://github.com/motiondivision/motion |
| function-bind@1.1.2 | MIT | https://github.com/Raynos/function-bind |
| hasown@2.0.4 | MIT | https://github.com/inspect-js/hasOwn |
| hoist-non-react-statics@3.3.2 | BSD-3-Clause | https://github.com/mridgway/hoist-non-react-statics |
| html2canvas@1.4.1 | MIT | https://github.com/niklasvh/html2canvas |
| immer@11.1.7 | MIT | https://github.com/immerjs/immer |
| import-fresh@3.3.1 | MIT | https://github.com/sindresorhus/import-fresh |
| iobuffer@5.4.0 | MIT | https://github.com/image-js/iobuffer |
| is-arrayish@0.2.1 | MIT | https://github.com/qix-/node-is-arrayish |
| is-core-module@2.16.1 | MIT | https://github.com/inspect-js/is-core-module |
| js-tokens@4.0.0 | MIT | https://github.com/lydell/js-tokens |
| jsesc@3.1.0 | MIT | https://github.com/mathiasbynens/jsesc |
| json-parse-even-better-errors@2.3.1 | MIT | https://github.com/npm/json-parse-even-better-errors |
| jspdf@4.2.1 | MIT | https://github.com/parallax/jsPDF |
| leaflet@1.9.4 | BSD-2-Clause | https://github.com/Leaflet/Leaflet |
| lines-and-columns@1.2.4 | MIT | https://github.com/eventualbuddha/lines-and-columns |
| loose-envify@1.4.0 | MIT | https://github.com/zertosh/loose-envify |
| lucide-react@1.48.0 | ISC | https://github.com/lucide-icons/lucide |
| motion-dom@12.38.0 | MIT | https://github.com/motiondivision/motion |
| motion-utils@12.36.0 | MIT | https://github.com/motiondivision/motion |
| ms@2.1.3 | MIT | https://github.com/vercel/ms |
| object-assign@4.1.1 | MIT | https://github.com/sindresorhus/object-assign |
| pako@2.1.0 | (MIT AND Zlib) | https://github.com/nodeca/pako |
| parent-module@1.0.1 | MIT | https://github.com/sindresorhus/parent-module |
| parse-json@5.2.0 | MIT | https://github.com/sindresorhus/parse-json |
| path-parse@1.0.7 | MIT | https://github.com/jbgutierrez/path-parse |
| path-type@4.0.0 | MIT | https://github.com/sindresorhus/path-type |
| performance-now@2.1.0 | MIT | https://github.com/braveg1rl/performance-now |
| picocolors@1.1.1 | ISC | https://github.com/alexeyraspopov/picocolors |
| prop-types@15.8.1 | MIT | https://github.com/facebook/prop-types |
| raf@3.4.1 | MIT | https://github.com/chrisdickinson/raf |
| react-dom@19.2.5 | MIT | https://github.com/facebook/react |
| react-draggable@4.5.0 | MIT | https://github.com/react-grid-layout/react-draggable |
| react-grid-layout@2.2.3 | MIT | https://github.com/STRML/react-grid-layout |
| react-is@16.13.1 | MIT | https://github.com/facebook/react |
| react-is@19.2.5 | MIT | https://github.com/facebook/react |
| react-redux@9.2.0 | MIT | https://github.com/reduxjs/react-redux |
| react-resizable@3.1.3 | MIT | https://github.com/react-grid-layout/react-resizable |
| react-router-dom@7.18.4 | MIT | https://github.com/remix-run/react-router |
| react-router@7.18.4 | MIT | https://github.com/remix-run/react-router |
| react-transition-group@4.4.5 | BSD-3-Clause | https://github.com/reactjs/react-transition-group |
| react@19.2.5 | MIT | https://github.com/facebook/react |
| redux-thunk@3.1.0 | MIT | https://github.com/reduxjs/redux-thunk |
| redux@5.0.1 | MIT | https://github.com/reduxjs/redux |
| regenerator-runtime@0.13.11 | MIT | https://github.com/facebook/regenerator/tree/main/packages/runtime |
| reselect@5.1.1 | MIT | https://github.com/reduxjs/reselect |
| resize-observer-polyfill@1.5.1 | MIT | https://github.com/que-etc/resize-observer-polyfill |
| resolve-from@4.0.0 | MIT | https://github.com/sindresorhus/resolve-from |
| resolve@1.22.12 | MIT | https://github.com/browserify/resolve |
| rgbcolor@1.0.1 | MIT* | https://github.com/yetzt/node-rgbcolor |
| scheduler@0.27.0 | MIT | https://github.com/facebook/react |
| set-cookie-parser@2.7.2 | MIT | https://github.com/nfriedly/set-cookie-parser |
| source-map@0.5.7 | BSD-3-Clause | https://github.com/mozilla/source-map |
| stackblur-canvas@2.7.0 | MIT | https://github.com/flozz/StackBlur |
| stylis@4.2.0 | MIT | https://github.com/thysultan/stylis.js |
| supports-preserve-symlinks-flag@1.0.0 | MIT | https://github.com/inspect-js/node-supports-preserve-symlinks-flag |
| svg-pathdata@6.0.3 | MIT | https://github.com/nfroidure/svg-pathdata |
| text-segmentation@1.0.3 | MIT | https://github.com/niklasvh/text-segmentation |
| tslib@2.8.1 | 0BSD | https://github.com/Microsoft/tslib |
| use-sync-external-store@1.6.0 | MIT | https://github.com/facebook/react |
| utrie@1.0.2 | MIT | https://github.com/niklasvh/utrie |
| yaml@1.10.3 | ISC | https://github.com/eemeli/yaml |
