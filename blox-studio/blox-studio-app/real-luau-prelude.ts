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

local InstMT, HandleMT, ColorMT, EventMT = {}, {}, {}, {}
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
    if mt == InstMT then return "Instance" elseif mt == ColorMT then return "Color3" end
  end
  return t
end

local function say(kind, ...)
  local n = select("#", ...)
  local parts = {}
  for i = 1, n do parts[i] = tostring((select(i, ...))) end
  __host("log", '["' .. kind .. '",' .. jenc(table.concat(parts, "\t")) .. "]")
end
print = function(...) say("print", ...) end
warn = function(...) say("warn", ...) end
`;
