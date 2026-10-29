# Product requirements

> Drafted from the repository README and the project handoff. It states what the product is for and what it must do; the owner should correct anything that no longer matches the business.

## Problem

Pushpak Enterprises sells and services appliances under three brands (MakWell, Flyvision, Skevia) from Raichur, Karnataka. Customers need one place to see product information, register a product and get service. Staff, service centers, technicians, dealers and distributors need one system, not one spreadsheet per brand. Head Office needs to see every ticket, every spare and every rupee.

## Users

| User | Needs |
|---|---|
| Customer | Book and track service, register a product, see warranty, confirm a finished job |
| Service center | A queue of routed requests, technicians to assign, spares, correct billing |
| Technician | Today's jobs, closing a job with proof |
| Area Manager | Super Admin control, limited to their own districts |
| Warehouse | Stock, spares, claims, rate card |
| Dealer / distributor | Orders, sales, customers, price lists |
| Super Admin | Everything, with an audit trail and the ability to switch any account off |

## Goals

1. A customer request reaches the right service center without a person touching it.
2. Every ticket has a number, an owner, an SLA and a history.
3. Who pays (company, customer, warranty) is decided by rules, not by memory.
4. Staff can only see and do what their role allows, enforced on the server.
5. The public site is fast, accessible, honest about privacy, and works on a phone.

## Non-goals (for now)

Online payments, a customer mobile app, offline CRM mode, a generic e-commerce cart. Messaging to customers is built but off until the owner enables it.

## Requirements that must always hold

- Access is enforced by `firestore.rules` and `storage.rules`, never only by the page.
- Business logic lives in `functions/` modules that can be unit-tested without Firebase.
- Every change ships with a test; CI must be green before relying on it.
- Personal data collected is the minimum needed and is listed in `privacy.html`.
- WCAG 2.2 AA on every page.

## Success measures

- Share of website requests auto-routed (the rest need manual routing: `routing.status = "manual"`).
- Tickets breaching SLA, per district.
- Time from request to closed job.
- CI green on `main`; go-live gate moves from GO WITH KNOWN ISSUES to GO once owner confirmations are done.

## Open questions for the owner

- Which districts and pincodes launch first, and who covers the rest?
- Turn on customer messaging at launch, or after the first month?
- Make customer confirmation at closing mandatory?
- Custom domain (`makwell.co`) date, and who runs the DNS?
