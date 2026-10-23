/**
 * ECHO DRIFT — content linter. A tiny JSON-schema-like validator so a broken
 * content file fails the build with a readable message: file, path, problem.
 *
 * Schema language (deliberately small):
 *   'string' | 'number' | 'boolean' | 'any'      — primitive types
 *   ['string']                                    — array of
 *   { field: schema, 'opt?': schema }             — object; "?" suffix = optional
 *   { $enum: [...] }                              — one of
 *   { $map: schema }                              — object with any keys
 *   { $oneOf: [schemaA, schemaB] }
 */

export function validate(value, schema, path = '$', errors = []) {
  if (schema === 'any') return errors;
  if (typeof schema === 'string') {
    const ok = schema === 'number' ? typeof value === 'number' && Number.isFinite(value) : typeof value === schema;
    if (!ok) errors.push(`${path}: expected ${schema}, got ${value === null ? 'null' : typeof value}`);
    return errors;
  }
  if (Array.isArray(schema)) {
    if (!Array.isArray(value)) {
      errors.push(`${path}: expected array`);
      return errors;
    }
    value.forEach((v, i) => validate(v, schema[0], `${path}[${i}]`, errors));
    return errors;
  }
  if (schema.$enum) {
    if (!schema.$enum.includes(value)) errors.push(`${path}: "${value}" is not one of ${schema.$enum.join(', ')}`);
    return errors;
  }
  if (schema.$map) {
    if (typeof value !== 'object' || value === null) errors.push(`${path}: expected object`);
    else for (const [k, v] of Object.entries(value)) validate(v, schema.$map, `${path}.${k}`, errors);
    return errors;
  }
  if (schema.$oneOf) {
    const results = schema.$oneOf.map((s) => validate(value, s, path, []));
    if (!results.some((r) => r.length === 0)) errors.push(...results.sort((a, b) => a.length - b.length)[0]);
    return errors;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    errors.push(`${path}: expected object`);
    return errors;
  }
  for (const [rawKey, sub] of Object.entries(schema)) {
    const optional = rawKey.endsWith('?');
    const key = optional ? rawKey.slice(0, -1) : rawKey;
    if (value[key] === undefined) {
      if (!optional) errors.push(`${path}.${key}: missing required field`);
      continue;
    }
    validate(value[key], sub, `${path}.${key}`, errors);
  }
  return errors;
}

/* ---------- Schemas for every content type ---------- */

const text = 'string';
const body = {
  id: 'string',
  type: { $enum: ['star', 'planet', 'moon', 'blackhole', 'probe', 'station'] },
  mass: 'number',
  'radius?': 'number',
  'horizon?': 'number',
  'x?': 'number',
  'y?': 'number',
  'color?': 'string',
  'name?': 'string',
  'drawRadius?': 'number',
  'orbit?': { parent: 'string', radius: 'number', 'phaseDeg?': 'number', 'clockwise?': 'boolean' },
};

export const SCHEMAS = {
  flightLevel: {
    id: 'string',
    world: 'string',
    title: text,
    brief: text,
    bounds: { w: 'number', h: 'number', 'margin?': 'number' },
    bodies: [body],
    ship: {
      $oneOf: [
        { x: 'number', y: 'number', 'vx?': 'number', 'vy?': 'number' },
        { orbit: { body: 'string', radius: 'number', 'phaseDeg?': 'number', 'clockwise?': 'boolean', 'speedFactor?': 'number' } },
      ],
    },
    objective: {
      type: { $enum: ['land', 'slingshot', 'orbit', 'hohmann', 'aerobrake', 'lagrange', 'rendezvous', 'escape'] },
      'target?': 'string',
      'planet?': 'string',
      'point?': { $enum: ['L4', 'L5'] },
      'x?': 'number',
      'y?': 'number',
      'r?': 'number',
      'rMin?': 'number',
      'rMax?': 'number',
      'hold?': 'number',
      'maxSpeed?': 'number',
      'maxRelSpeed?': 'number',
      'distance?': 'number',
      'strict?': 'boolean',
    },
    fuel: 'number',
    maxDvPerBurn: 'number',
    'maxBurns?': 'number',
    'fuelPerDv?': 'number',
    maxTime: 'number',
    'timeScale?': 'number',
    'heatLimit?': 'number',
    'softening?': 'number',
    'atmospheres?': [{ body: 'string', height: 'number', density: 'number', scaleHeight: 'number' }],
    'hazards?': {
      'debris?': [{ x: 'number', y: 'number', r: 'number', 'damage?': 'number' }],
      'gusts?': [{ start: 'number', duration: 'number', angleDeg: 'number', accel: 'number', 'period?': 'number' }],
      'flares?': [{ start: 'number', duration: 'number' }],
    },
    goals: { fuelLeftPct: 'number', hull: 'number', time: 'number' },
    hints: [text],
    concepts: ['string'],
    'fact?': 'string',
  },
  world: {
    id: 'string',
    order: 'number',
    name: text,
    tagline: text,
    status: { $enum: ['playable', 'comingSoon'] },
    color: 'string',
    objectives: [{ id: 'string', text: text, tags: ['string'], 'grade?': 'string', 'chapter?': 'string' }],
    'distanceLy?': 'number',
    'levels?': ['string'],
    'teaser?': text,
    'map?': { x: 'number', y: 'number' },
  },
  investigation: {
    world: 'string',
    scene: { sky: 'string', ground: 'string', 'features?': ['any'] },
    charges: 'number',
    answer: { $enum: ['impact', 'greenhouse', 'stellar', 'volcanism'] },
    hotspots: [{ id: 'string', label: text, x: 'number', y: 'number' }],
    clues: [
      {
        id: 'string',
        hotspot: 'string',
        tool: { $enum: ['spectrometer', 'drill', 'radiation', 'crater', 'thermal'] },
        title: text,
        data: text,
        'dataCadet?': text,
        weights: { $map: 'number' },
        'redHerring?': 'boolean',
        'opensLayers?': 'boolean',
      },
    ],
    explanations: { $map: text },
    'layers?': { prompt: text, layers: [{ id: 'string', label: text, depth: text }] },
    glyph: { prompt: text, sequence: ['number'], answer: 'number', options: ['number'], fragment: 'string', 'style?': { $enum: ['dots', 'binary'] } },
    concepts: ['string'],
  },
  colonyWorld: {
    id: 'string',
    solar: 'number',
    days: 'number',
    budget: 'number',
    'crew?': 'number',
    events: [{ id: 'string', day: 'number', days: 'number', 'solarMult?': 'number', 'radiation?': 'number', 'extraPower?': 'number', 'morale?': 'number' }],
    note: text,
  },
  quiz: {
    world: 'string',
    questions: [{ id: 'string', speaker: 'string', q: text, options: [text], correct: 'number', misconception: text, feedback: text, concept: 'string' }],
  },
};

/** Validate the whole content bundle; returns an array of error strings. */
export function lintContent(content) {
  const errors = [];
  const check = (file, value, schema) => validate(value, schema, file).forEach((e) => errors.push(e));
  content.worlds.forEach((w, i) => check(`worlds.json[${i}]`, w, SCHEMAS.world));
  content.flight.forEach((l, i) => check(`flight_levels.json[${i}](${l.id})`, l, SCHEMAS.flightLevel));
  Object.entries(content.investigations).forEach(([k, v]) => check(`investigations.json.${k}`, v, SCHEMAS.investigation));
  content.colony.worlds.forEach((w, i) => check(`colony.json.worlds[${i}]`, w, SCHEMAS.colonyWorld));
  Object.entries(content.quizzes).forEach(([k, v]) => check(`quizzes.json.${k}`, v, SCHEMAS.quiz));

  // Cross-reference checks (things a schema can't express).
  const levelIds = new Set(content.flight.map((l) => l.id));
  const factIds = new Set(content.science.facts.map((f) => f.id));
  for (const w of content.worlds) {
    for (const lid of w.levels || []) if (!levelIds.has(lid)) errors.push(`worlds.json(${w.id}).levels: unknown level "${lid}"`);
    if (w.status === 'playable') {
      for (const part of ['investigations', 'quizzes', 'report', 'forge', 'dialogue']) {
        const src = part === 'dialogue' ? content.dialogue.worlds : part === 'forge' ? content.forge.worlds : content[part];
        if (!src[w.id]) errors.push(`${part}: playable world "${w.id}" has no entry`);
      }
      if (!content.colony.worlds.some((c) => c.id === w.id)) errors.push(`colony.json: playable world "${w.id}" has no entry`);
    }
  }
  for (const l of content.flight) {
    const ids = new Set(l.bodies.map((b) => b.id));
    for (const b of l.bodies) {
      if (b.orbit && !ids.has(b.orbit.parent)) errors.push(`flight ${l.id}: body ${b.id} orbits unknown "${b.orbit.parent}"`);
      if (!b.orbit && (b.x == null || b.y == null)) errors.push(`flight ${l.id}: fixed body ${b.id} needs x and y`);
      if (b.type === 'blackhole' && !b.horizon) errors.push(`flight ${l.id}: black hole ${b.id} needs "horizon"`);
    }
    const o = l.objective;
    if (o.target && !ids.has(o.target)) errors.push(`flight ${l.id}: objective target "${o.target}" not found`);
    if (['orbit', 'hohmann', 'aerobrake'].includes(o.type) && (o.rMin == null || o.rMax == null || o.hold == null))
      errors.push(`flight ${l.id}: ${o.type} objective needs rMin, rMax, hold`);
    if (l.fact && !factIds.has(l.fact)) errors.push(`flight ${l.id}: unknown fact "${l.fact}"`);
  }
  for (const [wid, inv] of Object.entries(content.investigations)) {
    const hs = new Set(inv.hotspots.map((h) => h.id));
    for (const c of inv.clues) if (!hs.has(c.hotspot)) errors.push(`investigations.${wid}: clue ${c.id} uses unknown hotspot ${c.hotspot}`);
    const correctClues = inv.clues.filter((c) => (c.weights[inv.answer] || 0) > 0);
    if (correctClues.length < 2) errors.push(`investigations.${wid}: needs at least 2 clues supporting the answer`);
    if (inv.glyph && !inv.glyph.options.includes(inv.glyph.answer)) errors.push(`investigations.${wid}: glyph answer missing from options`);
  }
  for (const [qid, quiz] of Object.entries(content.quizzes))
    for (const q of quiz.questions) if (q.correct < 0 || q.correct >= q.options.length) errors.push(`quizzes.${qid}.${q.id}: correct index out of range`);
  for (const f of content.science.facts) {
    if (!f.source?.url || !f.source?.title) errors.push(`science_notes.json(${f.id}): every fact needs a source title + url`);
    if (!f.simplification) errors.push(`science_notes.json(${f.id}): missing "simplification"`);
  }
  return errors;
}
