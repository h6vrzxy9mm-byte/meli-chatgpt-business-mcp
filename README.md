# MCP Mercado Libre Argentina para ChatGPT Business

Servidor MCP remoto en TypeScript para analizar Mercado Libre Argentina (`MLA`), preparar publicaciones, calcular el neto de la vendedora y publicar **Ãºnicamente** despuÃ©s de una confirmaciÃ³n explÃ­cita.

> Estado inicial seguro: `MELI_MODE=mock`. Ninguna prueba de este proyecto crea ni modifica publicaciones reales.

## QuÃ© hace

- Recibe datos de un producto, referencias de imÃ¡genes HTTPS o un Excel `.xlsx` en base64.
- Busca productos comparables y filtra diferencias de forma, medida, material y packs.
- Calcula mÃ­nimo, mÃ¡ximo, promedio, mediana y tres estrategias de precio.
- Consulta tarifas y envÃ­o en Mercado Libre en modo live. Todo costo que no pueda verificarse queda marcado como desconocido.
- Muestra siempre precio, cargos, envÃ­o, costo financiero, otros cargos y **NETO ESTIMADO A COBRAR**.
- Si se informa el costo de compra, muestra ganancia y margen.
- Calcula cuatro publicaciones con el mismo neto: base, cuotas, envÃ­o gratis y cuotas + envÃ­o gratis.
- Prepara borradores y procesa Excel sin publicar.
- Protege toda escritura con `confirmed=true` y `confirmation_word="PUBLICAR"`.

## Herramientas MCP (14)

| Herramienta | AcciÃ³n | Escritura |
|---|---|---:|
| `meli_auth_status` | Cuenta conectada, seller id y nickname | No |
| `meli_search_similar_products` | Busca y filtra comparables MLA | No |
| `meli_price_analysis` | EstadÃ­stica y precios sugeridos | No |
| `meli_get_category` | Predictor oficial de categorÃ­a | No |
| `meli_get_required_attributes` | Obligatorios y faltantes | No |
| `meli_estimate_sale` | Cargos, neto, ganancia y margen | No |
| `meli_generate_price_variants` | Cuatro precios con igual neto | No |
| `meli_prepare_listing` | Vista previa completa | No |
| `meli_create_listing` | Crea la publicaciÃ³n | **SÃ­, exige PUBLICAR** |
| `meli_update_listing` | Precio, stock, atributos o estado | **SÃ­, exige PUBLICAR** |
| `meli_pause_listing` | Pausa una publicaciÃ³n | **SÃ­, exige PUBLICAR** |
| `meli_get_listing` | Consulta una publicaciÃ³n propia | No |
| `meli_list_my_listings` | Lista publicaciones propias | No |
| `meli_process_excel` | Convierte Excel en borradores | No |

Las herramientas incluyen anotaciones MCP de lectura/escritura para que el cliente pueda exigir aprobaciones adicionales.

## Requisitos

- Node.js 20 o superior (se recomienda Node 22).
- Una app creada en Mercado Libre Developers.
- Un servidor con HTTPS pÃºblico para conectarlo desde ChatGPT Business.
- Acceso de administrador al workspace de ChatGPT Business para agregar una app MCP personalizada.

## Prueba local segura

```bash
cp .env.example .env
npm install
npm run check
```

En Windows PowerShell:

```powershell
Copy-Item .env.example .env
npm.cmd install
npm.cmd run check
```

Resultado esperado del flujo integrado:

```json
{
  "auth": true,
  "comparable_count": 7,
  "analysis": true,
  "category": true,
  "variants": true,
  "preview": true,
  "real_publish_blocked": true
}
```

Para iniciar el endpoint MCP local:

```bash
npm run dev
```

- Salud: `http://localhost:3000/health`
- MCP: `http://localhost:3000/mcp`
- Conectar Mercado Libre: `http://localhost:3000/oauth/meli/start`

El endpoint `/mcp` requiere `Authorization: Bearer <MCP_API_KEY>`. No se escribe el token en logs.

## Crear la aplicaciÃ³n en Mercado Libre

1. IngresÃ¡ al portal de desarrolladores de Mercado Libre con tu cuenta.
2. CreÃ¡ una aplicaciÃ³n para Mercado Libre Argentina y habilitÃ¡ permisos de lectura, escritura y acceso offline si el formulario los ofrece.
3. ConfigurÃ¡ una Redirect URI fija y HTTPS, por ejemplo:

   `https://meli-mcp.tu-dominio.com/oauth/meli/callback`

4. CopiÃ¡ el App ID en `MELI_CLIENT_ID` y la Secret Key en `MELI_CLIENT_SECRET` dentro de las variables secretas del hosting. Nunca las pegues en ChatGPT ni las subas a Git.
5. UsÃ¡ primero usuarios de prueba de Mercado Libre. No cambies `MELI_MODE` a `live` hasta terminar toda la verificaciÃ³n.

Mercado Libre usa `https://auth.mercadolibre.com.ar/authorization` para autorizar y `POST https://api.mercadolibre.com/oauth/token` para intercambiar/renovar tokens. El refresh token rota y solo el Ãºltimo es vÃ¡lido; el proyecto lo guarda cifrado y lo reemplaza de forma atÃ³mica.

## Configurar OAuth

GenerÃ¡ secretos largos:

```bash
openssl rand -hex 32
```

CompletÃ¡ las variables:

```dotenv
MELI_CLIENT_ID=...
MELI_CLIENT_SECRET=...
MELI_REDIRECT_URI=https://meli-mcp.tu-dominio.com/oauth/meli/callback
SESSION_SECRET=64-caracteres-aleatorios
PUBLIC_BASE_URL=https://meli-mcp.tu-dominio.com
MCP_API_KEY=otra-clave-aleatoria-larga
MELI_MODE=mock
TOKEN_STORE_PATH=/app/data/tokens.enc
```

DespuÃ©s del despliegue, abrÃ­ en tu navegador:

`https://meli-mcp.tu-dominio.com/oauth/meli/start`

Mercado Libre mostrarÃ¡ su propia pantalla de ingreso y permisos. La app nunca solicita ni recibe tu contraseÃ±a.

## Despliegue

### OpciÃ³n Render con Docker

El repositorio incluye `Dockerfile` y `render.yaml`.

1. SubÃ­ el proyecto a un repositorio privado.
2. En Render elegÃ­ **New > Blueprint** y seleccionÃ¡ el repositorio.
3. CargÃ¡ las variables secretas. ConservÃ¡ el disco persistente montado en `/app/data`.
4. Primero dejÃ¡ `MELI_MODE=mock` y ejecutÃ¡ la verificaciÃ³n.
5. ConfigurÃ¡ el dominio HTTPS definitivo y actualizÃ¡ `PUBLIC_BASE_URL`, `MELI_REDIRECT_URI` y la Redirect URI en Mercado Libre.
6. Cuando todo estÃ© validado con una cuenta de prueba, cambiÃ¡ `MELI_MODE=live`.

TambiÃ©n funciona en cualquier hosting Docker con HTTPS y volumen persistente. En producciÃ³n conviene mover el token cifrado a una base de datos/secret manager administrado y limitar el acceso de red.

## URL para ChatGPT Business

La URL exacta que se coloca como servidor MCP es:

`https://TU-DOMINIO/mcp`

Ejemplo si Render asigna `https://meli-chatgpt-mcp.onrender.com`:

`https://meli-chatgpt-mcp.onrender.com/mcp`

No puede conocerse la URL final antes de desplegar porque el dominio lo asigna el proveedor. No uses `localhost`: ChatGPT necesita un endpoint HTTPS alcanzable desde Internet.

En el panel de administraciÃ³n de ChatGPT Business, creÃ¡ la app MCP personalizada, pegÃ¡ esa URL y configurÃ¡ el encabezado `Authorization` con `Bearer <MCP_API_KEY>` si tu interfaz admite encabezados personalizados. La [API oficial de OpenAI para MCP remoto](https://platform.openai.com/docs/api-reference/responses-streaming/response/mcp_call_arguments) contempla `server_url`, encabezados y aprobaciÃ³n selectiva de herramientas. La disponibilidad y los nombres exactos del menÃº en ChatGPT Business dependen del workspace; si el panel exige OAuth del propio servidor MCP en vez de encabezados, hace falta agregar un proveedor OAuth delante del endpoint antes de habilitarlo para todo el equipo.

ConfigurÃ¡ las herramientas de escritura (`meli_create_listing`, `meli_update_listing`, `meli_pause_listing`) para requerir aprobaciÃ³n. La defensa del servidor sigue activa aunque el cliente estÃ© mal configurado.

## Flujo recomendado desde ChatGPT

1. EnviÃ¡ la foto, nombre, medida, material, color, stock y costo si lo conocÃ©s.
2. ChatGPT llama a bÃºsqueda, categorÃ­a, atributos, anÃ¡lisis de precio y estimaciÃ³n de neto.
3. RevisÃ¡ la vista previa que debe decir `BORRADOR - NO PUBLICADO`.
4. CorregÃ­ atributos faltantes o costos desconocidos.
5. Solo cuando estÃ©s conforme, escribÃ­ exactamente `PUBLICAR`.
6. ChatGPT podrÃ¡ llamar a creaciÃ³n con los dos controles requeridos.

Para Excel, las columnas reconocidas son SKU, Producto, DescripciÃ³n, Medida, Material, Color, Stock, Costo, Precio deseado, Marca e Imagen. No son todas obligatorias; cada fila devuelve `missing`. El Excel se resume primero y no existe una herramienta de publicaciÃ³n masiva automÃ¡tica.

## ImÃ¡genes

El borrador acepta URLs HTTPS. En live, las referencias se envÃ­an mediante el mecanismo documentado de `pictures.source`; las imÃ¡genes no se editan. Una referencia no HTTPS se rechaza. Mercado Libre puede aplicar validaciones adicionales de tamaÃ±o, fondo, marca de agua y calidad al crear el Ã­tem; el error oficial se devuelve sin esconderlo, pero sin incluir tokens.

## CÃ³mo se calculan los costos

- Tarifas: `GET /sites/MLA/listing_prices` con precio, categorÃ­a y tipo de publicaciÃ³n.
- EnvÃ­o: `GET /users/{user_id}/shipping_options/free` con precio, dimensiones, tipo de publicaciÃ³n, modo y tipo logÃ­stico.
- Si faltan dimensiones o `logistic_type`, el envÃ­o se marca como desconocido.
- El cÃ¡lculo inverso busca el menor precio entero cuyo neto sea igual o mayor al objetivo. Por construcciÃ³n nunca queda por debajo.

Mercado Libre indica que los precios visibles estÃ¡n migrando a `/items/{id}/sale_price` y `/items/{id}/prices`, mientras que crear/editar sigue pasando por `/items`; tambiÃ©n estÃ¡ desplegando el modelo User Products. El cliente aÃ­sla estas llamadas para facilitar la migraciÃ³n, pero la habilitaciÃ³n real depende de los tags y reglas de cada vendedor. Fuentes oficiales: [OAuth](https://developers.mercadolibre.com.ar/es_ar/api-prediccion-categorias/autenticacion-y-autorizacion), [publicar productos](https://developers.mercadolibre.com.ar/es_ar/api-prediccion-categorias/publica-productos), [User Products](https://developers.mercadolibre.com.ar/api-docs/user-products), [tarifas](https://developers.mercadolibre.com.ar/en_us/api-docs/fees-for-listing), [costos de envÃ­o](https://developers.mercadolibre.com.ar/es_ar/consulta-usuarios/costos-de-envios), [precios](https://developers.mercadolibre.com.ar/es_ar/costos-de-envio-y-handling-time/api-de-precios) y [categorÃ­as](https://developers.mercadolibre.com.ar/es_ar/api-docs-es/dominios-y-categorias).

## Checklist de seguridad

- [x] ContraseÃ±as de Mercado Libre nunca solicitadas ni almacenadas.
- [x] Secretos solo por variables de entorno; `.env` ignorado por Git.
- [x] Access y refresh tokens cifrados en reposo con AES-256-GCM.
- [x] Refresh automÃ¡tico cinco minutos antes de vencer y persistencia del nuevo refresh token.
- [x] Escritura atÃ³mica del archivo de tokens y permisos restrictivos.
- [x] Logs sin secretos ni cuerpos de OAuth.
- [x] Endpoint MCP protegido por Bearer token y comparaciÃ³n resistente a timing.
- [x] Herramientas declaradas read-only o destructivas mediante anotaciones MCP.
- [x] Crear, actualizar y pausar exigen `confirmed=true` mÃ¡s `PUBLICAR`.
- [x] Mock por defecto; ninguna publicaciÃ³n real en tests.
- [x] LÃ­mite de Excel de 10 MB y solo `.xlsx`.
- [ ] En producciÃ³n: secret manager, rotaciÃ³n, copias de seguridad y auditorÃ­a central.
- [ ] En producciÃ³n: rate limit/WAF, allowlist cuando sea posible y alertas de errores OAuth.
- [ ] Antes de live: validar usuario de prueba, User Products y reglas actuales de la categorÃ­a elegida.

## LÃ­mites deliberados

- No inventa cuotas, reputaciÃ³n, ventas, envÃ­o ni comisiones si la API no los devuelve.
- No analiza visualmente una imagen: ChatGPT puede describir la foto y pasar esos datos, mientras MCP conserva la referencia original.
- No modifica fotografÃ­as.
- No elimina publicaciones; solo permite pausa explÃ­cita.
- La equivalencia de comparables es heurÃ­stica y debe revisarse antes de aceptar un precio.
- El archivo cifrado sirve para una sola cuenta. Para un workspace multi-vendedor debe reemplazarse por almacenamiento por usuario/tenant y OAuth del servidor MCP.