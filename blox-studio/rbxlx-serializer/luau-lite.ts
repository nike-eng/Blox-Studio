/**
 * Luau-lite: a small, safe interpreter for the part of Luau that beginners use.
 * It runs in the browser (no network, no eval) and talks to the place through a host `Bridge`.
 *
 * Supported: variables, numbers, strings, booleans, nil, tables, functions and closures, if / while /
 * for / repeat, `continue`, compound assignment (`+=`), type annotations (skipped), pcall, error,
 * string / math / table / os / task helpers, Vector3, Color3, Instance.new, game / workspace.
 * Anything else raises a clear error so the user knows it is not available.
 */

// ---------------------------------------------------------------- values

/** A Lua table with an array part and a hash part. */
export class LuaTable {
  arr: unknown[] = [];
  hash = new Map<unknown, unknown>();
  meta: LuaTable | null = null;
  get(k: unknown): unknown {
    if (typeof k === 'number' && Number.isInteger(k) && k >= 1 && k <= this.arr.length) return this.arr[k - 1];
    return this.hash.get(k);
  }
  set(k: unknown, v: unknown): void {
    if (typeof k === 'number' && Number.isInteger(k) && k >= 1) {
      if (k <= this.arr.length) {
        this.arr[k - 1] = v ?? undefined;
        while (this.arr.length && this.arr[this.arr.length - 1] == null) this.arr.pop();
        return;
      }
      if (k === this.arr.length + 1 && v != null) {
        this.arr.push(v);
        for (let n = this.arr.length + 1; this.hash.has(n); n++) { this.arr.push(this.hash.get(n)); this.hash.delete(n); }
        return;
      }
    }
    if (v == null) this.hash.delete(k); else this.hash.set(k, v);
  }
  get length(): number { return this.arr.length; }
  keys(): unknown[] { return [...this.arr.map((_, i) => i + 1), ...this.hash.keys()]; }
}

/** A function written in the script. */
export class Closure {
  constructor(readonly params: string[], readonly vararg: boolean, readonly body: Node[], readonly scope: Scope, readonly name: string) {}
}

/** Objects supplied by the host (instances, Vector3, services...). */
export interface HostObject {
  typeName: string;
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  toString(): string;
}

/** A 3D vector. */
export class Vector3 implements HostObject {
  typeName = 'Vector3';
  constructor(public x = 0, public y = 0, public z = 0) {}
  get(k: string): unknown {
    switch (k) {
      case 'X': return this.x; case 'Y': return this.y; case 'Z': return this.z;
      case 'Magnitude': return Math.hypot(this.x, this.y, this.z);
      case 'Unit': { const m = Math.hypot(this.x, this.y, this.z) || 1; return new Vector3(this.x / m, this.y / m, this.z / m); }
      default: throw new LuauError(`${k} is not a valid member of Vector3`);
    }
  }
  set(): void { throw new LuauError('Vector3 values cannot be changed; make a new Vector3 instead'); }
  toString(): string { return `${fmt(this.x)}, ${fmt(this.y)}, ${fmt(this.z)}`; }
  toArray(): [number, number, number] { return [this.x, this.y, this.z]; }
}

/** An RGB color (0..1 per channel). */
export class Color3 implements HostObject {
  typeName = 'Color3';
  constructor(public r = 0, public g = 0, public b = 0) {}
  get(k: string): unknown {
    if (k === 'R') return this.r; if (k === 'G') return this.g; if (k === 'B') return this.b;
    throw new LuauError(`${k} is not a valid member of Color3`);
  }
  set(): void { throw new LuauError('Color3 values cannot be changed; make a new Color3 instead'); }
  toString(): string { return `${fmt(this.r)}, ${fmt(this.g)}, ${fmt(this.b)}`; }
  toHex(): string {
    const h = (n: number) => Math.max(0, Math.min(255, Math.round(n * 255))).toString(16).padStart(2, '0');
    return `#${h(this.r)}${h(this.g)}${h(this.b)}`;
  }
  static fromHex(hex: string): Color3 {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return new Color3(0.64, 0.64, 0.65);
    const n = parseInt(m[1], 16);
    return new Color3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  }
}

/** Error raised by scripts (and by the interpreter itself). */
export class LuauError extends Error {
  constructor(message: string, readonly value: unknown = message) { super(message); }
}

/** Format a number the way Lua prints it. */
export function fmt(n: number): string {
  if (Number.isNaN(n)) return 'nan';
  if (!Number.isFinite(n)) return n > 0 ? 'inf' : '-inf';
  return Number.isInteger(n) ? String(n) : String(+n.toPrecision(14));
}

/** Lua `tostring`. */
export function tostr(v: unknown): string {
  if (v == null) return 'nil';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return fmt(v);
  if (typeof v === 'string') return v;
  if (v instanceof LuaTable) {
    const f = v.meta?.get('__tostring');
    if (typeof f === 'function') return String((f as (...a: unknown[]) => unknown)(v));
    return 'table';
  }
  if (v instanceof Closure) return 'function';
  if (typeof v === 'function') return 'function';
  return String((v as HostObject).toString());
}

/** Lua `type` / Roblox `typeof`. */
export function typeOf(v: unknown, roblox = false): string {
  if (v == null) return 'nil';
  if (typeof v === 'boolean') return 'boolean';
  if (typeof v === 'number') return 'number';
  if (typeof v === 'string') return 'string';
  if (v instanceof LuaTable) return 'table';
  if (v instanceof Closure || typeof v === 'function') return 'function';
  return roblox ? (v as HostObject).typeName : 'userdata';
}

// ---------------------------------------------------------------- lexer

type Tok = { k: 'name' | 'num' | 'str' | 'op' | 'kw' | 'eof'; v: string | number; line: number };
const KEYWORDS = new Set(['and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function', 'if', 'in', 'local', 'nil', 'not', 'or', 'repeat', 'return', 'then', 'true', 'until', 'while', 'continue']);
const OPS3 = ['...', '..='];
const OPS2 = ['==', '~=', '<=', '>=', '..', '//', '+=', '-=', '*=', '/=', '%=', '^=', '::', '->'];

function lex(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0; let line = 1;
  const n = src.length;
  const longBracket = (at: number): number => {
    if (src[at] !== '[') return -1;
    let j = at + 1; let eq = 0;
    while (src[j] === '=') { eq++; j++; }
    return src[j] === '[' ? eq : -1;
  };
  const readLong = (at: number, eq: number): { text: string; end: number } => {
    const close = `]${'='.repeat(eq)}]`;
    const start = at + eq + 2;
    const end = src.indexOf(close, start);
    if (end < 0) throw new LuauError(`Unfinished long string at line ${line}`);
    let text = src.slice(start, end);
    if (text.startsWith('\n')) text = text.slice(1);
    return { text, end: end + close.length };
  };
  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
    if (c === '-' && src[i + 1] === '-') {
      const eq = longBracket(i + 2);
      if (eq >= 0) { const r = readLong(i + 2, eq); line += (src.slice(i, r.end).match(/\n/g) || []).length; i = r.end; continue; }
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_]/.test(src[j])) j++;
      const w = src.slice(i, j);
      out.push({ k: KEYWORDS.has(w) ? 'kw' : 'name', v: w, line });
      i = j; continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      let j = i;
      if (c === '0' && /[xX]/.test(src[i + 1] || '')) { j = i + 2; while (/[0-9a-fA-F_]/.test(src[j] || '')) j++; out.push({ k: 'num', v: parseInt(src.slice(i + 2, j).replace(/_/g, ''), 16), line }); i = j; continue; }
      while (/[0-9_]/.test(src[j] || '')) j++;
      if (src[j] === '.' && src[j + 1] !== '.') { j++; while (/[0-9_]/.test(src[j] || '')) j++; }
      if (/[eE]/.test(src[j] || '')) { j++; if (/[+-]/.test(src[j] || '')) j++; while (/[0-9]/.test(src[j] || '')) j++; }
      out.push({ k: 'num', v: Number(src.slice(i, j).replace(/_/g, '')), line });
      i = j; continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1; let s = '';
      while (j < n && src[j] !== c) {
        if (src[j] === '\n') throw new LuauError(`Unfinished string at line ${line}`);
        if (src[j] === '\\') {
          j++;
          const e = src[j];
          if (e === 'n') s += '\n'; else if (e === 't') s += '\t'; else if (e === 'r') s += '\r'; else if (e === '0') s += '\0';
          else if (e === 'x') { s += String.fromCharCode(parseInt(src.slice(j + 1, j + 3), 16)); j += 2; }
          else s += e;
        } else s += src[j];
        j++;
      }
      if (j >= n) throw new LuauError(`Unfinished string at line ${line}`);
      out.push({ k: 'str', v: s, line });
      i = j + 1; continue;
    }
    if (c === '`') throw new LuauError(`Line ${line}: interpolated strings (\`...\`) are not supported yet; use .. or string.format`);
    const eq = longBracket(i);
    if (eq >= 0) { const r = readLong(i, eq); out.push({ k: 'str', v: r.text, line }); line += (src.slice(i, r.end).match(/\n/g) || []).length; i = r.end; continue; }
    const o3 = src.slice(i, i + 3);
    if (OPS3.includes(o3)) { out.push({ k: 'op', v: o3, line }); i += 3; continue; }
    const o2 = src.slice(i, i + 2);
    if (OPS2.includes(o2)) { out.push({ k: 'op', v: o2, line }); i += 2; continue; }
    if ('+-*/%^#<>=(){}[];:,.|&?'.includes(c)) { out.push({ k: 'op', v: c, line }); i++; continue; }
    throw new LuauError(`Unexpected character '${c}' at line ${line}`);
  }
  out.push({ k: 'eof', v: '<eof>', line });
  return out;
}

// ---------------------------------------------------------------- parser

/** Syntax tree node. */
export type Node = { t: string; line: number; [key: string]: any }; // eslint-disable-line @typescript-eslint/no-explicit-any

const BINARY: Record<string, [number, number]> = {
  or: [1, 1], and: [2, 2],
  '<': [3, 3], '>': [3, 3], '<=': [3, 3], '>=': [3, 3], '~=': [3, 3], '==': [3, 3],
  '..': [5, 4], '+': [6, 6], '-': [6, 6], '*': [7, 7], '/': [7, 7], '//': [7, 7], '%': [7, 7], '^': [10, 9],
};
const UNARY_PRIORITY = 8;

class Parser {
  p = 0;
  constructor(private toks: Tok[]) {}
  get tok(): Tok { return this.toks[this.p]; }
  next(): Tok { return this.toks[this.p++]; }
  is(v: string): boolean { const t = this.tok; return (t.k === 'op' || t.k === 'kw') && t.v === v; }
  accept(v: string): boolean { if (this.is(v)) { this.p++; return true; } return false; }
  fail(msg: string): never { throw new LuauError(`Syntax error at line ${this.tok.line}: ${msg}`); }
  expect(v: string): Tok { if (!this.is(v)) this.fail(`expected '${v}' but found '${this.tok.v}'`); return this.next(); }
  name(): string { if (this.tok.k !== 'name') this.fail(`expected a name but found '${this.tok.v}'`); return this.next().v as string; }

  /** Skips a type annotation such as `number`, `{string}`, `(a: number) -> string`, `Foo?`. */
  skipType(): void {
    const atom = () => {
      if (this.accept('{')) { let d = 1; while (d && this.tok.k !== 'eof') { if (this.is('{')) d++; if (this.is('}')) d--; this.p++; } }
      else if (this.accept('(')) { let d = 1; while (d && this.tok.k !== 'eof') { if (this.is('(')) d++; if (this.is(')')) d--; this.p++; } if (this.accept('->')) atom(); }
      else if (this.tok.k === 'name' || this.is('nil')) {
        this.p++;
        while (this.accept('.')) this.name();
        if (this.is('<')) { let d = 0; do { if (this.is('<')) d++; if (this.is('>')) d--; this.p++; } while (d && this.tok.k !== 'eof'); }
      } else this.fail('expected a type');
      while (this.accept('?')) { /* optional marker */ }
    };
    atom();
    while (this.is('|') || this.is('&')) { this.p++; atom(); }
  }

  block(): Node[] {
    const out: Node[] = [];
    while (!['end', 'else', 'elseif', 'until', '<eof>'].includes(String(this.tok.v)) || this.tok.k === 'str') {
      if (this.tok.k === 'eof') break;
      const s = this.statement();
      if (s) out.push(s);
      this.accept(';');
      if (s && (s.t === 'return')) break;
    }
    return out;
  }

  statement(): Node | null {
    const line = this.tok.line;
    if (this.accept(';')) return null;
    if (this.accept('if')) {
      const clauses: { cond: Node; body: Node[] }[] = [];
      const cond = this.expr(); this.expect('then');
      clauses.push({ cond, body: this.block() });
      let orelse: Node[] | null = null;
      for (;;) {
        if (this.accept('elseif')) { const c = this.expr(); this.expect('then'); clauses.push({ cond: c, body: this.block() }); }
        else if (this.accept('else')) { orelse = this.block(); this.expect('end'); break; }
        else { this.expect('end'); break; }
      }
      return { t: 'if', line, clauses, orelse };
    }
    if (this.accept('while')) { const cond = this.expr(); this.expect('do'); const body = this.block(); this.expect('end'); return { t: 'while', line, cond, body }; }
    if (this.accept('do')) { const body = this.block(); this.expect('end'); return { t: 'do', line, body }; }
    if (this.accept('repeat')) { const body = this.block(); this.expect('until'); const cond = this.expr(); return { t: 'repeat', line, body, cond }; }
    if (this.accept('for')) {
      const first = this.name();
      if (this.accept('=')) {
        const a = this.expr(); this.expect(','); const b = this.expr(); const c = this.accept(',') ? this.expr() : null;
        this.expect('do'); const body = this.block(); this.expect('end');
        return { t: 'fornum', line, v: first, a, b, c, body };
      }
      const names = [first];
      while (this.accept(',')) names.push(this.name());
      this.expect('in');
      const exprs = [this.expr()];
      while (this.accept(',')) exprs.push(this.expr());
      this.expect('do'); const body = this.block(); this.expect('end');
      return { t: 'forin', line, names, exprs, body };
    }
    if (this.accept('function')) {
      let target: Node = { t: 'name', line, v: this.name() };
      let fname = target.v as string;
      let method = false;
      while (this.is('.') || this.is(':')) {
        const colon = this.next().v === ':';
        const key = this.name();
        fname += (colon ? ':' : '.') + key;
        target = { t: 'index', line, obj: target, key: { t: 'str', line, v: key } };
        if (colon) { method = true; break; }
      }
      const fn = this.funcBody(line, fname, method);
      return { t: 'assign', line, targets: [target], exprs: [fn] };
    }
    if (this.accept('local')) {
      if (this.accept('function')) {
        const n = this.name();
        return { t: 'local', line, names: [n], exprs: [this.funcBody(line, n, false)], isFunc: true };
      }
      const names: string[] = [];
      do { names.push(this.name()); if (this.accept(':')) this.skipType(); } while (this.accept(','));
      const exprs: Node[] = [];
      if (this.accept('=')) { do exprs.push(this.expr()); while (this.accept(',')); }
      return { t: 'local', line, names, exprs };
    }
    if (this.accept('return')) {
      const exprs: Node[] = [];
      if (!['end', 'else', 'elseif', 'until', ';', '<eof>'].includes(String(this.tok.v)) || this.tok.k === 'str') {
        do exprs.push(this.expr()); while (this.accept(','));
      }
      return { t: 'return', line, exprs };
    }
    if (this.accept('break')) return { t: 'break', line };
    if (this.accept('continue')) return { t: 'continue', line };
    // assignment or call
    const first = this.suffixed();
    if (this.is('=') || this.is(',')) {
      const targets = [first];
      while (this.accept(',')) targets.push(this.suffixed());
      this.expect('=');
      const exprs = [this.expr()];
      while (this.accept(',')) exprs.push(this.expr());
      for (const t of targets) if (t.t !== 'name' && t.t !== 'index') this.fail('cannot assign to this');
      return { t: 'assign', line, targets, exprs };
    }
    for (const op of ['+=', '-=', '*=', '/=', '%=', '^=', '..=']) {
      if (this.accept(op)) {
        if (first.t !== 'name' && first.t !== 'index') this.fail('cannot assign to this');
        return { t: 'compound', line, op: op.slice(0, -1), target: first, expr: this.expr() };
      }
    }
    if (first.t !== 'call' && first.t !== 'method') this.fail('this is not a statement (expected a function call or an assignment)');
    return { t: 'exprstat', line, expr: first };
  }

  funcBody(line: number, name: string, method: boolean): Node {
    this.expect('(');
    const params: string[] = method ? ['self'] : [];
    let vararg = false;
    if (!this.is(')')) {
      do {
        if (this.accept('...')) { vararg = true; break; }
        params.push(this.name());
        if (this.accept(':')) this.skipType();
      } while (this.accept(','));
    }
    this.expect(')');
    if (this.accept(':')) this.skipType();
    const body = this.block();
    this.expect('end');
    return { t: 'function', line, params, vararg, body, name };
  }

  primary(): Node {
    const t = this.tok; const line = t.line;
    if (t.k === 'name') { this.p++; return { t: 'name', line, v: t.v }; }
    if (this.accept('(')) { const e = this.expr(); this.expect(')'); return { t: 'paren', line, e }; }
    return this.fail(`unexpected '${t.v}'`);
  }

  suffixed(): Node {
    let e = this.primary();
    for (;;) {
      const line = this.tok.line;
      if (this.accept('.')) e = { t: 'index', line, obj: e, key: { t: 'str', line, v: this.name() } };
      else if (this.accept('[')) { const k = this.expr(); this.expect(']'); e = { t: 'index', line, obj: e, key: k }; }
      else if (this.accept(':')) { const m = this.name(); e = { t: 'method', line, obj: e, name: m, args: this.callArgs() }; }
      else if (this.is('(') || this.is('{') || this.tok.k === 'str') e = { t: 'call', line, fn: e, args: this.callArgs() };
      else return e;
    }
  }

  callArgs(): Node[] {
    if (this.tok.k === 'str') { const t = this.next(); return [{ t: 'str', line: t.line, v: t.v }]; }
    if (this.is('{')) return [this.table()];
    this.expect('(');
    const args: Node[] = [];
    if (!this.is(')')) do args.push(this.expr()); while (this.accept(','));
    this.expect(')');
    return args;
  }

  table(): Node {
    const line = this.tok.line;
    this.expect('{');
    const items: { key?: Node; value: Node }[] = [];
    while (!this.is('}')) {
      if (this.accept('[')) { const k = this.expr(); this.expect(']'); this.expect('='); items.push({ key: k, value: this.expr() }); }
      else if (this.tok.k === 'name' && this.toks[this.p + 1].k === 'op' && this.toks[this.p + 1].v === '=') {
        const k = this.name(); this.expect('='); items.push({ key: { t: 'str', line, v: k }, value: this.expr() });
      } else items.push({ value: this.expr() });
      if (!this.accept(',') && !this.accept(';')) break;
    }
    this.expect('}');
    return { t: 'table', line, items };
  }

  simple(): Node {
    const t = this.tok; const line = t.line;
    if (t.k === 'num') { this.p++; return { t: 'num', line, v: t.v }; }
    if (t.k === 'str') { this.p++; return { t: 'str', line, v: t.v }; }
    if (this.accept('nil')) return { t: 'nil', line };
    if (this.accept('true')) return { t: 'true', line };
    if (this.accept('false')) return { t: 'false', line };
    if (this.accept('...')) return { t: 'vararg', line };
    if (this.is('{')) return this.table();
    if (this.accept('function')) return this.funcBody(line, 'anonymous', false);
    if (this.accept('if')) {
      const c = this.expr(); this.expect('then'); const a = this.expr();
      const clauses = [{ c, a }];
      while (this.accept('elseif')) { const c2 = this.expr(); this.expect('then'); clauses.push({ c: c2, a: this.expr() }); }
      this.expect('else');
      return { t: 'ifexpr', line, clauses, orelse: this.expr() };
    }
    return this.suffixed();
  }

  expr(limit = 0): Node {
    let left: Node;
    const line = this.tok.line;
    if (this.is('not') || this.is('-') || this.is('#')) {
      const op = this.next().v as string;
      left = { t: 'unary', line, op, e: this.expr(UNARY_PRIORITY) };
    } else left = this.simple();
    if (this.is('::')) { this.p++; this.skipType(); }
    for (;;) {
      const op = String(this.tok.v);
      const pr = (this.tok.k === 'op' || this.tok.k === 'kw') ? BINARY[op] : undefined;
      if (!pr || pr[0] <= limit) break;
      const opLine = this.tok.line;
      this.p++;
      const right = this.expr(pr[1]);
      left = { t: 'binary', line: opLine, op, l: left, r: right };
    }
    return left;
  }
}

/** Parses source text into a syntax tree (throws {@link LuauError} on syntax errors). */
export function parse(src: string): Node[] {
  const p = new Parser(lex(src));
  const body = p.block();
  if (p.tok.k !== 'eof') p.fail(`unexpected '${p.tok.v}'`);
  return body;
}

// ---------------------------------------------------------------- evaluator

/** A variable scope. */
export class Scope {
  vars = new Map<string, unknown>();
  varargs: unknown[] = [];
  constructor(readonly parent: Scope | null = null) {}
  lookup(name: string): Scope | null {
    for (let s: Scope | null = this; s; s = s.parent) if (s.vars.has(name)) return s;
    return null;
  }
}

type Signal = { kind: 'break' } | { kind: 'continue' } | { kind: 'return'; values: unknown[] };
/** A host function: receives plain values, returns a value or a promise. */
export type HostFn = (...args: unknown[]) => unknown;

const truthy = (v: unknown) => v !== null && v !== undefined && v !== false;
const STEP_LIMIT = 4_000_000;

/** The interpreter. One instance runs one script (or command). */
export class Interpreter {
  globals = new Scope();
  steps = 0;
  aborted = false;
  depth = 0;
  /** Receives output lines: kind is print | warn | error | info. */
  constructor(public out: (kind: 'print' | 'warn' | 'error' | 'info', text: string) => void) {
    this.installStdlib();
  }

  /** Make a global available to scripts. */
  setGlobal(name: string, value: unknown): void { this.globals.vars.set(name, value); }

  /** Runs source text. Errors are reported through `out` and also returned. */
  async run(src: string, chunkName = 'script'): Promise<{ ok: boolean; error?: string }> {
    this.steps = 0;
    try {
      const ast = parse(src);
      const scope = new Scope(this.globals);
      await this.execBlock(ast, scope);
      return { ok: true };
    } catch (e) {
      const msg = e instanceof LuauError ? e.message : `Internal error: ${(e as Error).message}`;
      if (!this.aborted) this.out('error', `${chunkName}: ${msg}`);
      return { ok: false, error: msg };
    }
  }

  abort(): void { this.aborted = true; }

  private async tick(line: number): Promise<void> {
    if (this.aborted) throw new LuauError('Script stopped');
    this.steps++;
    if (this.steps > STEP_LIMIT) throw new LuauError(`Script exhausted allowed execution time (line ${line}). Add task.wait() inside long loops.`);
    if (this.steps % 20000 === 0) await new Promise((r) => setTimeout(r, 0));
  }

  async execBlock(body: Node[], scope: Scope): Promise<Signal | null> {
    for (const s of body) {
      const sig = await this.exec(s, scope);
      if (sig) return sig;
    }
    return null;
  }

  private async exec(n: Node, scope: Scope): Promise<Signal | null> {
    await this.tick(n.line);
    switch (n.t) {
      case 'local': {
        if (n.isFunc) {
          scope.vars.set(n.names[0], undefined);
          scope.vars.set(n.names[0], await this.ev(n.exprs[0], scope));
          return null;
        }
        const vals = await this.evList(n.exprs, scope);
        n.names.forEach((nm: string, i: number) => scope.vars.set(nm, vals[i]));
        return null;
      }
      case 'assign': {
        const vals = await this.evList(n.exprs, scope);
        for (let i = 0; i < n.targets.length; i++) await this.assignTo(n.targets[i], vals[i], scope);
        return null;
      }
      case 'compound': {
        const cur = await this.ev(n.target, scope);
        const rhs = await this.ev(n.expr, scope);
        await this.assignTo(n.target, this.arith(n.op, cur, rhs, n.line), scope);
        return null;
      }
      case 'exprstat': await this.evMulti(n.expr, scope); return null;
      case 'if': {
        for (const c of n.clauses) if (truthy(await this.ev(c.cond, scope))) return this.execBlock(c.body, new Scope(scope));
        return n.orelse ? this.execBlock(n.orelse, new Scope(scope)) : null;
      }
      case 'while':
        while (truthy(await this.ev(n.cond, scope))) {
          await this.tick(n.line);
          const sig = await this.execBlock(n.body, new Scope(scope));
          if (sig?.kind === 'break') break;
          if (sig?.kind === 'return') return sig;
        }
        return null;
      case 'repeat':
        for (;;) {
          await this.tick(n.line);
          const inner = new Scope(scope);
          const sig = await this.execBlock(n.body, inner);
          if (sig?.kind === 'break') break;
          if (sig?.kind === 'return') return sig;
          if (truthy(await this.ev(n.cond, inner))) break;
        }
        return null;
      case 'do': return this.execBlock(n.body, new Scope(scope));
      case 'fornum': {
        const a = Number(await this.ev(n.a, scope)); const b = Number(await this.ev(n.b, scope));
        const step = n.c ? Number(await this.ev(n.c, scope)) : 1;
        if (Number.isNaN(a) || Number.isNaN(b) || Number.isNaN(step)) throw new LuauError(`Line ${n.line}: 'for' initial value must be a number`);
        if (step === 0) throw new LuauError(`Line ${n.line}: 'for' step is zero`);
        for (let i = a; step > 0 ? i <= b : i >= b; i += step) {
          await this.tick(n.line);
          const inner = new Scope(scope);
          inner.vars.set(n.v, i);
          const sig = await this.execBlock(n.body, inner);
          if (sig?.kind === 'break') break;
          if (sig?.kind === 'return') return sig;
        }
        return null;
      }
      case 'forin': {
        const init = await this.evList(n.exprs, scope);
        let [iter, state, ctl] = init;
        if (iter instanceof LuaTable && !iter.meta?.get('__call')) { // `for k, v in tbl do` (Luau)
          const t = iter; iter = this.pairsIter(t); state = t; ctl = undefined;
        }
        for (;;) {
          await this.tick(n.line);
          const r = await this.call(iter, [state, ctl], n.line);
          if (r[0] == null) break;
          ctl = r[0];
          const inner = new Scope(scope);
          n.names.forEach((nm: string, i: number) => inner.vars.set(nm, r[i]));
          const sig = await this.execBlock(n.body, inner);
          if (sig?.kind === 'break') break;
          if (sig?.kind === 'return') return sig;
        }
        return null;
      }
      case 'return': return { kind: 'return', values: await this.evList(n.exprs, scope) };
      case 'break': return { kind: 'break' };
      case 'continue': return { kind: 'continue' };
      default: throw new LuauError(`Line ${n.line}: cannot run '${n.t}'`);
    }
  }

  private async assignTo(target: Node, value: unknown, scope: Scope): Promise<void> {
    if (target.t === 'name') {
      const s = scope.lookup(target.v) || this.globals;
      s.vars.set(target.v, value);
      return;
    }
    const obj = await this.ev(target.obj, scope);
    const key = await this.ev(target.key, scope);
    this.setIndex(obj, key, value, target.line);
  }

  private async evList(nodes: Node[], scope: Scope): Promise<unknown[]> {
    const out: unknown[] = [];
    for (let i = 0; i < nodes.length; i++) {
      if (i === nodes.length - 1) out.push(...await this.evMulti(nodes[i], scope));
      else out.push(await this.ev(nodes[i], scope));
    }
    return out;
  }

  /** Evaluates a node that may produce several values (calls, `...`). */
  private async evMulti(n: Node, scope: Scope): Promise<unknown[]> {
    if (n.t === 'call') {
      const fn = await this.ev(n.fn, scope);
      const args = await this.evList(n.args, scope);
      return this.call(fn, args, n.line, n.fn.t === 'name' ? n.fn.v : undefined);
    }
    if (n.t === 'method') {
      const obj = await this.ev(n.obj, scope);
      const fn = this.index(obj, n.name, n.line);
      const args = await this.evList(n.args, scope);
      return this.call(fn, [obj, ...args], n.line, n.name);
    }
    if (n.t === 'vararg') { for (let s: Scope | null = scope; s; s = s.parent) if (s.vars.has('...')) return s.varargs; return []; }
    return [await this.ev(n, scope)];
  }

  async ev(n: Node, scope: Scope): Promise<unknown> {
    switch (n.t) {
      case 'num': case 'str': return n.v;
      case 'nil': return undefined;
      case 'true': return true;
      case 'false': return false;
      case 'paren': return this.ev(n.e, scope);
      case 'vararg': case 'call': case 'method': return (await this.evMulti(n, scope))[0];
      case 'name': {
        const s = scope.lookup(n.v);
        return s ? s.vars.get(n.v) : this.globals.vars.get(n.v);
      }
      case 'index': return this.index(await this.ev(n.obj, scope), await this.ev(n.key, scope), n.line);
      case 'function': return new Closure(n.params, n.vararg, n.body, scope, n.name);
      case 'table': {
        const t = new LuaTable();
        let idx = 1;
        for (let i = 0; i < n.items.length; i++) {
          const it = n.items[i];
          if (it.key) t.set(await this.ev(it.key, scope), await this.ev(it.value, scope));
          else if (i === n.items.length - 1) for (const v of await this.evMulti(it.value, scope)) t.set(idx++, v);
          else t.set(idx++, await this.ev(it.value, scope));
        }
        return t;
      }
      case 'unary': {
        const v = await this.ev(n.e, scope);
        if (n.op === 'not') return !truthy(v);
        if (n.op === '-') {
          if (typeof v === 'number') return -v;
          if (v instanceof Vector3) return new Vector3(-v.x, -v.y, -v.z);
          throw new LuauError(`Line ${n.line}: attempt to perform arithmetic (unm) on ${typeOf(v, true)}`);
        }
        if (typeof v === 'string') return v.length;
        if (v instanceof LuaTable) return v.length;
        throw new LuauError(`Line ${n.line}: attempt to get length of ${typeOf(v, true)}`);
      }
      case 'binary': {
        if (n.op === 'and') { const l = await this.ev(n.l, scope); return truthy(l) ? this.ev(n.r, scope) : l; }
        if (n.op === 'or') { const l = await this.ev(n.l, scope); return truthy(l) ? l : this.ev(n.r, scope); }
        const l = await this.ev(n.l, scope); const r = await this.ev(n.r, scope);
        return this.arith(n.op, l, r, n.line);
      }
      case 'ifexpr': {
        for (const c of n.clauses) if (truthy(await this.ev(c.c, scope))) return this.ev(c.a, scope);
        return this.ev(n.orelse, scope);
      }
      default: throw new LuauError(`Line ${n.line}: cannot evaluate '${n.t}'`);
    }
  }

  // ---- operators
  eq(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a instanceof Vector3 && b instanceof Vector3) return a.x === b.x && a.y === b.y && a.z === b.z;
    if (a instanceof Color3 && b instanceof Color3) return a.r === b.r && a.g === b.g && a.b === b.b;
    if (a == null && b == null) return true;
    return false;
  }

  arith(op: string, a: unknown, b: unknown, line: number): unknown {
    if (op === '==') return this.eq(a, b);
    if (op === '~=') return !this.eq(a, b);
    if (op === '..') {
      if ((typeof a === 'string' || typeof a === 'number') && (typeof b === 'string' || typeof b === 'number')) return tostr(a) + tostr(b);
      throw new LuauError(`Line ${line}: attempt to concatenate ${typeOf(typeof a === 'string' || typeof a === 'number' ? b : a, true)} value`);
    }
    if (op === '<' || op === '>' || op === '<=' || op === '>=') {
      if ((typeof a === 'number' && typeof b === 'number') || (typeof a === 'string' && typeof b === 'string')) {
        return op === '<' ? a < b : op === '>' ? a > b : op === '<=' ? a <= b : a >= b;
      }
      throw new LuauError(`Line ${line}: attempt to compare ${typeOf(a, true)} ${op} ${typeOf(b, true)}`);
    }
    if (a instanceof Vector3 || b instanceof Vector3) return this.vecArith(op, a, b, line);
    if (typeof a === 'string' && !Number.isNaN(Number(a))) a = Number(a);
    if (typeof b === 'string' && !Number.isNaN(Number(b))) b = Number(b);
    if (typeof a !== 'number' || typeof b !== 'number') throw new LuauError(`Line ${line}: attempt to perform arithmetic (${op}) on ${typeOf(typeof a === 'number' ? b : a, true)}`);
    switch (op) {
      case '+': return a + b; case '-': return a - b; case '*': return a * b; case '/': return a / b;
      case '//': return Math.floor(a / b); case '%': return a - Math.floor(a / b) * b; case '^': return a ** b;
      default: throw new LuauError(`Line ${line}: unknown operator ${op}`);
    }
  }

  private vecArith(op: string, a: unknown, b: unknown, line: number): Vector3 {
    const av = a instanceof Vector3 ? a : null; const bv = b instanceof Vector3 ? b : null;
    const f = (x: number, y: number) => (op === '+' ? x + y : op === '-' ? x - y : op === '*' ? x * y : op === '/' ? x / y : NaN);
    if (!['+', '-', '*', '/'].includes(op)) throw new LuauError(`Line ${line}: attempt to perform arithmetic (${op}) on Vector3`);
    if (av && bv) return new Vector3(f(av.x, bv.x), f(av.y, bv.y), f(av.z, bv.z));
    const v = (av || bv)!; const s = (av ? b : a);
    if (typeof s !== 'number') throw new LuauError(`Line ${line}: attempt to perform arithmetic (${op}) on Vector3 and ${typeOf(s, true)}`);
    return av ? new Vector3(f(v.x, s), f(v.y, s), f(v.z, s)) : new Vector3(f(s, v.x), f(s, v.y), f(s, v.z));
  }

  // ---- indexing
  index(obj: unknown, key: unknown, line = 0): unknown {
    if (obj instanceof LuaTable) {
      const raw = obj.get(key);
      if (raw !== undefined || !obj.meta) return raw;
      const h = obj.meta.get('__index');
      if (h instanceof LuaTable) return this.index(h, key, line);
      if (typeof h === 'function' || h instanceof Closure) return undefined; // functions need async; not supported in __index sync path
      return undefined;
    }
    if (typeof obj === 'string') { const f = (this.globals.vars.get('string') as LuaTable).get(key); return f; }
    if (obj == null) throw new LuauError(`Line ${line}: attempt to index nil with '${tostr(key)}'`);
    if (typeof obj === 'object' && 'get' in (obj as object)) return (obj as HostObject).get(String(key));
    throw new LuauError(`Line ${line}: attempt to index ${typeOf(obj, true)} with '${tostr(key)}'`);
  }

  setIndex(obj: unknown, key: unknown, value: unknown, line = 0): void {
    if (obj instanceof LuaTable) {
      if (obj.get(key) === undefined && obj.meta) {
        const h = obj.meta.get('__newindex');
        if (h instanceof LuaTable) { this.setIndex(h, key, value, line); return; }
      }
      obj.set(key, value); return;
    }
    if (obj == null) throw new LuauError(`Line ${line}: attempt to index nil with '${tostr(key)}'`);
    if (typeof obj === 'object' && 'set' in (obj as object)) { (obj as HostObject).set(String(key), value); return; }
    throw new LuauError(`Line ${line}: attempt to index ${typeOf(obj, true)} with '${tostr(key)}'`);
  }

  // ---- calls
  async call(fn: unknown, args: unknown[], line = 0, name?: string): Promise<unknown[]> {
    if (fn instanceof Closure) {
      if (++this.depth > 180) { this.depth = 0; throw new LuauError('Stack overflow (a function calls itself too deeply)'); }
      try {
        const scope = new Scope(fn.scope);
        fn.params.forEach((p, i) => scope.vars.set(p, args[i]));
        if (fn.vararg) { scope.varargs = args.slice(fn.params.length); scope.vars.set('...', true); }
        const sig = await this.execBlock(fn.body, scope);
        return sig?.kind === 'return' ? sig.values : [];
      } finally { this.depth = Math.max(0, this.depth - 1); }
    }
    if (typeof fn === 'function') {
      const r = await (fn as HostFn)(...args);
      return r instanceof Multi ? r.values : [r];
    }
    if (fn instanceof LuaTable) {
      const c = fn.meta?.get('__call');
      if (c) return this.call(c, [fn, ...args], line, name);
    }
    throw new LuauError(`Line ${line}: attempt to call ${name ? `'${name}' (a ${typeOf(fn, true)} value)` : `a ${typeOf(fn, true)} value`}`);
  }

  pairsIter(t: LuaTable): HostFn {
    const keys = t.keys(); let i = 0;
    return () => {
      while (i < keys.length) { const k = keys[i++]; const v = t.get(k); if (v !== undefined) return new Multi([k, v]); }
      return undefined;
    };
  }

  // ---- standard library
  private installStdlib(): void {
    const g = (k: string, v: unknown) => this.globals.vars.set(k, v);
    const lib = (entries: Record<string, unknown>) => { const t = new LuaTable(); for (const [k, v] of Object.entries(entries)) t.set(k, v); return t; };
    const num = (v: unknown, what: string): number => {
      if (typeof v === 'number') return v;
      if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
      throw new LuauError(`bad argument: ${what} expected number, got ${typeOf(v, true)}`);
    };
    g('print', (...a: unknown[]) => { this.out('print', a.map(tostr).join('\t')); });
    g('warn', (...a: unknown[]) => { this.out('warn', a.map(tostr).join(' ')); });
    g('type', (v: unknown) => typeOf(v));
    g('typeof', (v: unknown) => typeOf(v, true));
    g('tostring', (v: unknown) => tostr(v));
    g('tonumber', (v: unknown, base?: unknown) => {
      if (typeof v === 'number') return v;
      if (typeof v !== 'string') return undefined;
      const s = v.trim();
      if (base != null) { const n = parseInt(s, Number(base)); return Number.isNaN(n) ? undefined : n; }
      if (s === '' || Number.isNaN(Number(s))) return undefined;
      return Number(s);
    });
    g('assert', (v: unknown, msg?: unknown) => { if (!truthy(v)) throw new LuauError(msg == null ? 'assertion failed!' : tostr(msg), msg); return v; });
    g('error', (msg?: unknown) => { throw new LuauError(tostr(msg), msg); });
    g('pcall', async (f: unknown, ...a: unknown[]) => {
      try { const r = await this.call(f, a); return new Multi([true, ...r]); }
      catch (e) { if (this.aborted) throw e; return new Multi([false, e instanceof LuauError ? e.value : (e as Error).message]); }
    });
    g('select', (n: unknown, ...a: unknown[]) => (n === '#' ? a.length : new Multi(a.slice(Math.max(0, num(n, 'select') - 1)))));
    g('unpack', (t: LuaTable) => new Multi([...t.arr]));
    g('rawget', (t: LuaTable, k: unknown) => t.get(k));
    g('rawset', (t: LuaTable, k: unknown, v: unknown) => { t.set(k, v); return t; });
    g('rawequal', (a: unknown, b: unknown) => a === b);
    g('setmetatable', (t: LuaTable, m: LuaTable | undefined) => { t.meta = m ?? null; return t; });
    g('getmetatable', (t: LuaTable) => t.meta ?? undefined);
    g('pairs', (t: unknown) => { if (!(t instanceof LuaTable)) throw new LuauError(`bad argument #1 to 'pairs' (table expected, got ${typeOf(t, true)})`); return new Multi([this.pairsIter(t), t, undefined]); });
    g('ipairs', (t: unknown) => {
      if (!(t instanceof LuaTable)) throw new LuauError(`bad argument #1 to 'ipairs' (table expected, got ${typeOf(t, true)})`);
      return new Multi([(tt: LuaTable, i: number) => { const v = tt.get(i + 1); return v === undefined ? undefined : new Multi([i + 1, v]); }, t, 0]);
    });
    g('next', (t: LuaTable, k?: unknown) => {
      const keys = t.keys(); const i = k === undefined ? 0 : keys.indexOf(k) + 1;
      return i < keys.length ? new Multi([keys[i], t.get(keys[i])]) : undefined;
    });
    g('math', lib({
      pi: Math.PI, huge: Infinity,
      floor: (x: unknown) => Math.floor(num(x, 'floor')), ceil: (x: unknown) => Math.ceil(num(x, 'ceil')),
      sqrt: (x: unknown) => Math.sqrt(num(x, 'sqrt')), abs: (x: unknown) => Math.abs(num(x, 'abs')),
      sin: (x: unknown) => Math.sin(num(x, 'sin')), cos: (x: unknown) => Math.cos(num(x, 'cos')), tan: (x: unknown) => Math.tan(num(x, 'tan')),
      rad: (x: unknown) => (num(x, 'rad') * Math.PI) / 180, deg: (x: unknown) => (num(x, 'deg') * 180) / Math.PI,
      exp: (x: unknown) => Math.exp(num(x, 'exp')), log: (x: unknown, b?: unknown) => (b == null ? Math.log(num(x, 'log')) : Math.log(num(x, 'log')) / Math.log(num(b, 'log'))),
      min: (...a: unknown[]) => Math.min(...a.map((v) => num(v, 'min'))), max: (...a: unknown[]) => Math.max(...a.map((v) => num(v, 'max'))),
      clamp: (x: unknown, lo: unknown, hi: unknown) => Math.min(num(hi, 'clamp'), Math.max(num(lo, 'clamp'), num(x, 'clamp'))),
      round: (x: unknown) => { const n = num(x, 'round'); return n < 0 ? -Math.round(-n) : Math.round(n); },
      sign: (x: unknown) => Math.sign(num(x, 'sign')),
      fmod: (a: unknown, b: unknown) => num(a, 'fmod') % num(b, 'fmod'),
      random: (a?: unknown, b?: unknown) => {
        if (a == null) return Math.random();
        const lo = b == null ? 1 : num(a, 'random'); const hi = b == null ? num(a, 'random') : num(b, 'random');
        return lo + Math.floor(Math.random() * (hi - lo + 1));
      },
      randomseed: () => undefined,
    }));
    const strLib = lib({
      len: (s: unknown) => tostr(s).length, upper: (s: unknown) => tostr(s).toUpperCase(), lower: (s: unknown) => tostr(s).toLowerCase(),
      rep: (s: unknown, n: unknown, sep?: unknown) => Array(Math.max(0, num(n, 'rep'))).fill(tostr(s)).join(sep == null ? '' : tostr(sep)),
      reverse: (s: unknown) => [...tostr(s)].reverse().join(''),
      sub: (s: unknown, i: unknown, j?: unknown) => {
        const str = tostr(s); const len = str.length;
        let a = num(i, 'sub'); let b = j == null ? len : num(j, 'sub');
        if (a < 0) a = Math.max(1, len + a + 1); if (a === 0) a = 1; if (b < 0) b = len + b + 1; if (b > len) b = len;
        return a > b ? '' : str.slice(a - 1, b);
      },
      find: (s: unknown, pat: unknown, init?: unknown, plain?: unknown) => {
        const str = tostr(s); const start = init == null ? 0 : Math.max(0, num(init, 'find') - 1);
        const p = tostr(pat);
        if (truthy(plain) || !/[%^$*+?.()[\]-]/.test(p)) { const i = str.indexOf(p, start); return i < 0 ? undefined : new Multi([i + 1, i + p.length]); }
        const m = luaPattern(p).exec(str.slice(start));
        return m ? new Multi([start + m.index + 1, start + m.index + m[0].length, ...m.slice(1)]) : undefined;
      },
      match: (s: unknown, pat: unknown) => { const m = luaPattern(tostr(pat)).exec(tostr(s)); return m ? new Multi(m.length > 1 ? m.slice(1) : [m[0]]) : undefined; },
      gsub: async (s: unknown, pat: unknown, repl: unknown) => {
        const re = luaPattern(tostr(pat), 'g'); let count = 0; const str = tostr(s); let out = ''; let last = 0;
        for (const m of str.matchAll(re)) {
          count++; out += str.slice(last, m.index);
          let r: unknown;
          if (typeof repl === 'string') r = repl.replace(/%(\d)/g, (_, d) => (d === '0' ? m[0] : m[Number(d)] ?? ''));
          else if (repl instanceof LuaTable) r = repl.get(m[1] ?? m[0]);
          else r = (await this.call(repl, m.length > 1 ? m.slice(1) : [m[0]]))[0];
          out += r == null || r === false ? m[0] : tostr(r); last = (m.index ?? 0) + m[0].length;
        }
        return new Multi([out + str.slice(last), count]);
      },
      gmatch: (s: unknown, pat: unknown) => {
        const all = [...tostr(s).matchAll(luaPattern(tostr(pat), 'g'))]; let i = 0;
        return () => { const m = all[i++]; return m ? new Multi(m.length > 1 ? m.slice(1) : [m[0]]) : undefined; };
      },
      split: (s: unknown, sep?: unknown) => { const t = new LuaTable(); tostr(s).split(sep == null ? ',' : tostr(sep)).forEach((x, i) => t.set(i + 1, x)); return t; },
      byte: (s: unknown, i?: unknown) => tostr(s).charCodeAt(i == null ? 0 : num(i, 'byte') - 1),
      char: (...a: unknown[]) => String.fromCharCode(...a.map((x) => num(x, 'char'))),
      format: (f: unknown, ...a: unknown[]) => {
        let i = 0;
        return tostr(f).replace(/%([-+ 0#]*)(\d+)?(?:\.(\d+))?([sdifgxXqc%])/g, (_m, flags: string, w: string, p: string, c: string) => {
          if (c === '%') return '%';
          const v = a[i++];
          let s: string;
          if (c === 's') s = tostr(v); else if (c === 'q') s = JSON.stringify(tostr(v)); else if (c === 'c') s = String.fromCharCode(num(v, 'format'));
          else if (c === 'd' || c === 'i') s = String(Math.trunc(num(v, 'format')));
          else if (c === 'f') s = num(v, 'format').toFixed(p == null ? 6 : Number(p));
          else if (c === 'g') s = fmt(num(v, 'format'));
          else s = Math.trunc(num(v, 'format')).toString(16)[c === 'X' ? 'toUpperCase' : 'toString']();
          if (c === 's' && p != null) s = s.slice(0, Number(p));
          if (flags.includes('+') && /[dif]/.test(c) && num(v, 'format') >= 0) s = `+${s}`;
          const width = w ? Number(w) : 0;
          return flags.includes('-') ? s.padEnd(width) : s.padStart(width, flags.includes('0') && c !== 's' ? '0' : ' ');
        });
      },
    });
    g('string', strLib);
    g('table', lib({
      insert: (t: LuaTable, ...rest: unknown[]) => {
        if (rest.length === 1) { t.set(t.length + 1, rest[0]); return; }
        const pos = num(rest[0], 'insert'); for (let i = t.length; i >= pos; i--) t.set(i + 1, t.get(i)); t.set(pos, rest[1]);
      },
      remove: (t: LuaTable, pos?: unknown) => {
        const n = t.length; if (n === 0) return undefined;
        const p = pos == null ? n : num(pos, 'remove'); const v = t.get(p);
        for (let i = p; i < n; i++) t.set(i, t.get(i + 1)); t.set(n, undefined); return v;
      },
      concat: (t: LuaTable, sep?: unknown) => t.arr.map(tostr).join(sep == null ? '' : tostr(sep)),
      unpack: (t: LuaTable) => new Multi([...t.arr]),
      find: (t: LuaTable, v: unknown) => { const i = t.arr.indexOf(v); return i < 0 ? undefined : i + 1; },
      getn: (t: LuaTable) => t.length,
      clear: (t: LuaTable) => { t.arr = []; t.hash.clear(); },
      sort: async (t: LuaTable, cmp?: unknown) => {
        const items = [...t.arr];
        if (cmp == null) items.sort((a, b) => (a as number) < (b as number) ? -1 : (a as number) > (b as number) ? 1 : 0);
        else {
          // async comparator: merge sort
          const msort = async (xs: unknown[]): Promise<unknown[]> => {
            if (xs.length < 2) return xs;
            const mid = xs.length >> 1; const l = await msort(xs.slice(0, mid)); const r = await msort(xs.slice(mid)); const out: unknown[] = [];
            while (l.length && r.length) out.push(truthy((await this.call(cmp, [r[0], l[0]]))[0]) ? r.shift() : l.shift());
            return [...out, ...l, ...r];
          };
          const sorted = await msort(items); items.splice(0, items.length, ...sorted);
        }
        items.forEach((v, i) => t.set(i + 1, v));
      },
    }));
    g('os', lib({ time: () => Math.floor(Date.now() / 1000), clock: () => performance.now() / 1000, date: () => new Date().toISOString() }));
    g('tick', () => Date.now() / 1000);
    const wait = async (s?: unknown) => {
      const sec = Math.min(30, Math.max(0, s == null ? 0.03 : num(s, 'wait')));
      await new Promise((r) => setTimeout(r, sec * 1000));
      if (this.aborted) throw new LuauError('Script stopped');
      return sec;
    };
    g('wait', wait);
    g('task', lib({
      wait,
      spawn: (f: unknown, ...a: unknown[]) => { void this.call(f, a).catch((e: Error) => { if (!this.aborted) this.out('error', e.message); }); },
      defer: (f: unknown, ...a: unknown[]) => { void new Promise((r) => setTimeout(r, 0)).then(() => this.call(f, a)).catch((e: Error) => { if (!this.aborted) this.out('error', e.message); }); },
      delay: (s: unknown, f: unknown, ...a: unknown[]) => { void wait(s).then(() => this.call(f, a)).catch((e: Error) => { if (!this.aborted) this.out('error', e.message); }); },
    }));
    g('Vector3', lib({
      new: (x?: unknown, y?: unknown, z?: unknown) => new Vector3(Number(x ?? 0), Number(y ?? 0), Number(z ?? 0)),
      zero: new Vector3(0, 0, 0), one: new Vector3(1, 1, 1),
      xAxis: new Vector3(1, 0, 0), yAxis: new Vector3(0, 1, 0), zAxis: new Vector3(0, 0, 1),
    }));
    g('Color3', lib({
      new: (r?: unknown, gg?: unknown, b?: unknown) => new Color3(Number(r ?? 0), Number(gg ?? 0), Number(b ?? 0)),
      fromRGB: (r?: unknown, gg?: unknown, b?: unknown) => new Color3(Number(r ?? 0) / 255, Number(gg ?? 0) / 255, Number(b ?? 0) / 255),
      fromHex: (h: unknown) => Color3.fromHex(tostr(h)),
    }));
  }
}

/** Several return values from a host function. */
export class Multi { constructor(readonly values: unknown[]) {} }

/** Converts a Lua pattern into a JavaScript RegExp (common subset). */
function luaPattern(p: string, flags = ''): RegExp {
  const classes: Record<string, string> = { a: 'A-Za-z', d: '0-9', l: 'a-z', u: 'A-Z', w: 'A-Za-z0-9', s: '\\s', p: '!-\\/:-@\\[-`{-~', x: '0-9A-Fa-f' };
  let out = ''; let inSet = false;
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === '%') {
      const n = p[++i];
      const lower = n.toLowerCase();
      if (classes[lower]) out += inSet ? classes[lower] : `${n === lower ? '[' : '[^'}${classes[lower]}]`;
      else out += `\\${n}`;
    } else if (c === '-' && !inSet) out += '*?';
    else if (c === '[') { inSet = true; out += c; }
    else if (c === ']') { inSet = false; out += c; }
    else out += c;
  }
  try { return new RegExp(out, flags); } catch { throw new LuauError(`Pattern '${p}' is not supported`); }
}
