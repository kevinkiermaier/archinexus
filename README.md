# 아키넥서스 (ArchiNexus)

TA·AA·DBA·SWA·SA·PM·IT컨설턴트 전문 인력소싱 플랫폼 MVP입니다.

- 공개 페이지: 전문가 등록 폼 (`/register`)
- 관리자 페이지: 인력풀 관리, 프로젝트 트래커 (`/admin`, Basic Auth로 보호)
- DB: 파일 기반 SQLite (Node.js 22+ 내장 `node:sqlite` 사용 — 별도 설치·컴파일 불필요)

## 1. 로컬에서 바로 실행하기

사전 준비: [Node.js 22.5 이상](https://nodejs.org) 설치 (터미널에서 `node -v`로 확인)

```bash
cd archinexus
npm install
cp .env.example .env      # 관리자 비밀번호 등을 여기서 바꿀 수 있습니다
npm start
```

실행되면 터미널에 아래처럼 뜹니다.

```
아키넥서스 서버 실행 중: http://localhost:3000
관리자 페이지: http://localhost:3000/admin (admin / changeme123)
```

브라우저에서 `http://localhost:3000` 접속하면 됩니다. 데이터는 `data/archinexus.db` 파일에 자동 저장됩니다.

**꼭 하실 일**: `.env` 파일의 `ADMIN_PASSWORD`를 실제 비밀번호로 바꾸세요. 특히 온라인에 공개할 계획이라면 필수입니다.

## 2. 화면 구성

| 경로 | 설명 |
|---|---|
| `/` | 회사 홈페이지 메인 (히어로, 서비스, 7개 직군, 진행 방식, 수수료, FAQ) |
| `/about` | 회사소개 (미션, 일하는 원칙, 사업 영역, 회사 정보) |
| `/how-it-works` | 서비스 소개 / 진행 방식 |
| `/pricing` | 요금 안내 (단계형 수수료) |
| `/contact` | 문의하기 폼 — 접수 내용은 `/admin/inquiries`에서 확인 |
| `/privacy` | 개인정보처리방침 |
| `/register` | 전문가(TA/AA/DBA/SWA/SA/PM/IT컨설턴트) 셀프 등록 폼 |
| `/request` | 기업 의뢰 폼 |
| `/admin` | 관리자 대시보드 (요약 통계) |
| `/admin/vendors` | 인력풀 목록/검색/상태 변경/삭제 |
| `/admin/vendors/new` | 관리자가 직접 인력 등록 (지인·잡코리아 소싱분 입력용) |
| `/admin/projects` | 프로젝트 트래커 목록/상태 변경/삭제 |
| `/admin/projects/new` | 프로젝트 신규 등록 (나라장터·채용공고·지인 발굴분 입력용) |
| `/admin/inquiries` | 문의 목록/상태 변경/삭제 |

### 회사 정보 표시

`.env`에 아래 값을 넣으면 푸터·회사소개·문의·개인정보처리방침 페이지에 자동으로 표시됩니다. 비워두면 해당 항목은 화면에 나오지 않습니다.

```
COMPANY_NAME=주식회사 OOO        # 법인명 (비우면 BRAND_NAME 사용)
COMPANY_CEO=홍길동
COMPANY_BIZ_NO=123-45-67890
COMPANY_ADDRESS=서울특별시 ...
COMPANY_PHONE=02-000-0000
COMPANY_EMAIL=contact@it-soft.co.kr
SITE_URL=https://it-soft.co.kr   # canonical / og:url 생성용
```

## 3. 온라인에 공개하기 (터미널 없이, GitHub 웹 업로드 + Render)

한 번만 세팅해두면, 이후로는 압축 풀고 npm install 하실 필요 없이 실제 웹주소로 바로 확인할 수 있습니다.

**3-1. GitHub에 코드 올리기 (터미널 불필요)**

1. [github.com](https://github.com)에 로그인 → 오른쪽 위 `+` → `New repository`
2. Repository name에 `archinexus` 입력 → `Create repository` (Public/Private 아무거나 상관없음)
3. 생성된 빈 저장소 페이지에서 `uploading an existing file` 링크 클릭
4. 이 `archinexus` 폴더 안의 내용물을 통째로 드래그해서 업로드 — 단, **`node_modules` 폴더와 `data` 폴더 안의 `.db` 파일은 제외**하고 올려주세요 (용량이 크고 불필요합니다)
5. 하단에 커밋 메시지 아무거나 입력 후 `Commit changes`

**3-2. Render에 연결하기**

1. [render.com](https://render.com) 접속 → `Get Started` → GitHub 계정으로 가입/로그인 (신용카드 불필요)
2. `New +` → `Web Service` → 방금 만든 `archinexus` 저장소 선택
3. 설정값:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Environment Variables: `.env.example`에 있는 값들을 등록 (`ADMIN_USER`, `ADMIN_PASSWORD`, `BRAND_NAME`, `COMPANY_*`, `SITE_URL`)
4. `Create Web Service` 클릭 → 몇 분 내로 `https://archinexus-xxxx.onrender.com` 같은 실제 주소가 생깁니다.

**이후 업데이트 방법**: 코드가 바뀔 때마다 위 3-1의 `Add file → Upload files`로 바뀐 파일만 다시 올리고 커밋하면, Render가 자동으로 재배포합니다. 로컬에서 압축 풀고 실행할 필요가 없어집니다.
4. Deploy 클릭 → 몇 분 내로 `https://아무이름.onrender.com` 형태의 실제 주소가 생깁니다.

**주의**: Render 무료 티어는 재배포·재시작 시 디스크가 초기화되어 `data/archinexus.db`에 쌓인 데이터가 사라질 수 있습니다. 오늘 당장 데모/테스트용으로 공개하는 데는 문제없지만, 실제 회원 데이터를 쌓기 시작하면 Render의 유료 Persistent Disk를 추가하거나, Supabase(PostgreSQL) 같은 외부 DB로 옮기는 걸 권장합니다. (이 부분은 다음 단계에서 도와드릴 수 있습니다.)

## 3-1. 수수료 모델 (해외 Malt 벤치마킹, 단계형)

`/admin/projects`에서 프로젝트별로 계약금액과 관계유형을 입력하면 예상 수수료가 자동 계산됩니다. 유럽 프리랜서 플랫폼 Malt의 단계형 수수료 구조를 참고해 설계했습니다.

| 관계유형 | 기본 수수료율 | 의도 |
|---|---|---|
| 신규 매칭 | 15% | 플랫폼이 처음 연결한 매칭이라 리스크·노력에 대한 보상 |
| 6개월 이상 지속 | 7% | 관계가 이어질수록 수수료를 낮춰 재계약을 유도 |
| 지인 소개 | 3% | 이미 아는 사이를 데려온 경우 최소 수수료만 부과 |

기본값은 자동 제안되지만 실제 협상 결과에 맞게 직접 수정할 수 있습니다. 관리자 대시보드(`/admin`)에서 "계약완료" 상태의 확정 수수료 합계와, 진행 중인 건의 예상 수수료 합계를 볼 수 있습니다.

## 4. 다음에 추가하면 좋은 것들

- 관리자 계정 다중화 (지금은 단일 관리자 계정)
- 이메일 알림 (신규 등록 시 관리자에게 알림)
- 나라장터 API 연동 스크립트(`narajangter_fetch.py`)에서 수집한 프로젝트를 `/admin/projects`에 자동 등록
- SQLite → PostgreSQL(Supabase) 전환 (실사용자 트래픽이 늘어나면)

## 5. 개인정보 관련 주의

`/admin/vendors/new`로 외부(잡코리아 등)에서 수집한 프로필을 등록할 때는, 반드시 본인에게 개별 동의를 받은 뒤 "개인정보 동의" 체크박스를 표시하세요. 동의 없는 정보를 DB화해 영업에 활용하는 것은 개인정보보호법상 문제가 될 수 있습니다.
