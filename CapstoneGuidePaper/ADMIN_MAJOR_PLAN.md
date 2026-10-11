# Admin Major Plan (MR.DIY Careers)

Kopya nito ay nasa `MrDIY/ADMIN_MAJOR_PLAN.md` din. Kung may babaguhin, baguhin sa dalawa.

Status: **Plano pa lang, wala pang naisusulat na code.**

Layunin: gawing buong HR system ang admin (hindi lang listahan ng applicants), at tiyaking bawat ginagawa sa admin ay may katapat na makikita ng applicant sa app.

---

## 1. Kalagayan ngayon (ano ang meron at ano ang kulang)

| Gawain | Sa app (applicant) | Sa admin (HR) ngayon | Kulang |
|---|---|---|---|
| Mga job | Makikita, hahanapin, i-filter ayon sa lugar | Add / edit / delete, pagination, responsibilities, requirements, benefits | Job type, category, level, bilang ng bakante, deadline, branch, draft/closed, duplicate |
| Mag-apply | One-tap apply | Listahan ng applications, search, filter ayon sa status | Queue, assignment, sorting ayon sa match %, layo |
| Profile | Larawan, skills, experience, education, about | Pangalan, contact, lugar, larawan, resume | Buong profile (education, experience, about), notes, tags |
| Resume | Upload at tingnan | Preview, text na may highlights, match % | Side-by-side na paghahambing ng candidates |
| Status | Under review, Accepted, Rejected | 4 na button (Pending, Reviewed, Approved, Rejected) | Shortlisted, Interview, Hired, On hold; kasaysayan ng bawat pagbabago |
| Interview | Wala | Wala | Buong feature (iskedyul, kumpirmasyon, kalendaryo) |
| Notifications | Bell, tray, email | Nagpapadala lang | Notifications para sa HR mismo |
| Messages | Chat sa HR | Messages page | Template na sagot, link sa application |
| Accounts | Isang account ng applicant | **Isang admin account lang** (`admin`) | Roles, maraming HR at branch managers |
| Analytics | Wala | Dashboard na kaunti ang bilang | Funnel, bawat branch, oras bago ma-hire |

### Mga problemang nakita na kailangang ayusin (hindi lang dagdag na feature)
- **Ang password ng admin ay naka-save at kinukumpara bilang plain text** (`app/api/login/route.ts`). Dapat i-hash ito (bcrypt o scrypt) at palitan ang kasalukuyan.
- Isang admin lang, kaya walang paraan para "magpasa" ng applicant dahil walang tatanggap.
- Walang tala kung **sino** ang nagpalit ng status at kailan (walang audit log).
- Walang limitasyon sa pagsubok mag-login, at ang session ay hindi mapapawalang-bisa.

---

## 2. Ang malalaking pagbabago

### A. Roles at maraming admin account
- **Super Admin:** namamahala ng mga account, branches, settings.
- **HR Officer:** nagsa-screen ng lahat ng applicants; maaaring magpasa sa branch.
- **Branch Manager:** nakakakita lang ng applicants ng sarili niyang branch; nagsasagawa ng interview at nagbibigay ng rekomendasyon.
- Pahina ng **Accounts** (gumawa, i-disable, i-reset ang password) para sa Super Admin.
- Ang bawat API ay susuri ng role (hindi lang kung naka-login).

### B. Pagpapasa ng applicant (hand-off)
Ang tinutukoy mong "magpapasahan." Ito ay mangyayari sa admin, at makikita rin ng applicant ang resulta.

- Bawat application ay may **may-hawak** (`assigned_to`) at **branch**.
- Mga aksyon: **Claim** (kunin), **Assign** (ipasa sa iba), **Return** (ibalik sa HR), at **Escalate** (sa mas mataas), na may **hand-off note**.
- Mga view: **My queue**, **Unassigned**, **All**, **From my branch**.
- **Awtomatikong ruta:** ang application ay napupunta sa branch manager ng branch ng job (ayon sa lokasyon ng job).
- **Proteksyon sa sabay na paggawa:** may nakasulat na "Currently handled by [pangalan]" para hindi magkagulo ang dalawang HR.
- **Kasaysayan:** bawat pasa ay naka-log (sino, kanino, kailan, bakit).
- **Notification para sa tatanggap** (admin bell), at para sa applicant: "Your application is now being handled by MR.DIY Pasig."

### C. Buong pipeline ng status
`Pending → Under Review → Shortlisted → Interview Scheduled → Hired`, at `Rejected` / `On Hold` / `Withdrawn` kahit saan.
- **Board view (kanban)** na may mga column bawat yugto, para madaling i-drag.
- Bawat paglipat ay may kasamang notification, email at tala sa kasaysayan.
- Ang "Approved" ngayon ay magiging **Hired**.

### D. Interview
- I-schedule: petsa, oras, lugar (default ang branch ng job) o online link, notes.
- I-reschedule at i-cancel, bawat isa ay may notification at email.
- **Kumpirmasyon ng applicant** (Confirm / Can't attend) at makikita ng admin ang sagot.
- **Kalendaryo** ng mga paparating na interview sa dashboard.
- Paalala sa applicant isang araw bago.

### E. Applicant 360 (kumpletong view ng applicant)
- Buong profile: about, education, experience, skills, larawan, resume.
- Match % na may paliwanag (Explainable AI) at mga lakas at kulang na skills.
- **Internal notes** (hindi nakikita ng applicant) at **tags**.
- **Paghahambing** ng 2 hanggang 3 applicants sa iisang job.
- Layo ng applicant sa branch.

### F. Jobs
- Job type, category, level, **bilang ng bakante**, **deadline**, **branch**.
- Status: Draft, Published, Closed (awtomatikong Closed kapag puno o lampas na ng deadline).
- **I-duplicate sa ibang branch** (isa sa mga pinaka-tipid sa oras).
- AI Job Description Generator (nasa AI plan).

### G. Analytics at ulat
- Funnel: ilan ang Applied, Shortlisted, Interviewed, Hired.
- Bawat branch, bawat job, pinakamaraming nag-apply, average na match score, average na araw bago ma-hire.
- **Export sa CSV.**

### H. Notifications at mensahe para sa admin
- Bell para sa HR: bagong application, sagot ng applicant, tumanggap ng hand-off, kinumpirma o tinanggihan ang interview.
- **Mga template** ng email at mensahe na maaaring baguhin.

### I. Pre-employment checklist (mula sa AI plan)
Pagkatapos ma-Hire: listahan ng dokumento (SSS, PhilHealth, Pag-IBIG, NBI, medical, TIN, contract) na maa-upload ng applicant at ma-verify ng HR.

### J. Seguridad at audit
- Password hashing, limit sa maling login, session na mapapawalang-bisa.
- **Audit log:** lahat ng mahalagang aksyon (status, hand-off, delete, account).

---

## 3. Ano ang kailangang gayahin sa app ng applicant

| Sa admin | Katapat sa app |
|---|---|
| Buong pipeline | **Timeline ng application** (Submitted → Under Review → Shortlisted → Interview → Hired) sa detalye ng application |
| Hand-off sa branch | Notification at linya sa application: "Handled by MR.DIY Pasig" |
| Interview | **Interview card** (petsa, oras, lugar), pindutang **Confirm** at **Can't attend**, paalala sa tray |
| Hired | Checklist ng dokumento na maa-upload |
| Closed / puno na ang job | "No longer accepting applications" sa job; hindi na pwedeng mag-apply |
| Maraming branch at manager | Pangalan ng branch at contact sa job at application |
| Withdrawn | Pindutang **Withdraw application** sa app |
| Template at mensahe | Chat sa HR (meron na), na may link papunta sa application |
| Bagong job type, category, level, bakante, deadline | Lumalabas sa job card at filter |

---

## 4. Mga bagong table (balangkas)

- `admin_users` (dagdagan): `email`, `role`, `branch_id`, `password_hash`, `is_active`
- `branches`: `id`, `name`, `location`, `manager_id`
- `applications` (dagdagan): `assigned_to`, `branch_id`, `stage`, `stage_changed_at`
- `application_events`: `application_id`, `actor_id`, `type` (status, assign, note, interview…), `detail`, `created_at` (audit at kasaysayan)
- `application_notes`: `application_id`, `author_id`, `body`, `created_at`
- `interviews`: `application_id`, `scheduled_at`, `venue`, `mode`, `notes`, `status`, `applicant_response`
- `admin_alerts`: `admin_id`, `type`, `title`, `message`, `application_id`, `is_read`, `created_at`
- `jobs` (dagdagan): `branch_id`, `openings`, `deadline`
- `email_templates`: `key`, `subject`, `body`
- `pre_employment_requirements` (nasa AI plan)

---

## 5. Pagkakasunod-sunod na mungkahi

| Yugto | Laman | Laki |
|---|---|---|
| 1 | Seguridad (password hash), **Accounts at roles**, branches | M |
| 2 | **Hand-off / assignment** na may queue at kasaysayan, audit log | L |
| 3 | **Pipeline (status) + board view**, timeline sa app | M |
| 4 | **Interview** (admin + app + notification + email) | L |
| 5 | **Applicant 360** (buong profile, notes, XAI, paghahambing) | M |
| 6 | **Jobs** (bakante, deadline, branch, duplicate), AI description | M |
| 7 | **Analytics** at CSV, admin notifications | M |
| 8 | Pre-employment checklist, hiring velocity | M |

Mungkahing **minimum para sa defense:** Yugto 1 hanggang 4, dahil ito ang nagpapakita ng buong daloy: maraming HR, hand-off sa branch, pipeline at interview, na may katapat sa app.

---

## 6. Mga tanong na kailangang sagutin bago magsimula
1. Anong mga role ang gusto mo talaga (HR Officer at Branch Manager lang, o may iba pa)?
2. Sa demo, ilang admin account ang ipapakita (halimbawa 1 HR at 2 branch managers)?
3. Ang branch ba ay ayon sa lokasyon ng job (halimbawa "SM City Taytay")? Gagawa tayo ng listahan ng branches mula sa mga job na meron.
4. Ang "Approved" ba ay papalitan ng "Hired" at idadagdag ang Shortlisted at Interview Scheduled?
5. Dapat bang makita ng applicant kung sinong branch o tao ang humahawak ng application niya?
