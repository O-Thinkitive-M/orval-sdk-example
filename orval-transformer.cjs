/**
 * Orval input transformer — spec sanitizer.
 * =========================================
 *
 * Runs ONCE on the fetched OpenAPI document, BEFORE Orval validates it
 * (see node_modules/orval/dist/config-*.mjs → resolveSpec: transform → validate).
 * Its job: take a spec that is *semantically fine but technically invalid*
 * (the kind Spring/Keycloak back-ends emit) and normalize it so validation
 * passes and generation completes.
 *
 * It only REMOVES/repairs illegal fields — it never invents endpoints or
 * schemas — so the generated SDK stays a faithful mirror of the API.
 *
 * Remove this transformer once the backend emits a spec that validates on its own.
 */

/** Per-type whitelist of properties the OpenAPI 3.0/3.1 spec allows on a security scheme. */
const SECURITY_SCHEME_ALLOWED = {
  apiKey: ['type', 'description', 'name', 'in'],
  http: ['type', 'description', 'scheme', 'bearerFormat'],
  oauth2: ['type', 'description', 'flows'],
  openIdConnect: ['type', 'description', 'openIdConnectUrl'],
  mutualTLS: ['type', 'description'],
};

function sanitizeSecuritySchemes(schemes, warn) {
  for (const [name, scheme] of Object.entries(schemes)) {
    if (!scheme || typeof scheme !== 'object') continue;
    const allowed = SECURITY_SCHEME_ALLOWED[scheme.type];
    if (!allowed) {
      // Unknown/missing type — Orval can't use it anyway. Drop the whole leg of
      // any `security` requirement that points at it by deleting the scheme.
      warn(`securityScheme "${name}" has unknown type "${scheme.type}" — removing it`);
      delete schemes[name];
      continue;
    }
    for (const key of Object.keys(scheme)) {
      if (!allowed.includes(key)) {
        warn(`securityScheme "${name}" (${scheme.type}): stripping illegal property "${key}"`);
        delete scheme[key];
      }
    }
  }
}

/** OpenAPI operation keys that can carry parameters. */
const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

/**
 * Every `{placeholder}` in a path template MUST be backed by a matching path
 * parameter (`in: "path", required: true`) declared at the path-item or
 * operation level — otherwise OpenAPI validation fails with:
 *   "Declared path parameter \"x\" needs to be defined as a path parameter..."
 *
 * Spring sometimes emits the `{placeholder}` in the URL but forgets to declare
 * the parameter object. We inject the missing declaration (typed as string) on
 * each operation that is missing it, so validation passes. We never remove or
 * rename real parameters — only add the ones the URL already requires.
 */
function ensurePathParameters(paths, warn) {
  for (const [route, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;

    const templated = [...route.matchAll(/{([^}]+)}/g)].map((m) => m[1]);
    if (templated.length === 0) continue;

    // Path params already declared at the path-item level apply to every op.
    const pathLevel = new Set(
      (pathItem.parameters || [])
        .filter((p) => p && p.in === 'path' && typeof p.name === 'string')
        .map((p) => p.name),
    );

    for (const method of HTTP_METHODS) {
      const op = pathItem[method];
      if (!op || typeof op !== 'object') continue;

      let opParams = Array.isArray(op.parameters) ? op.parameters : null;
      const declared = new Set(pathLevel);
      for (const p of opParams || []) {
        if (p && p.in === 'path' && typeof p.name === 'string') declared.add(p.name);
      }

      for (const name of templated) {
        if (declared.has(name)) continue;
        if (!opParams) {
          opParams = [];
          op.parameters = opParams;
        }
        opParams.push({ name, in: 'path', required: true, schema: { type: 'string' } });
        declared.add(name);
        warn(`path "${route}" (${method.toUpperCase()}): injected missing path parameter "${name}"`);
      }
    }
  }
}

module.exports = (inputSchema) => {
  const warnings = [];
  const warn = (m) => warnings.push(m);

  const components = inputSchema && inputSchema.components;

  // 1. Security schemes — the recurring Keycloak/OAuth2 defect and its siblings.
  if (components && components.securitySchemes) {
    sanitizeSecuritySchemes(components.securitySchemes, warn);
  }

  // 2. Path templates missing their parameter declarations.
  if (inputSchema && inputSchema.paths) {
    ensurePathParameters(inputSchema.paths, warn);
  }

  if (warnings.length) {
    // eslint-disable-next-line no-console
    console.warn(
      `\n[orval-transformer] sanitized ${warnings.length} spec issue(s):\n` +
        warnings.map((w) => `  • ${w}`).join('\n') +
        '\n',
    );
  }

  return inputSchema;
};
