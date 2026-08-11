# MCP Mercado Libre Argentina para ChatGPT Business

Servidor MCP remoto en TypeScript para analizar Mercado Libre Argentina (`MLA`), preparar publicaciones, calcular el neto de la vendedora y publicar **únicamente** después de una confirmación explícita.

> Estado inicial seguro: `MELI_MODE=mock`. Ninguna prueba de este proyecto crea ni modifica publicaciones reales.

## Qué hace

- Recibe datos de un producto, referencias de imágenes HTTPS o un Excel `.xlsx` en base64.
- Busca productos comparables y filtra diferencias de forma, medida, material y packs.
- Calcula mínimo, máximo, promedio, mediana y tres estrategias de precio.
- Consulta tarifas y envío en Mercado Libre en modo live. Todo costo que no pueda verificarse queda marcado como desconocido.
- Muestra siempre precio, cargos, envío, costo financiero, otros cargos y **NETO ESTIMADO A COBRAR**.
- Si se informa el costo de compra, muestra ganancia y margen.
- Calcula cuatro publicaciones con el mismo neto: base, cuotas, envío gratis y cuotas + envío gratis.
- Prepara borradores y procesa Excel sin publicar.
- Protege toda escritura con `confirmed=true` y `confirmation_word="PUBLICAR"`.

## Herramientas MCP (14)

| Herramienta | Acción | Escritura |
|---|---|---:|
| `meli_auth_status` | Cuenta conectada, seller id y nickname | No |
| `meli_search_similar_products` | Busca y filtra comparables MLA | No |
| `meli_price_analysis` | Estadística y precios sugeridos | No |
| `meli_get_category` | Predictor oficial de categoría | No |
| `meli_get_required_attributes` | Obligatorios y faltantes | No |
| `meli_estimate_sale` | Cargos, neto, ganancia y margen | No |
| `meli_generate_price_variants` | Cuatro precios con igual neto | No |
| `meli_prepare_listing` | Vista previa completa | No |
| `meli_create_listing` | Crea la publicación | **Sí, exige PUBLICAR** |
| `meli_update_listing` | Precio, stock, atributos o estado | **Sí, exige PUBLICAR** |
| `meli_pause_listing` | Pausa una publicación | **Sí, exige PUBLICAR** |
| `meli_get_listing` | Consulta una publicación propia | No |
| `meli_list_my_listings` | Lista publicaciones propias | No |
| `meli_process_excel` | Convierte Excel en borradores | No |

Las herramientas incluyen anotaciones MCP de lectura/escritura para que el cliente pueda exigir aprobaciones adicionales.

## Requisitos

- Node.js 20 o superior (se recomienda Node 22).
- Una app creada en Mercado Libre Developers.
- Un servidor con HTTPS público para conectarlo desde ChatGPT Business.
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

## Crear la aplicación en Mercado Libre

1. Ingresá al portal de desarrolladores de Mercado Libre con tu cuenta.
2. Creá una aplicación para Mercado Libre Argentina y habilitá permisos de lectura, escritura y acceso offline si el formulario los ofrece.
3. Configurá una Redirect URI fija y HTTPS, por ejemplo:

   `https://meli-mcp.tu-dominio.com/oauth/meli/callback`

4. Copiá el App ID en `MELI_CLIENT_ID` y la Secret Key en `MELI_CLIENT_SECRET` dentro de las variables secretas del hosting. Nunca las pegues en ChatGPT ni las subas a Git.
5. Usá primero usuarios de prueba de Mercado Libre. No cambies `MELI_MODE` a `live` hasta terminar toda la verificación.

Mercado Libre usa `https://auth.mercadolibre.com.ar/authorization` para autorizar y `POST https://api.mercadolibre.com/oauth/token` para intercambiar/renovar tokens. El refresh token rota y solo el último es válido; el proyecto lo guarda cifrado y lo reemplaza de forma atómica.

## Configurar OAuth

Generá secretos largos:

```bash
openssl rand -hex 32
```

Completá las variables:

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

Después del despliegue, abrí en tu navegador:

`https://meli-mcp.tu-dominio.com/oauth/meli/start`

Mercado Libre mostrará su propia pantalla de ingreso y permisos. La app nunca solicita ni recibe tu contraseña.

## Despliegue

### Opción Render con Docker

El repositorio incluye `Dockerfile` y `render.yaml`.

1. Subí el proyecto a un repositorio privado.
2. En Render elegí **New > Blueprint** y seleccioná el repositorio.
3. Cargá las variables secretas. Conservá el disco persistente montado en `/app/data`.
4. Primero dejá `MELI_MODE=mock` y ejecutá la verificación.
5. Configurá el dominio HTTPS definitivo y actualizá `PUBLIC_BASE_URL`, `MELI_REDIRECT_URI` y la Redirect URI en Mercado Libre.
6. Cuando todo esté validado con una cuenta de prueba, cambiá `MELI_MODE=live`.

También funciona en cualquier hosting Docker con HTTPS y volumen persistente. En producción conviene mover el token cifrado a una base de datos/secret manager administrado y limitar el acceso de red.

## URL para ChatGPT Business

La URL exacta que se coloca como servidor MCP es:

`https://TU-DOMINIO/mcp`

Ejemplo si Render asigna `https://meli-chatgpt-mcp.onrender.com`:

`https://meli-chatgpt-mcp.onrender.com/mcp`

No puede conocerse la URL final antes de desplegar porque el dominio lo asigna el proveedor. No uses `localhost`: ChatGPT necesita un endpoint HTTPS alcanzable desde Internet.

En el panel de administración de ChatGPT Business, creá la app MCP personalizada, pegá esa URL y configurá el encabezado `Authorization` con `Bearer <MCP_API_KEY>` si tu interfaz admite encabezados personalizados. La [API oficial de OpenAI para MCP remoto](https://platform.openai.com/docs/api-reference/responses-streaming/response/mcp_call_arguments) contempla `server_url`, encabezados y aprobación selectiva de herramientas. La disponibilidad y los nombres exactos del menú en ChatGPT Business dependen del workspace; si el panel exige OAuth del propio servidor MCP en vez de encabezados, hace falta agregar un proveedor OAuth delante del endpoint antes de habilitarlo para todo el equipo.

Configurá las herramientas de escritura (`meli_create_listing`, `meli_update_listing`, `meli_pause_listing`) para requerir aprobación. La defensa del servidor sigue activa aunque el cliente esté mal configurado.

## Flujo recomendado desde ChatGPT

1. Enviá la foto, nombre, medida, material, color, stock y costo si lo conocés.
2. ChatGPT llama a búsqueda, categoría, atributos, análisis de precio y estimación de neto.
3. Revisá la vista previa que debe decir `BORRADOR - NO PUBLICADO`.
4. Corregí atributos faltantes o costos desconocidos.
5. Solo cuando estés conforme, escribí exactamente `PUBLICAR`.
6. ChatGPT podrá llamar a creación con los dos controles requeridos.

Para Excel, las columnas reconocidas son SKU, Producto, Descripción, Medida, Material, Color, Stock, Costo, Precio deseado, Marca e Imagen. No son todas obligatorias; cada fila devuelve `missing`. El Excel se resume primero y no existe una herramienta de publicación masiva automática.

## Imágenes

El borrador acepta URLs HTTPS. En live, las referencias se envían mediante el mecanismo documentado de `pictures.source`; las imágenes no se editan. Una referencia no HTTPS se rechaza. Mercado Libre puede aplicar validaciones adicionales de tamaño, fondo, marca de agua y calidad al crear el ítem; el error oficial se devuelve sin esconderlo, pero sin incluir tokens.

## Cómo se calculan los costos

- Tarifas: `GET /sites/MLA/listing_prices` con precio, categoría y tipo de publicación.
- Envío: `GET /users/{user_id}/shipping_options/free` con precio, dimensiones, tipo de publicación, modo y tipo logístico.
- Si faltan dimensiones o `logistic_type`, el envío se marca como desconocido.
- El cálculo inverso busca el menor precio entero cuyo neto sea igual o mayor al objetivo. Por construcción nunca queda por debajo.

Mercado Libre indica que los precios visibles están migrando a `/items/{id}/sale_price` y `/items/{id}/prices`, mientras que crear/editar sigue pasando por `/items`; también está desplegando el modelo User Products. El cliente aísla estas llamadas para facilitar la migración, pero la habilitación real depende de los tags y reglas de cada vendedor. Fuentes oficiales: [OAuth](https://developers.mercadolibre.com.ar/es_ar/api-prediccion-categorias/autenticacion-y-autorizacion), [publicar productos](https://developers.mercadolibre.com.ar/es_ar/api-prediccion-categorias/publica-productos), [User Products](https://developers.mercadolibre.com.ar/api-docs/user-products), [tarifas](https://developers.mercadolibre.com.ar/en_us/api-docs/fees-for-listing), [costos de envío](https://developers.mercadolibre.com.ar/es_ar/consulta-usuarios/costos-de-envios), [precios](https://developers.mercadolibre.com.ar/es_ar/costos-de-envio-y-handling-time/api-de-precios) y [categorías](https://developers.mercadolibre.com.ar/es_ar/api-docs-es/dominios-y-categorias).

## Checklist de seguridad

- [x] Contraseñas de Mercado Libre nunca solicitadas ni almacenadas.
- [x] Secretos solo por variables de entorno; `.env` ignorado por Git.
- [x] Access y refresh tokens cifrados en reposo con AES-256-GCM.
- [x] Refresh automático cinco minutos antes de vencer y persistencia del nuevo refresh token.
- [x] Escritura atómica del archivo de tokens y permisos restrictivos.
- [x] Logs sin secretos ni cuerpos de OAuth.
- [x] Endpoint MCP protegido por Bearer token y comparación resistente a timing.
- [x] Herramientas declaradas read-only o destructivas mediante anotaciones MCP.
- [x] Crear, actualizar y pausar exigen `confirmed=true` más `PUBLICAR`.
- [x] Mock por defecto; ninguna publicación real en tests.
- [x] Límite de Excel de 10 MB y solo `.xlsx`.
- [ ] En producción: secret manager, rotación, copias de seguridad y auditoría central.
- [ ] En producción: rate limit/WAF, allowlist cuando sea posible y alertas de errores OAuth.
- [ ] Antes de live: validar usuario de prueba, User Products y reglas actuales de la categoría elegida.

## Límites deliberados

- No inventa cuotas, reputación, ventas, envío ni comisiones si la API no los devuelve.
- No analiza visualmente una imagen: ChatGPT puede describir la foto y pasar esos datos, mientras MCP conserva la referencia original.
- No modifica fotografías.
- No elimina publicaciones; solo permite pausa explícita.
- La equivalencia de comparables es heurística y debe revisarse antes de aceptar un precio.
- El archivo cifrado sirve para una sola cuenta. Para un workspace multi-vendedor debe reemplazarse por almacenamiento por usuario/tenant y OAuth del servidor MCP.
