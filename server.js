require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const { DatabaseSync } = require("node:sqlite"); // Node 22+ 내장 SQLite (네이티브 컴파일 불필요)
const basicAuth = require("express-basic-auth");

const PORT = process.env.PORT || 3000;
const BRAND_NAME = process.env.BRAND_NAME || "아키넥서스";
const BRAND_NAME_EN = process.env.BRAND_NAME_EN || "ArchiNexus";
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "changeme123";

// 회사 정보 (.env에서 설정, 비어 있으면 화면에 표시하지 않음)
const COMPANY = {
  name: process.env.COMPANY_NAME || BRAND_NAME,
  ceo: process.env.COMPANY_CEO || "",
  bizNo: process.env.COMPANY_BIZ_NO || "",
  address: process.env.COMPANY_ADDRESS || "",
  phone: process.env.COMPANY_PHONE || "",
  email: process.env.COMPANY_EMAIL || "",
  siteUrl: process.env.SITE_URL || "",
};

const ROLES = ["TA", "AA", "DBA", "SWA", "SA", "PM", "IT컨설턴트"];
const GRADES = ["초급", "중급", "고급", "특급"];
const VENDOR_STATUSES = ["신규", "컨택완료", "등록완료", "매칭중", "계약중", "보류"];
const PROJECT_SOURCES = ["나라장터 낙찰정보", "나라장터 입찰공고", "채용공고", "지인 네트워크", "SI사 협력사 등록", "기타"];
const PROJECT_STATUSES = ["발굴", "컨택완료", "제안중", "매칭중", "계약완료", "실패"];
const INQUIRY_TYPES = ["기업 인력 의뢰", "전문가 등록 문의", "제휴·협력 제안", "기타"];
const INQUIRY_STATUSES = ["접수", "확인중", "답변완료"];

// 직군 소개 (홈·회사소개 페이지 공용)
const ROLE_INFO = [
  { code: "TA", name: "테크니컬 아키텍트", en: "Technical Architect",
    desc: "인프라·플랫폼·미들웨어 기술 표준을 수립하고 성능·용량·가용성 설계를 책임집니다." },
  { code: "AA", name: "애플리케이션 아키텍트", en: "Application Architect",
    desc: "애플리케이션 구조, 공통 모듈, 개발 표준과 프레임워크를 설계해 개발 생산성과 품질을 좌우합니다." },
  { code: "DBA", name: "데이터베이스 관리자", en: "Database Administrator",
    desc: "데이터 모델 검토, DB 설계·튜닝·이행·운영을 담당하며 대용량 트랜잭션 안정성을 확보합니다." },
  { code: "SWA", name: "소프트웨어 아키텍트", en: "Software Architect",
    desc: "시스템 전체의 소프트웨어 구조와 품질 속성을 설계하고 기술 의사결정을 주도합니다." },
  { code: "SA", name: "시스템 아키텍트", en: "System Architect",
    desc: "서버·네트워크·보안·클라우드 등 시스템 기반 구조를 설계하고 구축 방향을 제시합니다." },
  { code: "PM", name: "프로젝트 매니저", en: "Project Manager",
    desc: "공공·금융 SI 경험을 바탕으로 일정·범위·품질·이해관계자를 관리해 사업을 완수합니다." },
  { code: "IT컨설턴트", name: "IT 컨설턴트", en: "IT Consultant",
    desc: "ISP·ISMP, 정보화 전략, PMO, 감리 대응 등 사업 기획 단계부터 함께합니다." },
];

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

// 공개 폼 입력값 정리 (길이 제한 + 공백 제거)
function clean(v, max = 500) {
  if (Array.isArray(v)) v = v.join(", ");
  return String(v ?? "").trim().slice(0, max);
}

// ── DB 초기화 ──────────────────────────────────────
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

CREATE TABLE IF NOT EXISTS inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT,
  name TEXT NOT NULL,
  company TEXT,
  email TEXT,
  phone TEXT,
  message TEXT,
  status TEXT DEFAULT '접수',
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
app.disable("x-powered-by");
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public"), { maxAge: "1h" }));

app.use((req, res, next) => {
  res.locals.brand = BRAND_NAME;
  res.locals.brandEn = BRAND_NAME_EN;
  res.locals.company = COMPANY;
  res.locals.path = req.path;
  res.locals.pageTitle = "";
  res.locals.pageDesc = `${BRAND_NAME}는 TA·AA·DBA·SWA·SA·PM·IT컨설턴트 등 설계와 의사결정을 책임지는 상급 IT 전문가만 검증해 공공·금융·SI 프로젝트에 연결하는 전문 인력 매칭 회사입니다.`;
  res.locals.isAdmin = req.path.startsWith("/admin");
  next();
});

const requireAdmin = basicAuth({
  users: { [ADMIN_USER]: ADMIN_PASSWORD },
  challenge: true,
  realm: "ArchiNexus Admin", // WWW-Authenticate 헤더는 ASCII만 허용되어 한글 브랜드명 대신 영문 고정값 사용
});

// ── 공개 페이지 ────────────────────────────────────
app.get("/", (req, res) => {
  res.render("home", { roles: ROLES, roleInfo: ROLE_INFO, rates: DEFAULT_COMMISSION_RATE });
});

app.get("/about", (req, res) => {
  res.render("about", {
    pageTitle: "회사소개",
    pageDesc: `${BRAND_NAME}의 미션과 일하는 방식, 회사 정보를 소개합니다.`,
    roleInfo: ROLE_INFO,
  });
});

app.get("/how-it-works", (req, res) => {
  res.render("how_it_works", {
    pageTitle: "서비스 소개",
    pageDesc: "기업 의뢰부터 전문가 매칭, 계약·투입까지 진행 방식을 안내합니다.",
  });
});

app.get("/pricing", (req, res) => {
  res.render("pricing", {
    pageTitle: "요금 안내",
    pageDesc: "전문가 등록은 무료, 매칭이 성사될 때만 단계형 수수료가 발생합니다.",
    rates: DEFAULT_COMMISSION_RATE,
  });
});

app.get("/contact", (req, res) => {
  res.render("contact", {
    pageTitle: "문의하기",
    pageDesc: `${BRAND_NAME}에 인력 의뢰, 전문가 등록, 제휴 관련 문의를 남겨주세요.`,
    types: INQUIRY_TYPES,
    success: req.query.success === "1",
  });
});

app.post("/contact", (req, res) => {
  const b = req.body;
  // 봇 차단용 숨김 필드: 값이 채워져 있으면 저장하지 않고 성공 화면만 보여준다
  if (b.website) return res.redirect("/contact?success=1");
  db.prepare(`
    INSERT INTO inquiries (type, name, company, email, phone, message)
    VALUES ($type, $name, $company, $email, $phone, $message)
  `).run({
    $type: INQUIRY_TYPES.includes(b.type) ? b.type : "기타",
    $name: clean(b.name, 100) || "(이름 없음)",
    $company: clean(b.company, 200),
    $email: clean(b.email, 200),
    $phone: clean(b.phone, 50),
    $message: clean(b.message, 4000),
  });
  res.redirect("/contact?success=1");
});

app.get("/privacy", (req, res) => {
  res.render("privacy", {
    pageTitle: "개인정보처리방침",
    pageDesc: `${BRAND_NAME} 개인정보처리방침`,
  });
});

app.get("/request", (req, res) => {
  res.render("request", {
    pageTitle: "기업 의뢰하기",
    pageDesc: "필요한 직군과 프로젝트 개요를 알려주시면 검증된 전문가를 제안합니다.",
    roles: ROLES, success: req.query.success === "1",
  });
});

app.post("/request", (req, res) => {
  const b = req.body;
  if (b.website) return res.redirect("/request?success=1");
  db.prepare(`
    INSERT INTO projects (name, client, source, needed_roles, headcount, budget, start_date, contact_status, contact_info, note)
    VALUES ($name, $client, '자체 등록(웹)', $needed_roles, $headcount, $budget, $start_date, '발굴', $contact_info, $note)
  `).run({
    $name: clean(b.name, 200) || "(회사명 프로젝트 문의)",
    $client: clean(b.client, 200),
    $needed_roles: clean(b.needed_roles, 200),
    $headcount: b.headcount ? parseInt(b.headcount, 10) : null,
    $budget: clean(b.budget, 100),
    $start_date: clean(b.start_date, 20),
    $contact_info: clean(b.contact_info, 200),
    $note: clean(b.note, 4000),
  });
  res.redirect("/request?success=1");
});

app.get("/register", (req, res) => {
  res.render("register", {
    pageTitle: "전문가 등록",
    pageDesc: "TA·AA·DBA·SWA·SA·PM·IT컨설턴트 경력자라면 무료로 등록하고 맞는 프로젝트만 제안받으세요.",
    roles: ROLES, grades: GRADES, success: req.query.success === "1",
  });
});

app.post("/register", (req, res) => {
  const b = req.body;
  if (b.website) return res.redirect("/register?success=1");
  db.prepare(`
    INSERT INTO vendors (name, role, career_years, grade, expertise, phone, email, available_date, work_type, rate, reference, consent, source)
    VALUES ($name, $role, $career_years, $grade, $expertise, $phone, $email, $available_date, $work_type, $rate, $reference, $consent, '자체 등록(웹)')
  `).run({
    $name: clean(b.name, 100),
    $role: ROLES.includes(b.role) ? b.role : clean(b.role, 50),
    $career_years: b.career_years ? parseInt(b.career_years, 10) : null,
    $grade: clean(b.grade, 20),
    $expertise: clean(b.expertise, 500),
    $phone: clean(b.phone, 50),
    $email: clean(b.email, 200),
    $available_date: clean(b.available_date, 20),
    $work_type: clean(b.work_type, 20),
    $rate: clean(b.rate, 100),
    $reference: clean(b.reference, 4000),
    $consent: b.consent === "on" ? "Y" : "N",
  });
  res.redirect("/register?success=1");
});

// ── 관리자 페이지 (Basic Auth 보호) ─────────────────
app.use("/admin", requireAdmin);

app.get("/admin", (req, res) => {
  const vendorCount = db.prepare("SELECT COUNT(*) c FROM vendors").get().c;
  const projectCount = db.prepare("SELECT COUNT(*) c FROM projects").get().c;
  const inquiryCount = db.prepare("SELECT COUNT(*) c FROM inquiries WHERE status != '답변완료'").get().c;
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
  res.render("admin_home", { pageTitle: "관리자", vendorCount, projectCount, inquiryCount, roleCounts, totalCommission, pipelineCommission });
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
    pageTitle: "인력풀 관리",
    vendors, roles: ROLES, grades: GRADES, statuses: VENDOR_STATUSES,
    filter: { role: role || "", keyword: keyword || "", status: status || "" },
  });
});

app.get("/admin/vendors/new", (req, res) => {
  res.render("admin_vendor_form", { pageTitle: "인력 등록", roles: ROLES, grades: GRADES, statuses: VENDOR_STATUSES });
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
    pageTitle: "프로젝트 트래커",
    projects, sources: PROJECT_SOURCES, statuses: PROJECT_STATUSES,
    filter: { status: status || "" },
  });
});

app.get("/admin/projects/new", (req, res) => {
  res.render("admin_project_form", {
    pageTitle: "프로젝트 등록",
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

// 문의 관리
app.get("/admin/inquiries", (req, res) => {
  const { status } = req.query;
  let sql = "SELECT * FROM inquiries WHERE 1=1";
  const params = [];
  if (status) { sql += " AND status = ?"; params.push(status); }
  sql += " ORDER BY id DESC";
  const inquiries = db.prepare(sql).all(...params);
  res.render("admin_inquiries", {
    pageTitle: "문의 관리",
    inquiries, statuses: INQUIRY_STATUSES, filter: { status: status || "" },
  });
});

app.post("/admin/inquiries/:id/status", (req, res) => {
  const status = INQUIRY_STATUSES.includes(req.body.status) ? req.body.status : "접수";
  db.prepare("UPDATE inquiries SET status = ? WHERE id = ?").run(status, req.params.id);
  res.redirect("/admin/inquiries");
});

app.post("/admin/inquiries/:id/delete", (req, res) => {
  db.prepare("DELETE FROM inquiries WHERE id = ?").run(req.params.id);
  res.redirect("/admin/inquiries");
});

// ── 404 ───────────────────────────────────────────
app.use((req, res) => {
  res.status(404).render("404", { pageTitle: "페이지를 찾을 수 없습니다" });
});

app.listen(PORT, () => {
  console.log(`${BRAND_NAME} 서버 실행 중: http://localhost:${PORT}`);
  console.log(`관리자 페이지: http://localhost:${PORT}/admin (${ADMIN_USER} / ${ADMIN_PASSWORD})`);
});
