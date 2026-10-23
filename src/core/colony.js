/**
 * ECHO DRIFT — BUILD & SURVIVE colony simulation (pure; unit-tested).
 *
 * One tick = one real second at 1x speed. A "day" is `ticksPerDay` ticks;
 * the first `daylight` fraction of each day is lit (solar works), the rest is night.
 * Modules, rates, events and per-world modifiers all come from JSON.
 */

export const RESOURCES = ['power', 'water', 'oxygen', 'food', 'morale'];
export const LIFE = ['water', 'oxygen', 'food'];

export class ColonySim {
  /**
   * @param cfg      global colony config (modules, crew needs) — content/colony.json
   * @param world    the world's colony block (solar, events, days, budget ...)
   * @param opts     { penalty: bool } — wrong hypothesis = fewer resources
   */
  constructor(cfg, world, opts = {}) {
    this.cfg = cfg;
    this.world = world;
    this.ticksPerDay = cfg.ticksPerDay;
    this.tick = 0;
    this.grid = Array(cfg.gridW * cfg.gridH).fill(null);
    this.penalty = !!opts.penalty;
    const startMult = this.penalty ? cfg.wrongHypothesis.startMult : 1;
    this.budget = world.budget - (this.penalty ? cfg.wrongHypothesis.budgetCut : 0);
    this.res = {};
    for (const r of RESOURCES) this.res[r] = Math.round(cfg.start[r] * (r === 'morale' ? 1 : startMult));
    this.trend = Object.fromEntries(RESOURCES.map((r) => [r, 0]));
    this.zeroTicks = Object.fromEntries(LIFE.map((r) => [r, 0]));
    this.status = 'planning'; // planning | running | won | lost
    this.log = []; // chain-of-events log [{tick, kind, ...}]
    this.offline = new Set();
    this.solarHealth = 1; // degraded by radiation on some worlds
    this.activeEvents = [];
    this.lostBecause = null;
  }

  get day() {
    return Math.floor(this.tick / this.ticksPerDay) + 1;
  }
  get isDaylight() {
    return this.tick % this.ticksPerDay < this.ticksPerDay * this.cfg.daylight;
  }
  moduleDef(type) {
    const m = this.cfg.modules.find((x) => x.id === type);
    if (!m) throw new Error(`Unknown module ${type}`);
    return m;
  }
  availableModules() {
    return this.cfg.modules.filter((m) => !m.onlyWorlds || m.onlyWorlds.includes(this.world.id));
  }
  count(type) {
    return this.grid.filter((c) => c === type).length;
  }
  powerCap() {
    return this.cfg.caps.power + this.count('battery') * this.moduleDef('battery').storage;
  }

  /** Place a module. Returns {ok, reason}. */
  place(index, type) {
    if (this.status === 'won' || this.status === 'lost') return { ok: false, reason: 'over' };
    if (this.grid[index]) return { ok: false, reason: 'occupied' };
    const m = this.moduleDef(type);
    if (m.onlyWorlds && !m.onlyWorlds.includes(this.world.id)) return { ok: false, reason: 'unavailable' };
    if (m.cost > this.budget) return { ok: false, reason: 'budget' };
    this.grid[index] = type;
    this.budget -= m.cost;
    return { ok: true };
  }
  /** Remove a module (refund only while planning). */
  remove(index) {
    const type = this.grid[index];
    if (!type) return;
    this.grid[index] = null;
    if (this.status === 'planning') this.budget += this.moduleDef(type).cost;
  }

  start() {
    if (this.status === 'planning') this.status = 'running';
  }

  /** Events whose window covers the current day. */
  _currentEvents() {
    return (this.world.events || []).filter((e) => this.day >= e.day && this.day < e.day + e.days);
  }

  /** Advance one tick. */
  step() {
    if (this.status !== 'running') return this.status;
    const cfg = this.cfg;
    const before = { ...this.res };
    const events = this._currentEvents();
    for (const e of events) {
      if (!this.activeEvents.includes(e.id)) this.log.push({ tick: this.tick, kind: 'event', id: e.id });
    }
    this.activeEvents = events.map((e) => e.id);

    // 1) Solar production (inverse-square light x daylight x events x panel health).
    let solarMult = this.world.solar * this.solarHealth;
    for (const e of events) if (e.solarMult != null) solarMult *= e.solarMult;
    const solar = this.isDaylight ? this.count('solar') * this.moduleDef('solar').produces.power * solarMult : 0;
    this.res.power = Math.min(this.powerCap(), this.res.power + solar);

    // Radiation degrades unshielded panels each tick of a radiation event.
    for (const e of events) {
      if (e.radiation) {
        const shields = this.count('shield');
        const protectedFrac = Math.min(1, shields * this.moduleDef('shield').protects);
        this.solarHealth = Math.max(0.15, this.solarHealth - e.radiation * (1 - protectedFrac));
      }
    }

    // 2) Power allocation in priority order — consumers that can't get power go offline.
    const consumers = [];
    this.grid.forEach((type) => {
      if (!type) return;
      const m = this.moduleDef(type);
      if (m.consumes?.power) consumers.push(m);
    });
    consumers.sort((a, b) => a.priority - b.priority);
    let extraPower = 0;
    for (const e of events) extraPower += e.extraPower || 0;
    const running = [];
    const newlyOffline = new Set();
    for (const m of consumers) {
      const need = m.consumes.power;
      if (this.res.power >= need) {
        this.res.power -= need;
        running.push(m);
      } else newlyOffline.add(m.id);
    }
    // Heaters etc. on cold events — drawn after modules (if missing, morale suffers).
    if (extraPower) {
      if (this.res.power >= extraPower) this.res.power -= extraPower;
      else {
        this.res.power = 0;
        this.res.morale -= 1;
      }
    }
    for (const id of newlyOffline) {
      if (!this.offline.has(id)) this.log.push({ tick: this.tick, kind: 'offline', id });
    }
    this.offline = newlyOffline;
    if (newlyOffline.size && !this._powerShort) this.log.push({ tick: this.tick, kind: 'powerShort', night: !this.isDaylight });
    this._powerShort = newlyOffline.size > 0;

    // 3) Running modules convert inputs to outputs (if inputs are available).
    for (const m of running) {
      const ok = Object.entries(m.consumes)
        .filter(([r]) => r !== 'power')
        .every(([r, v]) => this.res[r] >= v);
      if (!ok) {
        if (!this.offline.has(m.id)) this.log.push({ tick: this.tick, kind: 'starved', id: m.id });
        continue;
      }
      for (const [r, v] of Object.entries(m.consumes)) if (r !== 'power') this.res[r] -= v;
      for (const [r, v] of Object.entries(m.produces || {})) if (r !== 'power') this.res[r] += v;
    }

    // 4) Crew needs.
    const crew = this.world.crew ?? cfg.crew;
    for (const [r, v] of Object.entries(cfg.crewNeeds)) this.res[r] -= v * crew;

    // 5) Morale: habitats + comms help, shortages hurt.
    const habitatsNeeded = Math.ceil(crew / cfg.crewPerHabitat);
    let dm = (this.count('habitat') >= habitatsNeeded ? 0.15 : -0.6) + (this.count('comms') && !this.offline.has('comms') ? 0.1 : 0);
    for (const r of LIFE) if (this.res[r] < 15) dm -= 0.4;
    for (const e of events) dm += e.morale || 0;
    this.res.morale += dm;

    // Clamp & trends.
    for (const r of RESOURCES) {
      const cap = r === 'power' ? this.powerCap() : cfg.caps[r];
      this.res[r] = Math.max(0, Math.min(cap, this.res[r]));
      this.trend[r] = this.res[r] - before[r];
    }

    // 6) Win / lose.
    for (const r of LIFE) {
      if (this.res[r] <= 0) {
        if (this.zeroTicks[r] === 0) this.log.push({ tick: this.tick, kind: 'zero', id: r });
        this.zeroTicks[r]++;
        if (this.zeroTicks[r] > cfg.graceTicks) return this._lose(r);
      } else this.zeroTicks[r] = 0;
    }
    if (this.res.morale <= 0) return this._lose('morale');

    this.tick++;
    if (this.tick >= this.world.days * this.ticksPerDay) this.status = 'won';
    return this.status;
  }

  _lose(resource) {
    this.status = 'lost';
    this.lostBecause = resource;
    this.chain = explainChain(this, resource);
    return this.status;
  }
}

/** Producers of each resource (used to explain chain reactions). */
const PRODUCERS = { oxygen: ['o2gen', 'greenhouse'], water: ['water'], food: ['greenhouse'], morale: ['habitat', 'comms'] };

/**
 * Build a short cause → effect chain (array of {key, params}) explaining why
 * the colony failed. Keys are i18n string ids; params fill placeholders.
 */
export function explainChain(sim, resource) {
  const chain = [];
  const recent = sim.log.slice(-40);
  const ev = recent.filter((l) => l.kind === 'event').pop();
  if (ev) chain.push({ key: `colony.event.${ev.id}` });
  const short = recent.filter((l) => l.kind === 'powerShort').pop();
  if (short) chain.push({ key: short.night ? 'colony.chain.night' : 'colony.chain.power' });
  const prods = PRODUCERS[resource] || [];
  const offline = recent.filter((l) => (l.kind === 'offline' || l.kind === 'starved') && prods.includes(l.id));
  const ids = [...new Set(offline.map((o) => o.id))];
  for (const id of ids) chain.push({ key: 'colony.chain.offline', params: { module: id } });
  if (!ids.length && prods.length && !prods.some((p) => sim.count(p))) {
    chain.push({ key: 'colony.chain.none', params: { module: prods[0] } });
  }
  if (!ids.length && prods.some((p) => sim.count(p))) chain.push({ key: 'colony.chain.notEnough', params: { module: prods[0] } });
  chain.push({ key: 'colony.chain.zero', params: { resource } });
  return chain;
}
