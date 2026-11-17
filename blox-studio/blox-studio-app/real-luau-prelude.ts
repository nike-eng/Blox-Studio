/**
 * VoxMesa's startup script for real Luau. It gives scripts the Roblox things they expect (Vector3, Color3, Instance,
 * game, workspace, Enum) by talking to the editor through __host(op, jsonArgs). Written in Luau.
 */
export const REAL_LUAU_PRELUDE = String.raw`
local NULL = {}
local function esc(s)
  return (string.gsub(s, '[%c"\\]', function(c)
    if c == '"' then return '\\"' elseif c == "\\" then return "\\\\" elseif c == "\n" then return "\\n"
    elseif c == "\r" then return "\\r" elseif c == "\t" then return "\\t" end
    return string.format("\\u%04x", string.byte(c))
  end))
end

local InstMT, HandleMT, ColorMT, EventMT, CFMT = {}, {}, {}, {}, {}
local mkcf
local jenc
function jenc(v)
  local t = type(v)
  if v == nil then return "null"
  elseif t == "boolean" then return v and "true" or "false"
  elseif t == "number" then
    if v ~= v or v == math.huge or v == -math.huge then return "null" end
    return string.format("%.17g", v)
  elseif t == "string" then return '"' .. esc(v) .. '"'
  elseif t == "vector" then return '{"$":"v","v":[' .. jenc(v.x) .. "," .. jenc(v.y) .. "," .. jenc(v.z) .. "]}"
  elseif t == "table" then
    local mt = getmetatable(v)
    if mt == InstMT then return '{"$":"i","id":' .. jenc(rawget(v, "__id")) .. "}" end
    if mt == HandleMT then return '{"$":"h","h":' .. jenc(rawget(v, "__h")) .. "}" end
    if mt == CFMT then
      local m = rawget(v, "m")
      return '{"$":"cf","v":[' .. jenc(v.X) .. "," .. jenc(v.Y) .. "," .. jenc(v.Z) .. "," .. jenc(m[1]) .. "," .. jenc(m[2]) .. "," .. jenc(m[3]) .. "," .. jenc(m[4]) .. "," .. jenc(m[5]) .. "," .. jenc(m[6]) .. "," .. jenc(m[7]) .. "," .. jenc(m[8]) .. "," .. jenc(m[9]) .. "]}"
    end
    if mt == ColorMT then return '{"$":"c","v":[' .. jenc(v.R) .. "," .. jenc(v.G) .. "," .. jenc(v.B) .. "]}" end
    local parts = {}
    for i, x in ipairs(v) do parts[i] = jenc(x) end
    return '{"$":"t","a":[' .. table.concat(parts, ",") .. "]}"
  end
  error("This kind of value (" .. t .. ") cannot be passed to the editor yet", 0)
end

local function jdec(s)
  local pos = 1
  local val
  local function ws() pos = string.find(s, "[^ \n\r\t]", pos) or (#s + 1) end
  local function str()
    pos += 1
    local out = {}
    while true do
      local q = string.find(s, '["\\]', pos)
      if not q then error("bad reply from the editor", 0) end
      out[#out + 1] = string.sub(s, pos, q - 1)
      if string.sub(s, q, q) == '"' then pos = q + 1 break end
      local n = string.sub(s, q + 1, q + 1)
      if n == "n" then out[#out + 1] = "\n" elseif n == "t" then out[#out + 1] = "\t" elseif n == "r" then out[#out + 1] = "\r"
      elseif n == "u" then out[#out + 1] = utf8.char(tonumber(string.sub(s, q + 2, q + 5), 16)) pos = q + 4
      else out[#out + 1] = n end
      pos = q + 2 + (n == "u" and 4 or 0)
    end
    return table.concat(out)
  end
  function val()
    ws()
    local c = string.sub(s, pos, pos)
    if c == "{" then
      pos += 1
      local o = {}
      ws()
      if string.sub(s, pos, pos) == "}" then pos += 1 return o end
      while true do
        ws()
        local k = str()
        ws() pos += 1 -- colon
        local v = val()
        if v ~= NULL then o[k] = v end
        ws()
        local d = string.sub(s, pos, pos) pos += 1
        if d == "}" then return o end
      end
    elseif c == "[" then
      pos += 1
      local a = {}
      ws()
      if string.sub(s, pos, pos) == "]" then pos += 1 return a end
      local n = 0
      while true do
        n += 1
        a[n] = val()
        ws()
        local d = string.sub(s, pos, pos) pos += 1
        if d == "]" then return a, n end
      end
    elseif c == '"' then return str()
    elseif string.sub(s, pos, pos + 3) == "true" then pos += 4 return true
    elseif string.sub(s, pos, pos + 4) == "false" then pos += 5 return false
    elseif string.sub(s, pos, pos + 3) == "null" then pos += 4 return NULL
    else
      local num = string.match(s, "^-?[%d%.eE+-]+", pos)
      pos += #num
      return tonumber(num)
    end
  end
  return val()
end

local cacheI = setmetatable({}, { __mode = "v" })
local cacheH = setmetatable({}, { __mode = "v" })
local function inst(id)
  local o = cacheI[id]
  if not o then o = setmetatable({ __id = id }, InstMT) cacheI[id] = o end
  return o
end
local function handle(h)
  local o = cacheH[h]
  if not o then o = setmetatable({ __h = h }, HandleMT) cacheH[h] = o end
  return o
end

local METHOD = {}
local conv
function conv(n)
  if type(n) ~= "table" then return n end
  local tag = n["$"]
  if tag == "i" then return inst(n.id)
  elseif tag == "h" then return handle(n.h)
  elseif tag == "v" then return vector.create(n.v[1], n.v[2], n.v[3])
  elseif tag == "cf" then local a = n.v return mkcf(a[1], a[2], a[3], { a[4], a[5], a[6], a[7], a[8], a[9], a[10], a[11], a[12] })
  elseif tag == "c" then return setmetatable({ R = n.v[1], G = n.v[2], B = n.v[3] }, ColorMT)
  elseif tag == "m" then return METHOD
  elseif tag == "e" then return setmetatable({ __name = n.n }, EventMT)
  elseif tag == "t" then
    local t = {}
    for i, x in ipairs(n.a) do t[i] = conv(x) end
    return t
  end
  return n
end

local function H(level, op, ...)
  local parts = {}
  local n = select("#", ...)
  for i = 1, n do parts[i] = jenc((select(i, ...))) end
  local reply = jdec(__host(op, "[" .. table.concat(parts, ",") .. "]"))
  if reply.e then error(reply.e, level) end
  local r = reply.r
  if r == NULL then return nil end
  return conv(r)
end

local function target(t) return t end
local function indexer(self, key)
  local r = H(3, "get", self, key)
  if r == METHOD then
    return function(me, ...)
      local args = { ... }
      local parts = {}
      for i = 1, select("#", ...) do parts[i] = jenc(args[i]) end
      local reply = jdec(__host("call", "[" .. jenc(me) .. "," .. jenc(key) .. ",{\"$\":\"t\",\"a\":[" .. table.concat(parts, ",") .. "]}]"))
      if reply.e then error(reply.e, 2) end
      if reply.r == NULL then return nil end
      return conv(reply.r)
    end
  end
  return r
end
local function newindexer(self, key, value) H(3, "set", self, key, value) end
InstMT.__index = indexer
InstMT.__newindex = newindexer
InstMT.__tostring = function(self) return tostring(H(3, "get", self, "Name")) end
HandleMT.__index = indexer
HandleMT.__newindex = newindexer
HandleMT.__tostring = function() return "Object" end

EventMT.__index = function(self, key)
  local name = rawget(self, "__name")
  if key == "Connect" or key == "Once" or key == "Wait" then
    return function() __host("warn", '["' .. name .. '"]') return nil end
  end
  return nil
end

ColorMT.__index = ColorMT
ColorMT.__tostring = function(c) return c.R .. ", " .. c.G .. ", " .. c.B end
Color3 = {
  new = function(r, g, b) return setmetatable({ R = r or 0, G = g or 0, B = b or 0 }, ColorMT) end,
  fromRGB = function(r, g, b) return setmetatable({ R = (r or 0) / 255, G = (g or 0) / 255, B = (b or 0) / 255 }, ColorMT) end,
  fromHex = function(h)
    h = string.gsub(h, "#", "")
    return setmetatable({ R = tonumber(string.sub(h, 1, 2), 16) / 255, G = tonumber(string.sub(h, 3, 4), 16) / 255, B = tonumber(string.sub(h, 5, 6), 16) / 255 }, ColorMT)
  end,
}

Vector3 = {
  new = function(x, y, z) return vector.create(x or 0, y or 0, z or 0) end,
  zero = vector.zero, one = vector.one,
  xAxis = vector.create(1, 0, 0), yAxis = vector.create(0, 1, 0), zAxis = vector.create(0, 0, 1),
}
__setvecmeta({
  __index = function(v, k)
    if k == "X" then return v.x elseif k == "Y" then return v.y elseif k == "Z" then return v.z
    elseif k == "Magnitude" then return vector.magnitude(v)
    elseif k == "Unit" then return vector.normalize(v)
    elseif k == "Dot" then return function(a, b) return vector.dot(a, b) end
    elseif k == "Cross" then return function(a, b) return vector.cross(a, b) end
    elseif k == "Lerp" then return function(a, b, t) return a + (b - a) * t end
    end
    return nil
  end,
})

-- CFrame: a position plus a 3x3 rotation (row by row: m[1..3] is the first row).
mkcf = function(x, y, z, m) return setmetatable({ X = x, Y = y, Z = z, m = m }, CFMT) end
local IDENT = { 1, 0, 0, 0, 1, 0, 0, 0, 1 }
local function matmul(a, b)
  local r = {}
  for i = 0, 2 do
    for j = 1, 3 do
      r[i * 3 + j] = a[i * 3 + 1] * b[j] + a[i * 3 + 2] * b[3 + j] + a[i * 3 + 3] * b[6 + j]
    end
  end
  return r
end
local function rotvec(m, v) return vector.create(m[1] * v.x + m[2] * v.y + m[3] * v.z, m[4] * v.x + m[5] * v.y + m[6] * v.z, m[7] * v.x + m[8] * v.y + m[9] * v.z) end
local function rotvecT(m, v) return vector.create(m[1] * v.x + m[4] * v.y + m[7] * v.z, m[2] * v.x + m[5] * v.y + m[8] * v.z, m[3] * v.x + m[6] * v.y + m[9] * v.z) end
local function rx(a) local c, s = math.cos(a), math.sin(a) return { 1, 0, 0, 0, c, -s, 0, s, c } end
local function ry(a) local c, s = math.cos(a), math.sin(a) return { c, 0, s, 0, 1, 0, -s, 0, c } end
local function rz(a) local c, s = math.cos(a), math.sin(a) return { c, -s, 0, s, c, 0, 0, 0, 1 } end
local function cfLook(at, target, up)
  local z = vector.normalize(at - target)
  local x = vector.cross(up or vector.create(0, 1, 0), z)
  if vector.magnitude(x) < 1e-6 then x = vector.create(1, 0, 0) end
  x = vector.normalize(x)
  local y = vector.cross(z, x)
  return mkcf(at.x, at.y, at.z, { x.x, y.x, z.x, x.y, y.y, z.y, x.z, y.z, z.z })
end
CFMT.__index = function(c, k)
  local m = rawget(c, "m")
  if k == "Position" then return vector.create(c.X, c.Y, c.Z)
  elseif k == "RightVector" then return vector.create(m[1], m[4], m[7])
  elseif k == "UpVector" then return vector.create(m[2], m[5], m[8])
  elseif k == "LookVector" then return vector.create(-m[3], -m[6], -m[9])
  elseif k == "Rotation" then return mkcf(0, 0, 0, m)
  elseif k == "Inverse" then
    return function(self)
      local t = { m[1], m[4], m[7], m[2], m[5], m[8], m[3], m[6], m[9] }
      local p = rotvec(t, vector.create(-self.X, -self.Y, -self.Z))
      return mkcf(p.x, p.y, p.z, t)
    end
  elseif k == "ToWorldSpace" then return function(self, o) return self * o end
  elseif k == "ToObjectSpace" then return function(self, o) return self:Inverse() * o end
  elseif k == "PointToWorldSpace" then return function(self, v) return self * v end
  elseif k == "PointToObjectSpace" then return function(self, v) return self:Inverse() * v end
  elseif k == "VectorToWorldSpace" then return function(self, v) return rotvec(m, v) end
  elseif k == "VectorToObjectSpace" then return function(self, v) return rotvecT(m, v) end
  elseif k == "Lerp" then
    return function(self, o, t)
      local om = rawget(o, "m")
      local r = {}
      for i = 1, 9 do r[i] = m[i] + (om[i] - m[i]) * t end
      -- re-orthonormalise the blended rotation
      local x = vector.normalize(vector.create(r[1], r[4], r[7]))
      local z = vector.normalize(vector.cross(x, vector.create(r[2], r[5], r[8])))
      local y = vector.cross(z, x)
      return mkcf(self.X + (o.X - self.X) * t, self.Y + (o.Y - self.Y) * t, self.Z + (o.Z - self.Z) * t, { x.x, y.x, z.x, x.y, y.y, z.y, x.z, y.z, z.z })
    end
  elseif k == "GetComponents" then
    return function(self) return self.X, self.Y, self.Z, table.unpack(m) end
  elseif k == "ToEulerAnglesXYZ" or k == "ToOrientation" then
    return function()
      local y = math.asin(math.clamp(m[3], -1, 1))
      if math.abs(m[3]) < 0.9999999 then return math.atan2(-m[6], m[9]), y, math.atan2(-m[2], m[1]) end
      return math.atan2(m[8], m[5]), y, 0
    end
  end
  return nil
end
CFMT.__mul = function(a, b)
  if getmetatable(b) == CFMT then
    local p = rotvec(a.m, vector.create(b.X, b.Y, b.Z))
    return mkcf(a.X + p.x, a.Y + p.y, a.Z + p.z, matmul(a.m, b.m))
  end
  local p = rotvec(a.m, b)
  return vector.create(a.X + p.x, a.Y + p.y, a.Z + p.z)
end
CFMT.__add = function(a, v) return mkcf(a.X + v.x, a.Y + v.y, a.Z + v.z, a.m) end
CFMT.__sub = function(a, v) return mkcf(a.X - v.x, a.Y - v.y, a.Z - v.z, a.m) end
CFMT.__eq = function(a, b) return a.X == b.X and a.Y == b.Y and a.Z == b.Z and table.concat(a.m, ",") == table.concat(b.m, ",") end
CFMT.__tostring = function(c) return c.X .. ", " .. c.Y .. ", " .. c.Z end
CFrame = {
  new = function(a, b, c, ...)
    if a == nil then return mkcf(0, 0, 0, IDENT) end
    if type(a) == "vector" then
      if type(b) == "vector" then return cfLook(a, b) end
      return mkcf(a.x, a.y, a.z, IDENT)
    end
    if select("#", ...) >= 9 then local r = { ... } return mkcf(a, b, c, { r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9] }) end
    return mkcf(a, b, c, IDENT)
  end,
  Angles = function(x, y, z) return mkcf(0, 0, 0, matmul(matmul(rx(x or 0), ry(y or 0)), rz(z or 0))) end,
  fromOrientation = function(x, y, z) return mkcf(0, 0, 0, matmul(matmul(ry(y or 0), rx(x or 0)), rz(z or 0))) end,
  lookAt = function(at, target, up) return cfLook(at, target, up) end,
}
CFrame.fromEulerAnglesXYZ = CFrame.Angles
CFrame.identity = mkcf(0, 0, 0, IDENT)

Instance = {
  new = function(className, parent) return H(2, "new", className, parent) end,
}
game = handle(1)
Enum = handle(2)
workspace = inst("Workspace")
function __script(id) return inst(id) end

local realType = type
typeof = function(v)
  local t = realType(v)
  if t == "vector" then return "Vector3" end
  if t == "table" then
    local mt = getmetatable(v)
    if mt == InstMT then return "Instance" elseif mt == ColorMT then return "Color3" elseif mt == CFMT then return "CFrame" end
  end
  return t
end

-- Scheduler: every script runs as a coroutine; task.wait() yields and the editor wakes it up later.
local tasks = {}
local clock = 0
local firstErr = nil
local function resume(co, ...)
  local ok, a = coroutine.resume(co, ...)
  if not ok then
    if not firstErr then firstErr = tostring(a) end
  elseif coroutine.status(co) == "suspended" then
    tasks[#tasks + 1] = { co = co, at = clock + math.max(tonumber(a) or 0, 0.016) * 1000, since = clock }
  end
end
local function asThread(f) if type(f) == "thread" then return f end return coroutine.create(f) end
task = {
  wait = function(n) return coroutine.yield(n or 0) end,
  spawn = function(f, ...) local co = asThread(f) resume(co, ...) return co end,
  defer = function(f, ...) local co = asThread(f) tasks[#tasks + 1] = { co = co, at = clock, since = clock, args = table.pack(...) } return co end,
  delay = function(t, f, ...) local co = asThread(f) tasks[#tasks + 1] = { co = co, at = clock + (t or 0) * 1000, since = clock, args = table.pack(...) } return co end,
  cancel = function(co)
    for i = #tasks, 1, -1 do if tasks[i].co == co then table.remove(tasks, i) end end
  end,
}
wait = task.wait
spawn = task.spawn
delay = task.delay
function __runmain(fn, now)
  clock = now
  resume(coroutine.create(fn))
  return firstErr
end
function __tick(now)
  clock = now
  while true do
    local best, bi = nil, nil
    for i, e in ipairs(tasks) do
      if e.at <= now and (not best or e.at < best.at) then best, bi = e, i end
    end
    if not best then break end
    table.remove(tasks, bi)
    if best.args then resume(best.co, table.unpack(best.args, 1, best.args.n))
    else resume(best.co, (now - best.since) / 1000) end
  end
  return firstErr
end
function __next()
  local m = nil
  for _, e in ipairs(tasks) do if not m or e.at < m then m = e.at end end
  return m or -1
end
function __clear() tasks = {} firstErr = nil end

local function say(kind, ...)
  local n = select("#", ...)
  local parts = {}
  for i = 1, n do parts[i] = tostring((select(i, ...))) end
  __host("log", '["' .. kind .. '",' .. jenc(table.concat(parts, "\t")) .. "]")
end
print = function(...) say("print", ...) end
warn = function(...) say("warn", ...) end
`;
