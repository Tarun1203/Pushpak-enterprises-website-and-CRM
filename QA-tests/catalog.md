# QA catalog — Pushpak Enterprises website & CRM

Generated 2026-10-12T06:34:51.664Z · 19 routes · 68 tasks · dev URL http://localhost:8080

> **Safe-run rule:** every page hardcodes the live `makwell-websiteandcrm` Firebase project. Tasks must run with the Firebase stub (`tests/e2e/support/firebase-stub.js`) or a locally patched emulator build, and abort if any request reaches `firestore.googleapis.com`.

| Path | Auth | Roles | Tasks |
|---|---|---|---|
| `/404.html` | no | anonymous | T190-404-smoke |
| `/cookies.html` | no | anonymous | T200-cookies-smoke |
| `/crm/bug-tracker.html` | no | anonymous | T130-crm-bug-tracker-smoke |
| `/crm/CRMareamanager.html` | yes | anonymous, areamanager | T110-crm-areamanager-auth-guard<br>T111-crm-areamanager-login-routing-gap<br>T112-crm-areamanager-nav-sweep |
| `/crm/CRMdealer.html` | yes | dealer | T090-crm-crmdealer-access-guard<br>T091-crm-crmdealer-nav-sweep-as-dealer<br>T092-crm-crmdealer-place-trade-order-as-dealer<br>T093-crm-crmdealer-account-invoices-as-dealer |
| `/crm/CRMdistributor.html` | yes | distributor | T100-crm-distributor-access-guard<br>T101-crm-distributor-nav-sweep<br>T102-crm-distributor-place-order-to-head-office<br>T103-crm-distributor-incoming-dealer-orders |
| `/crm/CRMservicecenter.html` | yes | servicecenter | T060-crm-servicecenter-access-guard<br>T061-crm-servicecenter-nav-sweep<br>T062-crm-servicecenter-request-lifecycle<br>T063-crm-servicecenter-spare-requests-head-office<br>T064-crm-servicecenter-service-billing<br>T065-crm-servicecenter-destructive-cancel-and-defect-batch<br>T066-crm-servicecenter-inventory-dispatch-sendback<br>T067-crm-servicecenter-technicians-and-claims-forms<br>T068-crm-servicecenter-ratecard-and-profile |
| `/crm/CRMsuperadmin.html` | yes | superadmin | T050-crm-superadmin-auth-guard<br>T051-crm-superadmin-nav-sweep<br>T052-crm-superadmin-create-account-center-technician<br>T053-crm-superadmin-approvals-and-role-change<br>T054-crm-superadmin-destructive-suspend-technician<br>T055-crm-superadmin-service-ticket-routing<br>T056-crm-superadmin-pincode-sla-coverage<br>T057-crm-superadmin-catalog-category-product-warranty |
| `/crm/CRMtechnician.html` | yes | technician | T080-crm-technician-guard-and-session<br>T081-crm-technician-nav-availability-profile<br>T082-crm-technician-log-job<br>T083-crm-technician-job-lifecycle |
| `/crm/CRMwarehouse.html` | yes | anonymous, warehouse | T070-crm-warehouse-auth-guard<br>T071-crm-warehouse-nav-sweep-as-warehouse<br>T072-crm-warehouse-dashboard-as-warehouse<br>T073-crm-warehouse-fulfil-spare-request-as-warehouse<br>T074-crm-warehouse-stock-adjustments-as-warehouse<br>T075-crm-warehouse-new-spare-request-modal<br>T076-crm-warehouse-destructive-withdraw-and-reassign<br>T078-crm-warehouse-local-purchase-returns-claims |
| `/crm/index.html` | no | anonymous | T180-crm-index-smoke |
| `/crm/login.html` | no | anonymous | T020-crm-login-role-redirects<br>T021-crm-login-form-validation<br>T022-crm-login-account-guards<br>T023-crm-login-session-and-deactivated-param<br>T024-crm-login-forgot-password-and-links |
| `/flyvision/index.html` | no | anonymous | T150-flyvision-index-smoke |
| `/index.html` | no | anonymous | T010-index-register-product<br>T011-index-book-service<br>T012-index-enquiry-modal<br>T013-index-track-and-warranty<br>T014-index-service-locator<br>T015-index-page-render-and-navigation |
| `/makwell/index.html` | no | anonymous | T140-makwell-index-smoke |
| `/portal.html` | yes | anonymous, customer | T030-portal-auth-guards<br>T031-portal-signin-dashboard-as-customer<br>T032-portal-register-product-as-customer<br>T033-portal-register-product-validation<br>T034-portal-book-service-as-customer<br>T035-portal-support-and-history-as-customer |
| `/skevia/index.html` | no | anonymous | T160-skevia-index-smoke |
| `/warranty/index.html` | no | anonymous | T170-warranty-index-smoke |
| `/warranty/verify.html` | no | anonymous | T040-warranty-verify-valid-token-per-brand<br>T041-warranty-verify-token-states-and-tampering<br>T042-warranty-verify-param-injection-safety |
