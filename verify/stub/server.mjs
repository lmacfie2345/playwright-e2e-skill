// Minimal stub shop used ONLY to verify the playwright-e2e TypeScript templates run as shipped. Not part of the skill's guidance.
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const port = Number(process.env.PORT ?? 4000);
const users = new Map(); // id -> {id,name,email,password,role}
const products = new Map(); // id -> {id,name,priceInPence}
const sessions = new Map(); // sid -> userId
const carts = new Map(); // userId -> Map(productId -> qty)

function seed() {
  users.clear(); products.clear(); sessions.clear(); carts.clear();
  const id = "admin";
  users.set(id, { id, name: "Admin", email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD, role: "admin" });
}
seed();

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
function currentUser(req) {
  const sid = /(?:^|;\s*)sid=([^;]+)/.exec(req.headers.cookie ?? "")?.[1];
  return sid ? users.get(sessions.get(sid)) : undefined;
}
const cartCount = (u) => [...(carts.get(u.id)?.values() ?? [])].reduce((a, b) => a + b, 0);
function header(u) {
  return `<header><nav aria-label="Main"><a href="/">Home</a> <a href="/cart">Cart</a></nav>
    <span>Signed in as ${esc(u.name)}</span> Items: <span data-testid="cart-count">${cartCount(u)}</span></header>`;
}
const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title></head><body>${body}</body></html>`;
async function body(req) { let s = ""; for await (const c of req) s += c; return s ? JSON.parse(s) : {}; }
function send(res, status, data, headers = {}) {
  const isHtml = typeof data === "string";
  res.writeHead(status, { "content-type": isHtml ? "text/html; charset=utf-8" : "application/json", ...headers });
  res.end(isHtml ? data : data === undefined ? "" : JSON.stringify(data));
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  const u = currentUser(req);
  const m = (method, re) => req.method === method && re.exec(url.pathname);
  let p;
  if (m("GET", /^\/api\/health$/) || m("GET", /^\/api\/categories$/)) return send(res, 200, { ok: true });
  if (m("POST", /^\/api\/auth\/login$/)) {
    const { email, password } = await body(req);
    const user = [...users.values()].find((x) => x.email === email && x.password === password);
    if (!user) return send(res, 401, { error: "Incorrect email or password" });
    const sid = randomUUID(); sessions.set(sid, user.id);
    return send(res, 200, { ok: true }, { "set-cookie": `sid=${sid}; Path=/; HttpOnly; SameSite=Lax` });
  }
  if (m("POST", /^\/api\/test-support\/reset$/)) { seed(); return send(res, 200, { ok: true }); }
  if (url.pathname.startsWith("/api/") && !u) return send(res, 401, { error: "Sign in" });
  if (m("DELETE", /^\/api\/test-support\/records$/)) {
    const prefix = url.searchParams.get("prefix") ?? "";
    if (!prefix || u.role !== "admin") return send(res, 400, { error: "prefix required" });
    let deleted = 0;
    for (const [id, x] of products) if (x.name.startsWith(prefix)) { products.delete(id); deleted++; }
    for (const [id, x] of users) if (x.email.startsWith(prefix)) { users.delete(id); deleted++; }
    return send(res, 200, { deleted });
  }
  if (m("POST", /^\/api\/products$/)) {
    if (u.role !== "admin") return send(res, 403, {});
    const { name, priceInPence } = await body(req); const id = randomUUID();
    products.set(id, { id, name, priceInPence }); return send(res, 201, products.get(id));
  }
  if ((p = m("DELETE", /^\/api\/products\/([^/]+)$/))) return send(res, products.delete(p[1]) ? 204 : 404);
  if (m("POST", /^\/api\/users$/)) {
    if (u.role !== "admin") return send(res, 403, {});
    const { name, email, password, role } = await body(req); const id = randomUUID();
    users.set(id, { id, name, email, password, role }); return send(res, 201, { id, email });
  }
  if ((p = m("DELETE", /^\/api\/users\/([^/]+)$/))) { carts.delete(p[1]); return send(res, users.delete(p[1]) ? 204 : 404); }
  if (m("POST", /^\/api\/cart\/items$/)) {
    const { productId, quantity } = await body(req);
    if (!products.has(productId)) return send(res, 404, { error: "No such product" });
    if (!Number.isInteger(quantity) || quantity < 1) return send(res, 400, { error: "Quantity must be at least 1" });
    const cart = carts.get(u.id) ?? new Map(); cart.set(productId, (cart.get(productId) ?? 0) + quantity); carts.set(u.id, cart);
    return send(res, 200, { count: cartCount(u) });
  }
  if (m("GET", /^\/login$/)) return send(res, 200, page("Sign in", `<main><h1>Sign in</h1><form id="f">
      <label for="e">Email</label><input id="e" type="email"><label for="pw">Password</label><input id="pw" type="password">
      <button type="submit">Sign in</button></form><div id="msg"></div></main><script>
      f.onsubmit = async (ev) => { ev.preventDefault();
        const r = await fetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: e.value, password: pw.value }) });
        if (r.ok) location.href = '/'; else msg.innerHTML = '<p role="alert">Incorrect email or password</p>'; };</script>`));
  if (!u) { res.writeHead(302, { location: "/login" }); return res.end(); }
  if (m("GET", /^\/$/)) return send(res, 200, page("Home", header(u) + "<main><h1>Home</h1></main>"));
  if ((p = m("GET", /^\/products\/([^/]+)$/))) {
    const product = products.get(decodeURIComponent(p[1]));
    if (!product) return send(res, 404, page("Not found", "<h1>Not found</h1>"));
    return send(res, 200, page(product.name, header(u) + `<main><h1>${esc(product.name)}</h1>
      <label for="q">Quantity</label><input id="q" type="number" value="1"><button id="add">Add to cart</button><div id="out"></div></main>
      <script>add.onclick = async () => {
        const r = await fetch('/api/cart/items', { method: 'POST', body: JSON.stringify({ productId: ${JSON.stringify(product.id)}, quantity: Number(q.value) }) });
        const d = await r.json();
        if (r.ok) { document.querySelector('[data-testid=cart-count]').textContent = d.count;
          out.innerHTML = '<p role="status"></p>'; out.firstChild.textContent = 'Added ' + q.value + ' × ' + ${JSON.stringify(product.name)} + ' to your cart'; }
        else { out.innerHTML = '<p role="alert"></p>'; out.firstChild.textContent = d.error; } };</script>`));
  }
  send(res, 404, page("Not found", "<h1>Not found</h1>"));
}).listen(port, "127.0.0.1", () => console.log(`stub on ${port}`));
