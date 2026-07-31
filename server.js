require("dotenv").config();
const express = require("express");
const path = require("path");
const { DatabaseSync } = require("node:sqlite"); // Node 22+ 내장 SQLite (네이티브 컴파일 불필요)
const basicAuth = require("express-basic-auth");

const PORT = process.env.PORT || 3000;
const BRAND_NAME = process.env.BRAND_NAME || "아키넥서스";
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "changeme123";

const ROLES = ["TA", "AA", "DBA", "SWA", "SA", "PM", "IT컨설턴트"];
const GRADES = ["초급", "중급", "고급", "특급"];
const VENDOR_STATUSES = ["신규", "컨택완료", "등록완료", "매칭중", "계약중", "보류"];
const PROJECT_SOURCES = ["나라장터 낙찰정보", "나라장터 입찰공고", "채용공고", "지인 네트워크", "SI사 협력사 등록", "기타"];
const PROJECT_STATUSES = ["발굴", "컨택완료", "제안중", "매칭중", "계약완료", "실패"];

// ── 수수료 정책 (Malt식 단계형 모델 기반) ─────────────
// 신규 매칭일수록 수수료를 높게, 관계가 지속되거나 직접 소개받은 고객일수록 낮게 책정해
// 재계약·소개를 유도하는 구조. 관리자가 프로젝트 등록/수정 시 관계유형을 고르면 기본값이
// 자동 제안되지만, 실제 협상 결과에 맞게 수수료율은 직접 조정할 수 있다.
const RELATIONSHIP_TYPES = ["신규 매칭", "6개월 이상 지속", "지인 소개"];
const DEFAULT_COMMISSION_RATE = {
  "신규 매칭": 15,
  "6개월 이상 지속": 7,
  "지인 소개": 3,
};

function calcCommission(contractAmount, rate) {
  const amt = Number(contractAmount) || 0;
  const r = Number(rate) || 0;
  return Math.round(amt * (r / 100));
}

// ── DB 초기화 ──────────────────────────────────────
const fs = require("fs");
const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, "archinexus.db"));

db.exec(`
CREATE TABLE IF NOT EXISTS vendors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  career_years INTEGER,
  grade TEXT,
  expertise TEXT,
  phone TEXT,
  email TEXT,
  available_date TEXT,
  work_type TEXT,
  rate TEXT,
  reference TEXT,
  consent TEXT DEFAULT 'N',
  status TEXT DEFAULT '신규',
  source TEXT,
  note TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  client TEXT,
  source TEXT,
  needed_roles TEXT,
  headcount INTEGER,
  budget TEXT,
  notice_date TEXT,
  start_date TEXT,
  contact_status TEXT DEFAULT '발굴',
  contact_info TEXT,
  matched_vendor TEXT,
  note TEXT,
  contract_amount INTEGER,
  relationship_type TEXT,
  commission_rate REAL,
  commission_amount INTEGER,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
`);

// 기존 DB에 새 컬럼이 없다면 추가 (구버전 데이터 마이그레이션 대응)
const projectCols = db.prepare("PRAGMA table_info(projects)").all().map(c => c.name);
const migrations = [
  ["contract_amount", "INTEGER"],
  ["relationship_type", "TEXT"],
  ["commission_rate", "REAL"],
  ["commission_amount", "INTEGER"],
];
for (const [col, type] of migrations) {
  if (!projectCols.includes(col)) {
    db.exec(`ALTER TABLE projects ADD COLUMN ${col} ${type}`);
  }
}

// ── 앱 설정 ────────────────────────────────────────
const app = express();
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.use((req, res, next) => {
  res.locals.brand = BRAND_NAME;
  next();
});

const requireAdmin = basicAuth({
  users: { [ADMIN_USER]: ADMIN_PASSWORD },
  challenge: true,
  realm: "ArchiNexus Admin", // WWW-Authenticate 헤더는 ASCII만 허용되어 한글 브랜드명 대신 영문 고정값 사용
});

// ── 공개 페이지 ────────────────────────────────────
app.get("/", (req, res) => {
  res.render("home", { roles: ROLES });
});

app.get("/how-it-works", (req, res) => {
  res.render("how_it_works");
});

app.get("/pricing", (req, res) => {
  res.render("pricing");
});

app.get("/request", (req, res) => {
  res.render("request", { roles: ROLES, success: req.query.success === "1" });
});

app.post("/request", (req, res) => {
  const b = req.body;
  db.prepare(`
    INSERT INTO projects (name, client, source, needed_roles, headcount, budget, start_date, contact_status, contact_info, note)
    VALUES ($name, $client, '자체 등록(웹)', $needed_roles, $headcount, $budget, $start_date, '발굴', $contact_info, $note)
  `).run({
    $name: b.name || "(회사명 프로젝트 문의)",
    $client: b.client || "",
    $needed_roles: Array.isArray(b.needed_roles) ? b.needed_roles.join(", ") : (b.needed_roles || ""),
    $headcount: b.headcount ? parseInt(b.headcount, 10) : null,
    $budget: b.budget || "",
    $start_date: b.start_date || "",
    $contact_info: b.contact_info || "",
    $note: b.note || "",
  });
  res.redirect("/request?success=1");
});

app.get("/register", (req, res) => {
  res.render("register", { roles: ROLES, grades: GRADES, success: req.query.success === "1" });
});

app.post("/register", (req, res) => {
  const b = req.body;
  db.prepare(`
    INSERT INTO vendors (name, role, career_years, grade, expertise, phone, email, available_date, work_type, rate, reference, consent, source)
    VALUES ($name, $role, $career_years, $grade, $expertise, $phone, $email, $available_date, $work_type, $rate, $reference, $consent, '자체 등록(웹)')
  `).run({
    $name: b.name || "",
    $role: b.role || "",
    $career_years: b.career_years ? parseInt(b.career_years, 10) : null,
    $grade: b.grade || "",
    $expertise: b.expertise || "",
    $phone: b.phone || "",
    $email: b.email || "",
    $available_date: b.available_date || "",
    $work_type: b.work_type || "",
    $rate: b.rate || "",
    $reference: b.reference || "",
    $consent: b.consent === "on" ? "Y" : "N",
  });
  res.redirect("/register?success=1");
});

// ── 관리자 페이지 (Basic Auth 보호) ─────────────────
app.use("/admin", requireAdmin);

app.get("/admin", (req, res) => {
  const vendorCount = db.prepare("SELECT COUNT(*) c FROM vendors").get().c;
  const projectCount = db.prepare("SELECT COUNT(*) c FROM projects").get().c;
  const roleCounts = ROLES.map(r => ({
    role: r,
    count: db.prepare("SELECT COUNT(*) c FROM vendors WHERE role = ?").get(r).c,
  }));
  const totalCommission = db.prepare(
    "SELECT COALESCE(SUM(commission_amount), 0) c FROM projects WHERE contact_status = '계약완료'"
  ).get().c;
  const pipelineCommission = db.prepare(
    "SELECT COALESCE(SUM(commission_amount), 0) c FROM projects WHERE contact_status != '계약완료' AND contact_status != '실패'"
  ).get().c;
  res.render("admin_home", { vendorCount, projectCount, roleCounts, totalCommission, pipelineCommission });
});

app.get("/admin/vendors", (req, res) => {
  const { role, keyword, status } = req.query;
  let sql = "SELECT * FROM vendors WHERE 1=1";
  const params = [];
  if (role) { sql += " AND role = ?"; params.push(role); }
  if (status) { sql += " AND status = ?"; params.push(status); }
  if (keyword) {
    sql += " AND (name LIKE ? OR expertise LIKE ? OR reference LIKE ?)";
    const k = `%${keyword}%`;
    params.push(k, k, k);
  }
  sql += " ORDER BY id DESC";
  const vendors = db.prepare(sql).all(...params);
  res.render("admin_vendors", {
    vendors, roles: ROLES, grades: GRADES, statuses: VENDOR_STATUSES,
    filter: { role: role || "", keyword: keyword || "", status: status || "" },
  });
});

app.get("/admin/vendors/new", (req, res) => {
  res.render("admin_vendor_form", { roles: ROLES, grades: GRADES, statuses: VENDOR_STATUSES });
});

app.post("/admin/vendors", (req, res) => {
  const b = req.body;
  db.prepare(`
    INSERT INTO vendors (name, role, career_years, grade, expertise, phone, email, available_date, work_type, rate, reference, consent, status, source, note)
    VALUES ($name, $role, $career_years, $grade, $expertise, $phone, $email, $available_date, $work_type, $rate, $reference, $consent, $status, $source, $note)
  `).run({
    $name: b.name || "",
    $role: b.role || "",
    $career_years: b.career_years ? parseInt(b.career_years, 10) : null,
    $grade: b.grade || "",
    $expertise: b.expertise || "",
    $phone: b.phone || "",
    $email: b.email || "",
    $available_date: b.available_date || "",
    $work_type: b.work_type || "",
    $rate: b.rate || "",
    $reference: b.reference || "",
    $consent: b.consent === "on" ? "Y" : "N",
    $status: b.status || "신규",
    $source: b.source || "",
    $note: b.note || "",
  });
  res.redirect("/admin/vendors");
});

app.post("/admin/vendors/:id/status", (req, res) => {
  db.prepare("UPDATE vendors SET status = ? WHERE id = ?").run(req.body.status, req.params.id);
  res.redirect("/admin/vendors");
});

app.post("/admin/vendors/:id/delete", (req, res) => {
  db.prepare("DELETE FROM vendors WHERE id = ?").run(req.params.id);
  res.redirect("/admin/vendors");
});

app.get("/admin/projects", (req, res) => {
  const { status } = req.query;
  let sql = "SELECT * FROM projects WHERE 1=1";
  const params = [];
  if (status) { sql += " AND contact_status = ?"; params.push(status); }
  sql += " ORDER BY id DESC";
  const projects = db.prepare(sql).all(...params);
  res.render("admin_projects", {
    projects, sources: PROJECT_SOURCES, statuses: PROJECT_STATUSES,
    filter: { status: status || "" },
  });
});

app.get("/admin/projects/new", (req, res) => {
  res.render("admin_project_form", {
    sources: PROJECT_SOURCES, statuses: PROJECT_STATUSES, roles: ROLES,
    relationshipTypes: RELATIONSHIP_TYPES, defaultRates: DEFAULT_COMMISSION_RATE,
  });
});

app.post("/admin/projects", (req, res) => {
  const b = req.body;
  const contractAmount = b.contract_amount ? parseInt(b.contract_amount, 10) : null;
  const relationshipType = b.relationship_type || "";
  const rate = b.commission_rate ? parseFloat(b.commission_rate) : (DEFAULT_COMMISSION_RATE[relationshipType] ?? null);
  const commissionAmount = contractAmount && rate ? calcCommission(contractAmount, rate) : null;

  db.prepare(`
    INSERT INTO projects (name, client, source, needed_roles, headcount, budget, notice_date, start_date, contact_status, contact_info, matched_vendor, note, contract_amount, relationship_type, commission_rate, commission_amount)
    VALUES ($name, $client, $source, $needed_roles, $headcount, $budget, $notice_date, $start_date, $contact_status, $contact_info, $matched_vendor, $note, $contract_amount, $relationship_type, $commission_rate, $commission_amount)
  `).run({
    $name: b.name || "",
    $client: b.client || "",
    $source: b.source || "",
    $needed_roles: Array.isArray(b.needed_roles) ? b.needed_roles.join(", ") : (b.needed_roles || ""),
    $headcount: b.headcount ? parseInt(b.headcount, 10) : null,
    $budget: b.budget || "",
    $notice_date: b.notice_date || "",
    $start_date: b.start_date || "",
    $contact_status: b.contact_status || "발굴",
    $contact_info: b.contact_info || "",
    $matched_vendor: b.matched_vendor || "",
    $note: b.note || "",
    $contract_amount: contractAmount,
    $relationship_type: relationshipType,
    $commission_rate: rate,
    $commission_amount: commissionAmount,
  });
  res.redirect("/admin/projects");
});

app.post("/admin/projects/:id/status", (req, res) => {
  db.prepare("UPDATE projects SET contact_status = ? WHERE id = ?").run(req.body.contact_status, req.params.id);
  res.redirect("/admin/projects");
});

app.post("/admin/projects/:id/commission", (req, res) => {
  const b = req.body;
  const contractAmount = b.contract_amount ? parseInt(b.contract_amount, 10) : null;
  const relationshipType = b.relationship_type || "";
  const rate = b.commission_rate ? parseFloat(b.commission_rate) : (DEFAULT_COMMISSION_RATE[relationshipType] ?? null);
  const commissionAmount = contractAmount && rate ? calcCommission(contractAmount, rate) : null;

  db.prepare(`
    UPDATE projects SET contract_amount = ?, relationship_type = ?, commission_rate = ?, commission_amount = ?
    WHERE id = ?
  `).run(contractAmount, relationshipType, rate, commissionAmount, req.params.id);
  res.redirect("/admin/projects");
});

// 관계유형별 기본 수수료율을 JSON으로 제공 (등록/수정 폼에서 자동 제안용)
app.get("/admin/commission-rates.json", (req, res) => {
  res.json(DEFAULT_COMMISSION_RATE);
});

app.post("/admin/projects/:id/delete", (req, res) => {
  db.prepare("DELETE FROM projects WHERE id = ?").run(req.params.id);
  res.redirect("/admin/projects");
});

app.listen(PORT, () => {
  console.log(`${BRAND_NAME} 서버 실행 중: http://localhost:${PORT}`);
  console.log(`관리자 페이지: http://localhost:${PORT}/admin (${ADMIN_USER} / ${ADMIN_PASSWORD})`);
});
