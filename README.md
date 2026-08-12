# Orders & Settlements

Track customer orders, record payments against them, and always know what is
still owed.

A signed-in user creates orders made of line items, records full or partial
payments, and sees a dashboard of outstanding balances by status. Over-payment
is impossible: the rule is enforced by the database itself, not only by the
application. All money is handled as integer cents; no floating-point arithmetic
touches a monetary value anywhere in the system.

**Live application:** <https://orders-settlements-psi.vercel.app>
**Demo account:** `demo@acme.io` / `password123`
**Health check:** <https://orders-settlements-psi.vercel.app/api/health>

---

## Contents

- [Features](#features)
- [Stack](#stack)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Architecture](#architecture)
- [Data model](#data-model)
- [Index design](#index-design)
- [Business rules](#business-rules)
- [API reference](#api-reference)
- [Concurrency](#concurrency)
- [Idempotency](#idempotency)
- [Security](#security)
- [Testing](#testing)
- [Operations](#operations)
- [Deployment](#deployment)
- [Assumptions and tradeoffs](#assumptions-and-tradeoffs)
- [Limitations and roadmap](#limitations-and-roadmap)

---

## Features

**Orders.** Create an order with a customer, a due date, and one or more line
items. Line-item amounts, the order subtotal, and the total are computed
server-side; client-supplied totals are discarded.

**Payments.** Record full or partial payments with an amount, a date, and an
optional note. An order can carry any number of payments. Payments are
append-only. Nothing in the application edits or deletes one.

**Derived status.** Every order is `pending`, `partially_paid`, `paid`, or
`overdue`. Status is computed on read from the amount paid and the due date, so
an order becomes overdue by the passage of time without any scheduled job.

**Over-payment rejection.** A payment that would exceed the outstanding balance
is rejected with a `422` that carries the exact maximum permitted amount. The UI
turns that into a one-click correction.

**Dashboard.** Summary tiles for order count, invoiced, collected, and
outstanding; status filter chips with live counts; incremental customer search;
sorting and pagination. Every filter lives in the URL, so a filtered view is
shareable and the back button works.

**Order detail.** Line items, totals, a payment form bounded by the live
balance, full payment history, and an activity log of every state transition.

**Audit trail.** Every create, update, delete, and payment writes an event
recording the actor, the timestamp, and the status transition.

**CSV export.** Export the current filtered view, or any due-date range, as a
spreadsheet-safe CSV with formula-injection escaping.

**Health endpoint.** `GET /api/health` pings the database and reports `503` when
it is unreachable.

---

## Stack

| Layer | Choice | Version |
|---|---|---|
| Runtime | Node.js | 24.x |
| Package manager | pnpm | 9.15.0 |
| Language | TypeScript (strict) | 5.9 |
| Framework | Next.js (App Router) | 16.3 |
| UI | React | 19.2 |
| Database | MongoDB | 7 / Atlas |
| Data layer | Mongoose | 9.9 |
| Validation | Zod | 4.4 |
| Auth | bcryptjs + jose (JWT) | 3.0 / 6.2 |
| Styling | Tailwind CSS | 4.3 |
| Tests | Vitest | 4.1 |

Seven runtime dependencies in total. There is no UI kit, no state-management
library, no data-fetching library, no date library, and no HTTP client. Native
`fetch`, controlled inputs, URL-held filter state, and three UTC date helpers
cover it. Every dependency is pure JavaScript, so there is no native module that
can compile differently across platforms.

---

## Quick start

Requires Node 24 and pnpm 9. Docker is optional; any reachable MongoDB works.

```bash
cp .env.example .env           # then edit AUTH_SECRET
docker compose up -d           # MongoDB on :27017
pnpm install
pnpm db:migrate                # 9 indexes + collection validator
pnpm db:seed                   # demo@acme.io / password123, 8 orders
pnpm dev                       # http://localhost:3000
```

Sign in with `demo@acme.io` / `password123`. The seed covers all four statuses
plus the documented edge cases: an order that is past due but fully paid, one
due today, and one partially paid and overdue.

**Without Docker:** skip the `docker compose` line and point `MONGODB_URI` at
any MongoDB instance, local or hosted.

### Commands

| Command | Purpose |
|---|---|
| `pnpm dev` | Development server |
| `pnpm build` / `pnpm start` | Production build and serve |
| `pnpm db:migrate` | Create indexes and collection validators (idempotent) |
| `pnpm db:seed` | Reset and load demo data |
| `pnpm reconcile` | Verify every derived field against its source |
| `pnpm test` | Full test suite |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm docker:up` | Build and run the production container |

---

## Configuration

Two environment variables. Both are validated at first use and throw a named
error rather than failing as `undefined`.

| Variable | Purpose | Example |
|---|---|---|
| `MONGODB_URI` | Connection string | `mongodb://localhost:27017/orders_db` |
| `AUTH_SECRET` | JWT signing key, 32+ random bytes | `openssl rand -base64 32` |

Generate a distinct `AUTH_SECRET` per environment. `.env` is git-ignored;
`.env.example` contains placeholders only.

---

## Architecture

**One codebase, one deployment.** Next.js Route Handlers *are* the REST API, and
the same repository renders the UI. There is no second service to deploy and no
CORS to configure.

**Reads and writes take different paths, deliberately.** Server Components read
by calling the service layer directly, the same functions the API handlers
call. That avoids a pointless HTTP round trip and removes the need for a
client-side cache library. Every mutation goes through the REST API. Business
logic is written once either way.

**The seams are clean.** `src/lib/` and `src/models/` import nothing from Next.
Route handlers parse, authorise, call, and serialise. Nothing more. Extracting
the API into its own service would be a deployment change, not a rewrite.

```
src/
├─ models/       Mongoose schemas: User, Order, AuditEvent, IdempotencyKey, Counter
├─ lib/          Business logic: orders, payments, status, money, dates,
│                validation, auth, audit, idempotency, csv, http, log, db
├─ components/   UI: dashboard, tables, forms, badges
└─ app/
   ├─ api/       13 REST endpoints
   └─ (pages)    login, dashboard, order detail, order create/edit
scripts/         migrate, seed, reconcile
tests/           unit and integration suites
```

---

## Data model

Five collections. No joins anywhere in the application.

```
users            { _id, email↑, passwordHash, createdAt }

orders           { _id, number↑, userId, customer, customerLower, dueDate,
                   totalCents, paidCents, balanceCents, fullyPaid, hasPayments,
                   lineItems: [ { _id, description, quantity,
                                  unitPriceCents, amountCents } ],
                   payments:  [ { _id, amountCents, paidOn, note, createdAt } ],
                   createdAt, updatedAt }

auditevents      { _id, orderId, userId, type, fromStatus, toStatus, data, createdAt }
idempotencykeys  { _id: "userId:key", userId, requestHash, response, createdAt }  TTL 24h
counters         { _id: "orderNumber", seq }
```

### Why line items and payments are embedded

Both arrays are read only in the context of their parent order, and there is no
cross-order payments view, so there is nothing to join. Both are bounded: line
items are capped at 100 by validation, and payments on a single order are
realistically dozens. A 100-line, 500-payment order is roughly 50 KB against a
16 MB document ceiling.

Most importantly, embedding payments is what makes recording one a **single
atomic document update**. The over-payment guard lives in the query filter, so
MongoDB evaluates it server-side at write time. There is no read-then-write
window to race, no transaction, and no retry loop.

### Why the other three are separate

`auditevents` is append-only and unbounded, the classic reason not to embed. It
deliberately holds no populated reference, so events outlive the order they
describe. `idempotencykeys` needs a TTL index, which only works on a top-level
document field. `counters` is a single shared document unrelated to any one
order.

**What would change the decision:** payments becoming genuinely unbounded, or a
requirement to query payments across orders (a settlements report, cash-flow
forecasting). Payments would then move to their own collection indexed
`{ userId: 1, paidOn: -1 }`, and recording one would become a two-document
transaction on a replica set.

### Denormalised fields

`paidCents`, `balanceCents`, `fullyPaid`, and `hasPayments` are stored rather
than computed at query time, so status filtering and pagination run in the
database instead of in application memory. They are maintained inside the same
atomic write as the amounts, and a collection validator rejects any document
where they disagree with their sources, so they cannot drift.

### Database-enforced invariants

Mongoose validation only protects writes that go through Mongoose. A `$expr`
collection validator on `orders` protects the collection itself:

| Rule | Guarantee |
|---|---|
| `totalCents ≥ 1` | No zero-value orders |
| `paidCents ≥ 0` | No negative payment totals |
| `paidCents ≤ totalCents` | **Over-payment is structurally impossible** |
| `balanceCents = totalCents − paidCents` | The balance can never be stale |
| `fullyPaid ⇔ paidCents = totalCents` | The status index cannot lie |
| `hasPayments ⇔ payments.length > 0` | The status index cannot lie |

---

## Index design

Nine indexes, created explicitly by `pnpm db:migrate`. Mongoose `autoIndex` is
disabled: auto-indexing hides index design and issues DDL on every cold start.

| # | Collection | Index | Serves |
|---|---|---|---|
| 1 | `users` | `{ email: 1 }` **unique** | Login and signup; also the one-account-per-email constraint |
| 2 | `orders` | `{ userId: 1, createdAt: -1 }` | Default dashboard list |
| 3 | `orders` | `{ userId: 1, fullyPaid: 1, dueDate: 1, hasPayments: 1 }` | All four status filters |
| 4 | `orders` | `{ userId: 1, dueDate: 1 }` | Due-date sort, CSV date-range export |
| 5 | `orders` | `{ userId: 1, customerLower: 1 }` | Customer prefix search and sort |
| 6 | `orders` | `{ number: 1 }` **unique** | Reference lookup; guarantees the sequence never collides |
| 7 | `auditevents` | `{ orderId: 1, createdAt: -1 }` | Order activity panel |
| 8 | `auditevents` | `{ userId: 1, createdAt: -1 }` | Account-wide activity |
| 9 | `idempotencykeys` | `{ createdAt: 1 }` **TTL 86400** | Self-cleaning dedupe store |

### Why index 3 is ordered that way

The four status filters resolve to:

```
paid            { userId, fullyPaid: true }
overdue         { userId, fullyPaid: false, dueDate: { $lt:  today } }
partially_paid  { userId, fullyPaid: false, dueDate: { $gte: today }, hasPayments: true  }
pending         { userId, fullyPaid: false, dueDate: { $gte: today }, hasPayments: false }
```

Textbook **ESR**. Two equality fields, `userId` and `fullyPaid`, form the index
prefix and give exact bounds. Then one range field, `dueDate`. Then
`hasPayments` as a trailing in-index filter that requires no document fetch.
`paid` is answered by the two-field prefix alone.

This is precisely why `fullyPaid` and `hasPayments` exist as stored booleans: a
range predicate on `paidCents` would break the ESR ordering and force a scan.

Index 4 exists because index 3 cannot serve a due-date range on its own:
`fullyPaid` sits between `userId` and `dueDate`, so `dueDate` cannot act as a
range bound while `fullyPaid` is unconstrained.

### Known limits

**Status filter combined with a `createdAt` sort.** MongoDB picks one index and
performs a blocking in-memory sort. Comfortable at this scale and well inside
the 32 MB sort limit. The production fix is a compound index per (filter, sort)
pair, or defaulting the sort to the filter's own leading range field.

**Search is prefix-only.** An unanchored case-insensitive regex cannot use an
index. Customer search is therefore an anchored prefix match on a stored
lower-cased field, `{ customerLower: { $regex: '^' + escaped } }`, which is
index-eligible. Searching `corp` will not find `Acme Corp`. True substring
search requires Atlas Search with an autocomplete analyzer.

---

## Business rules

### Status derivation

Precedence, top wins:

| Status | Condition |
|---|---|
| `paid` | Fully paid, regardless of due date |
| `overdue` | Not fully paid **and** the due date is strictly in the past |
| `partially_paid` | Some payment recorded, not yet due |
| `pending` | No payment, not yet due |

The four branches are mutually exclusive and exhaustive, which is what makes the
dashboard's status counts sum to the total order count. A single pure function
derives status for display, and a matching filter builder expresses the same
four rules as MongoDB queries; a test asserts the two stay in lockstep against
real data.

### Documented edge cases

- **Overdue but now fully paid → `paid`.** Payment settles the obligation; an
  order that is square is not delinquent.
- **The due date is inclusive.** An order due today is not overdue until
  tomorrow. All date-only values are UTC.
- **Partially paid and past due → `overdue`.** Being past due is what needs
  surfacing; payment progress remains visible in the amount-due column.
- **Zero-total orders are rejected.** Otherwise `paidCents >= totalCents` would
  report `paid` for an order nobody paid.
- **An order may be created already overdue.** A back-dated due date is allowed
  and the order is born `overdue`.
- **Payments may be back-dated but never future-dated.** Real payments get
  entered late; a payment dated tomorrow is a data-entry error.
- **Status is never stored.** It changes with the passage of time, so a stored
  column would need a scheduled job to stay honest.

### Editability after the first payment

| Field | Before any payment | After a payment |
|---|---|---|
| `customer` | Editable | Editable |
| `dueDate` | Editable | Editable |
| `lineItems` | Editable | **Locked** (`409 ORDER_LOCKED`) |
| Delete order | Allowed | **Blocked** (`409 ORDER_LOCKED`) |

Correcting a typo or renegotiating terms must not require destroying a paid
order, so the customer and due date stay open. Line items lock because changing
the total underneath a recorded payment can silently create an over-payment or
resurrect a settled order. The looser alternative, permitting edits as long as
the new total still covers what has been paid, was considered and rejected: it
adds edge cases for very little user value.

The check is not a preceding read. `hasPayments: false` sits in the update
filter, so the precondition and the write are one atomic operation.

### Money and dates

Money is an integer count of **cents**, single currency USD. JavaScript's
`Number` is a double, exact for integers up to 2^53, roughly $90 trillion, so
there is no precision risk and no need for `Decimal128`. Division by 100 happens
only at the moment of display.

Date-only values are stored as `Date` at UTC midnight and always cross the wire
as `"YYYY-MM-DD"`. A date carrying a time never reaches the API surface.

Input caps: unit price ≤ $1,000,000, quantity ≤ 1,000,000, line items ≤ 100 per
order.

---

## API reference

Base path `/api`. JSON in, JSON out. All money is integer cents. All date-only
values are `"YYYY-MM-DD"` in UTC. Every route except the auth and health
endpoints requires the `session` cookie.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/auth/signup` | Create an account and start a session |
| `POST` | `/api/auth/login` | Start a session |
| `POST` | `/api/auth/logout` | Clear the session cookie |
| `GET` | `/api/auth/me` | Current user |
| `POST` | `/api/orders` | Create an order with line items |
| `GET` | `/api/orders` | List: filter, search, sort, paginate, summarise |
| `GET` | `/api/orders/:id` | One order with line items, payments, activity |
| `PATCH` | `/api/orders/:id` | Update customer, due date, or line items |
| `DELETE` | `/api/orders/:id` | Delete (only when no payments exist) |
| `POST` | `/api/orders/:id/payments` | Record a payment |
| `GET` | `/api/orders/:id/payments` | Payment history |
| `GET` | `/api/orders/export` | CSV for a due-date range |
| `GET` | `/api/health` | Liveness and database ping |

### List query parameters

`status`, `q`, `dueFrom`, `dueTo`, `sort`, `dir`, `page`, `pageSize`.

The response `summary` respects `q`, `dueFrom`, and `dueTo` but deliberately
ignores `status`, so the filter chips show stable counts while a filter is
active. Filtering, sorting, and pagination all execute in MongoDB. A page beyond
the last returns an empty array, not a `404`.

### Error format

Every error in the application shares one shape:

```jsonc
{ "error": { "code": "…", "message": "…", "details": { … }, "hint": "…" } }
```

| Code | HTTP | When |
|---|---|---|
| `VALIDATION_ERROR` | 422 | The body or query failed validation |
| `UNAUTHENTICATED` | 401 | Missing or invalid session cookie |
| `NOT_FOUND` | 404 | No such resource, or it belongs to someone else |
| `EMAIL_TAKEN` | 409 | Signup with an existing email |
| `INVALID_CREDENTIALS` | 401 | Wrong email or password |
| `ORDER_LOCKED` | 409 | Editing line items or deleting an order that has payments |
| `OVERPAYMENT` | 422 | The amount exceeds the remaining balance |
| `IDEMPOTENCY_KEY_REUSED` | 422 | Same key, different payload |
| `IDEMPOTENCY_IN_PROGRESS` | 409 | Same key, still in flight |
| `INTERNAL_ERROR` | 500 | Anything unhandled |

Validation failures return path-keyed field errors, so a client can map them
straight back onto inputs:

```jsonc
{ "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request body is invalid.",
    "details": { "fieldErrors": { "lineItems.0.quantity": ["Quantity must be at least 1"] } },
    "hint": "Correct the listed fields and resubmit." } }
```

The over-payment response carries everything a client needs to correct itself
without a second request:

```jsonc
{ "error": {
    "code": "OVERPAYMENT",
    "message": "Payment of $700.00 exceeds the $600.00 still due on this order.",
    "details": { "orderTotalCents": 100000, "paidCents": 40000, "maxAllowedCents": 60000 },
    "hint": "Enter $600.00 or less." } }
```

Every response carries an `x-request-id` header that also appears in the
structured logs, so a user-reported failure traces to exactly one log line.

### Worked example

```bash
BASE=http://localhost:3000/api
J="-H content-type:application/json -c /tmp/c -b /tmp/c"

# Account
curl -s $J -X POST $BASE/auth/signup -d '{"email":"demo@acme.io","password":"password123"}'

# Order: 2 × $500 = $1,000, due in seven days
curl -s $J -X POST $BASE/orders -d '{
  "customer":"Acme Corp","dueDate":"'"$(date -u -d '+7 days' +%F)"'",
  "lineItems":[{"description":"Consulting hours","quantity":2,"unitPriceCents":50000}]}'
# 201: status "pending", totalCents 100000, balanceCents 100000

ID=<order id from the response>

curl -s $J -X POST $BASE/orders/$ID/payments -d '{"amountCents":40000,"note":"Wire 8891"}'
# 201: status "partially_paid", balanceCents 60000

curl -s $J -X POST $BASE/orders/$ID/payments -d '{"amountCents":60000}'
# 201: status "paid", balanceCents 0

curl -s $J -X POST $BASE/orders/$ID/payments -d '{"amountCents":100}'
# 422 OVERPAYMENT, maxAllowedCents 0
```

On macOS or BSD, use `date -u -v+7d +%F` for the due date.

---

## Concurrency

Recording a payment is a **single atomic MongoDB document update**. The
over-payment check is not a separate read. It is an `$expr` guard inside the
update's filter, so the server evaluates it against the live document at the
moment of the write, under that document's write lock.

Two payments submitted simultaneously against the same order therefore produce
exactly one `201` and one `422 OVERPAYMENT`. There is no interleaving in which
both succeed. No transaction, no lock escalation, no retry loop, and orders
never contend with one another.

The collection validator enforces `paidCents ≤ totalCents` independently, so
even a write that bypassed the application entirely could not break the
invariant. `tests/concurrency.int.test.ts` fires two concurrent payments and
asserts the outcome.

The same guard-in-filter pattern is used consistently: payments, the order lock,
and delete all place their precondition in the query filter, then perform a
single cheap read on the null path to produce the correct error.

---

## Idempotency

`POST /api/orders/:id/payments` accepts an optional `Idempotency-Key` header. A
retry with the same key and the same body returns `200` with the identical
stored payload and an `idempotency-replayed: true` header. No second payment is
recorded.

The lifecycle is reserve, then commit or release:

1. **Reserve.** Insert a key document scoped `userId:key`, holding a SHA-256
   hash of the request payload. The insert winning the race is what claims the
   slot; a duplicate-key error means someone else got there first.
2. **Commit.** On success, store the response body against the key so a later
   retry can replay it verbatim.
3. **Release.** On a business failure such as over-payment, delete the key so
   the client can legitimately retry with corrected input.

A second request with the same key but a different payload is rejected with
`422 IDEMPOTENCY_KEY_REUSED`. A second request arriving while the first is still
in flight gets `409 IDEMPOTENCY_IN_PROGRESS`. Keys expire after 24 hours via a
TTL index, so the store cleans itself.

Keys are scoped per user, so they cannot collide or leak across accounts.

The web client generates a key per submit attempt and reuses it across retries
of that attempt, so a double-click or a flaky connection cannot double-charge.
This is the same pattern that would apply to webhook ingestion from a
third-party payment processor.

---

## Security

**Authentication.** Email and password, hashed with bcrypt at cost 10. Sessions
are JWTs signed with HS256 and delivered in an `httpOnly`, `sameSite=lax`,
`secure`-in-production cookie with a seven-day lifetime.

**Account enumeration.** Login returns the same `INVALID_CREDENTIALS` error for
an unknown email and a wrong password.

**Tenant isolation.** Every query against `orders` carries `userId`, without
exception. A request for another user's order returns `404`, never `403`, so the
API cannot be used to probe for resource existence.

**Input validation.** Every request body and query string is parsed by a Zod
schema at the boundary. Server-computed fields (totals, balances, order
numbers, status flags) are stripped from client input and recomputed.

**Injection.** Customer search input is regex-escaped before being used in a
prefix match. CSV export quotes any field containing a delimiter and prefixes a
single quote to values beginning with `=`, `+`, `-`, or `@`, defeating formula
injection when the file is opened in a spreadsheet.

**Logging.** Structured JSON to stdout, carrying method, path, status, duration,
request id, and acting user id. Request bodies, passwords, session cookies, and
payment amounts are never logged.

**Secrets.** No secret is committed. `.env` is git-ignored and `.env.example`
holds placeholders only. `AUTH_SECRET` is generated per environment; local and
production never share one.

**Least privilege.** The database user is scoped to `readWrite` on a single
database, not `atlasAdmin` and not `readWriteAnyDatabase`.

**Container.** The production image runs as a non-root user and ships only the
standalone server output.

**Known gap.** On MongoDB Atlas M0, private networking is unavailable and
serverless egress addresses are not static, so the network allowlist must be
open. This is mitigated by a long random SCRAM password, TLS in transit, and the
scoped database user above. The production answer is a paid tier with private
endpoints and a fixed egress address.

---

## Testing

```bash
pnpm test
```

Unit tests always run. Integration tests skip themselves when `MONGODB_URI` is
unset, so the suite is green on a machine with no database. Integration tests
import route handlers directly and invoke them with a `NextRequest`. No dev
server and no HTTP layer in the way.

| Suite | Covers |
|---|---|
| `money.test.ts` | Parsing and formatting; rejects `1.234` and non-numeric input |
| `dates.test.ts` | UTC boundaries; rejects impossible dates such as `2026-02-30` |
| `status.test.ts` | Table-driven across all four statuses and every documented edge case |
| `totals.test.ts` | Line-item arithmetic, including a 100-line order |
| `api.int.test.ts` | Full payment scenario, tenant isolation, order locking, status-filter parity, idempotency, validation |
| `concurrency.int.test.ts` | Two simultaneous payments produce one `201` and one `422` |

Two cases are worth calling out. **Status-filter parity** seeds one order per
status and asserts that the API returns exactly the expected order for each
filter, and that the four status counts sum to the total. This is the guard
against the display logic and the query logic drifting apart. **Tenant
isolation** checks that a second user receives `404` on read, update, delete,
and payment against the first user's order, and that a malformed object id
returns `404` rather than a `500`.

---

## Operations

**Health.** `GET /api/health` runs an actual database ping and returns `503`
when Mongo is unreachable, so it reports the datastore rather than merely the
process. Point an external uptime monitor at it.

```jsonc
{ "ok": true, "db": "up", "version": "0.1.0", "uptimeSec": 412 }
```

**Logs.** Structured JSON to stdout, one line per request, each carrying a
request id that is also returned in the `x-request-id` response header. The
format is drain-agnostic and forwards to any log aggregator unchanged.

**Reconciliation.** `pnpm reconcile` re-derives every stored total from its
source (line-item amounts against quantity × unit price, order totals against
their line items, paid amounts against the payment array, balances against total
minus paid) and exits non-zero on any drift. It runs in CI after the test
suite, and would run on a schedule in production.

**Backups.** Atlas M0 offers limited backup. The production posture is a paid
tier with continuous backups and point-in-time restore, plus a scheduled
`mongodump` to object storage with lifecycle rules for an off-provider copy.

**Migrations.** `pnpm db:migrate` is idempotent and is run deliberately, not as
a build step. Index and validator changes are operations, not deploy side
effects.

---

## Deployment

The application deploys as a single unit: UI and API in one build behind one
URL.

**Database.** Create a MongoDB Atlas cluster in the region nearest your users.
Create a database user scoped `readWrite` to one database. Run the migration and
seed once from a workstation:

```bash
MONGODB_URI="<atlas-srv-string>" pnpm db:migrate
MONGODB_URI="<atlas-srv-string>" pnpm db:seed
```

**Application.** Import the repository into Vercel; Next.js is detected
automatically. Set `MONGODB_URI` and `AUTH_SECRET` for both Production and
Preview environments, and set the Node version to 24. Pushes to `main` deploy to
production and every pull request receives its own preview URL.

**Serverless notes.** The Mongoose connection is cached on `globalThis`, so each
warm function instance reuses one pool rather than opening a new one per
invocation. Pool size is capped at 10 per instance. No route uses the Edge
runtime, because bcryptjs and Mongoose both require Node.

### Container

A multi-stage Dockerfile builds a non-root production image, used to verify
portability rather than as the primary deploy path:

```bash
docker compose up -d mongo
pnpm db:migrate && pnpm db:seed
pnpm docker:up
curl -s localhost:3000/api/health
```

The runtime stage ships only the standalone server, so it contains no scripts
and cannot run migrations. Those run from a workstation or a pipeline against
the same database, which is where schema operations belong.

### Continuous integration

GitHub Actions runs on every push and pull request against a MongoDB service
container: install with a frozen lockfile, migrate, typecheck, test, build, and
reconcile. A drifted lockfile fails the build rather than silently resolving
something new.

---

## Assumptions and tradeoffs

**One currency, one user per account.** Amounts are USD and the symbol is not
stored, because nothing in the brief implies a second currency. Adding one means
a `Money` value object carrying an explicit currency, not a column. There are no
organisations, teams, or roles: a user owns their orders and nobody else's.

**Money is an integer count of cents held in a `Number`.** A double represents
integers exactly up to 2^53, roughly ninety trillion dollars, so there is no
precision risk at any plausible scale and no need for `Decimal128`. Division by
100 happens only when formatting for display, never before arithmetic.

**Four fields are denormalised** — `paidCents`, `balanceCents`, `fullyPaid`, and
`hasPayments`. They exist so status filtering, sorting, and pagination run inside
MongoDB rather than in application memory. The cost is that they could disagree
with the payments array; that is prevented by writing them in the same atomic
update as the payment *and* by a collection validator that rejects any document
where they disagree. See [Concurrency](#concurrency).

**Status is derived on read, never stored.** An order becomes overdue through the
passage of time alone, with no write to trigger it, so a stored column would need
a scheduled job merely to stay honest.

**Reads bypass the HTTP layer.** Server Components call the service layer
directly; every mutation goes through the REST API. The same logic serves both,
so there is no duplication — this avoids a pointless network round trip to the
process already handling the request, and removes the need for a client-side
cache library. The API is fully implemented and integration-tested regardless.

**Line items lock after the first payment**, while customer and due date stay
editable. Changing the total underneath a recorded payment can silently create
an over-payment or resurrect a settled order. The looser alternative — permit
edits while the new total stays at or above `paidCents` — was considered and
rejected as more edge cases for little practical gain.

**Bcrypt runs at cost 10**, chosen against a serverless cold-start budget rather
than a dedicated server's.

**Dates are date-only and UTC.** A due date is a calendar day, not an instant, so
no timezone is stored. A reader in a different timezone sees the same due date
that was entered.

## Limitations and roadmap

**Not built, by decision.** Multi-currency, tax and discounts, organisations and
roles, email notifications, refunds, and real-time updates are all out of scope.

**Refunds** are designed but not implemented. The shape: add
`kind: "payment" | "refund"` to the payment subdocument, permit a negative
`amountCents` for refunds, widen the atomic guard from `paidCents + amount ≤
totalCents` to `0 ≤ paidCents + amount ≤ totalCents`, which the existing
`$expr` filter already expresses, and cap a refund at the amount paid. Status
derivation needs no change, because it already reads `paidCents`.

**Rate limiting** is absent. In-memory limiting is per-instance and therefore
misleading on serverless; the correct answer is throttling at the edge or an API
gateway.

**Sessions cannot be revoked.** JWTs are stateless, so a stolen cookie remains
valid until it expires. A session store or a short-lived access token with
refresh would fix this.

**Audit writes are best-effort.** A failed audit write is logged but never fails
a committed financial write. This is acceptable here because payments are
embedded in the order document: the order *is* the payment ledger, and every
payment with its amount, date, note, and timestamp is immutable and complete
even if an audit event is lost. The audit collection adds who-did-what-when on
top. A production ledger would guarantee it with a change stream on `orders` or
a transactional outbox, both of which need a worker process.

**Search is prefix-only**, as described under [Index design](#index-design).
Atlas Search with an autocomplete analyzer would fix it and simultaneously
collapse the query to a single index-backed lookup. The dashboard search box
debounces at 350ms and does not query below two characters, since a
single-character prefix matches nearly every order, which is both the most expensive
query and the least useful result.

**Next steps in priority order.** Refunds; organisation and team scoping with
roles; rate limiting at the edge; audit via change stream; a compound index per
(filter, sort) pair; cursor-based pagination; Atlas Search; an OpenAPI
specification with a generated client; end-to-end tests against a preview
deployment.
