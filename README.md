MAKWELL.CO — MASTER WEBSITE & CRM SITE PLAN
Business Architecture
Company: PUSHPAK ENTERPRISES  
Primary Domain: `makwell.co`
Brands
MakWell — Primary Brand
Flyvision
Skevia
The platform is one multi-brand system. The public website uses one domain with separate brand experiences. The CRM is centralized under Pushpak Enterprises.
```text
PUSHPAK ENTERPRISES
        |
   MULTI-BRAND PLATFORM
        |
  +-----+---------+-----+
  |               |     |
MAKWELL        FLYVISION SKEVIA
Primary          Brand    Brand
  |               |       |
  +---------------+-------+
          |
    ONE CUSTOMER WEBSITE
          |
    ONE CENTRAL CRM
```
1. Public Website — `makwell.co`
```text
makwell.co
|
+-- Main Landing Page
|
+-- MakWell
|   +-- Home
|   +-- Products
|   +-- About
|   +-- Contact Us
|
+-- Flyvision
|   +-- Home
|   +-- Products
|   +-- About
|   +-- Contact Us
|
+-- Skevia
|   +-- Home
|   +-- Products
|   +-- About
|   +-- Contact Us
|
+-- Customer Services
|   +-- Register Product
|   +-- Book Service
|   +-- Track Service
|   +-- Warranty
|   +-- Support
|
+-- Dealer
|   +-- Become a Dealer
|
+-- Legal
|   +-- Privacy Policy
|   +-- Terms & Conditions
|   +-- Warranty Policy
|   +-- Service Policy
|
+-- CRM Login
```
2. Main Landing Page
Purpose: brand-selection gateway.
Sections:
Header
Hero
Our Brands
About Pushpak Enterprises
Why Choose Us
Customer Services
Footer
Suggested hero:
> One Company. Three Brands. One Commitment.
Our Brands:
MakWell
Flyvision
Skevia
Customer quick actions:
Register Product
Book Service
Track Service
Warranty
Support
3. Individual Brand Websites
MakWell
```text
makwell.co/makwell/
|
+-- Home
+-- Products
+-- About
+-- Contact Us
+-- Service
+-- Support
+-- Register Product
+-- Book Service
+-- Track Service
```
Flyvision
```text
makwell.co/flyvision/
|
+-- Home
+-- Products
+-- About
+-- Contact Us
+-- Service
+-- Support
+-- Register Product
+-- Book Service
+-- Track Service
```
Skevia
```text
makwell.co/skevia/
|
+-- Home
+-- Products
+-- About
+-- Contact Us
+-- Service
+-- Support
+-- Register Product
+-- Book Service
+-- Track Service
```
Each brand website must display only its own products, models, media and brand content.
4. Brand Home Page
Each brand home page can contain:
Hero Banner
Featured Products
Product Categories
Brand Highlights
Why Choose the Brand
Warranty & Service
Product Registration CTA
Service CTA
Dealer CTA
Footer
Brand logo, colors, banners, content and products are brand-specific.
5. Product Architecture
Products are database-driven. Categories must never be hard-coded into the frontend.
```text
Brand
  |
Category
  |
Subcategory (Optional)
  |
Product
  |
Model / SKU
  |
Dynamic Attributes
  |
Serial Number
```
Example:
```text
MakWell
  |
Television
  |
Smart TV
  |
43" Smart LED TV
  |
MW43-X
```
6. Dynamic Category Management
Categories are created and managed from the CRM backend.
```text
Product Management
|
+-- Categories
|   +-- All Categories
|   +-- Add Category
|   +-- Active
|   +-- Inactive
|   +-- Category History
|
+-- Products
+-- Models / SKUs
+-- Dynamic Attributes
+-- Product Media
+-- Product Documents
```
Category fields:
Category Name
Category Code
Brand
Description
Image
Icon
Display Order
Status
Adding a category in the backend automatically makes it available on the correct brand website.
7. Brand Isolation
```text
PUSHPAK ENTERPRISES
|
+-- MAKWELL
|   +-- Products
|   +-- Models
|   +-- Serials
|   +-- Warranty
|   +-- Service
|   +-- Spares
|
+-- FLYVISION
|   +-- Products
|   +-- Models
|   +-- Serials
|   +-- Warranty
|   +-- Service
|   +-- Spares
|
+-- SKEVIA
    +-- Products
    +-- Models
    +-- Serials
    +-- Warranty
    +-- Service
    +-- Spares
```
Rules:
MakWell website -> MakWell products only.
Flyvision website -> Flyvision products only.
Skevia website -> Skevia products only.
Super Admin CRM -> all brands with filtering.
Warehouse -> all operational brands, with brand-separated stock.
Service Centers -> multiple authorized brands.
Technicians -> only authorized brands/categories.
8. Product Listing & Details
Product cards show:
Brand
Product Image
Product Name
Model
Key Features
View Product
Product details:
Brand
Product Name
Model
Images
Videos
Features
Specifications
Warranty
What's Included
Compatible Accessories
Manual
Brochure
Register Product
Book Service
All content comes from the database.
9. Dynamic Product Attributes
Attributes are configurable from the CRM.
Television examples:
Screen Size
Resolution
Display Type
Operating System
RAM
Storage
Speaker Output
HDMI
USB
Wi-Fi
Washing Machine examples:
Capacity
Motor Type
Wash Programs
Spin Speed
Motor Warranty
Body Material
Energy Rating
10. Customer Product Registration
```text
Register Product
      |
Mobile / Email
      |
Product
      |
Brand automatically identified
      |
Model
      |
Serial Number
      |
Purchase Date
      |
Dealer
      |
Purchase Invoice
      |
Submit
```
11. Book Service
```text
Book Service
|
+-- Mobile Number
+-- Brand / Auto Identification
+-- Product
+-- Model
+-- Serial Number
+-- Problem
+-- Address
+-- Preferred Date
+-- Photos / Video
```
Flow:
```text
Public Website
      |
Firebase
      |
Service Request
      |
Routing Engine
      |
Service Center
      |
Technician
```
12. Track Service
Customer can search by:
Request Number
Mobile Number
Example:
```text
Request: PE-KA-SR-260909-0001
Brand: MAKWELL
Product: Washing Machine
Status: Technician Assigned
```
13. Warranty
Common customer page, but warranty data is brand-specific.
```text
Serial
  |
Product
  |
Model
  |
Brand
  |
Warranty Plan
```
14. Support
```text
Support
|
+-- Product Registration
+-- Book Service
+-- Track Service
+-- Warranty
+-- Manuals
+-- Brochures
+-- FAQs
+-- Contact Support
```
15. Dealer
```text
Become a Dealer
|
+-- Business Name
+-- Contact Person
+-- Mobile
+-- Email
+-- Address
+-- State
+-- District
+-- PIN
+-- Business Type
+-- Existing Brands
+-- Product Categories
+-- Submit Application
```
Flow:
```text
Website Lead
  |
CRM
  |
Dealer Approval
  |
Dealer Account
```
16. CRM — Pushpak Enterprises
```text
PUSHPAK ENTERPRISES CRM
|
+-- Dashboard
+-- Customers
+-- Brands
+-- Product Management
+-- Serial & Registration
+-- Warranty
+-- Dealers
+-- Service
+-- Service Request Routing
+-- Service Centers
+-- Technicians
+-- Spare Parts
+-- Inventory
+-- Stock Movement
+-- Spare Request & Logistics
+-- Local Purchase
+-- Finance
+-- RMA & Replacement
+-- Approvals
+-- SLA & Escalation
+-- Communication
+-- Reports
+-- Website Management
+-- Master Data
+-- Users & Access
+-- Administration
```
17. CRM Dashboard
Super Admin can select:
```text
Brand:
[ All Brands ]
[ MakWell ]
[ Flyvision ]
[ Skevia ]
```
Dashboard areas:
Overall Business
Sales
Service
Inventory
Finance
Brand Performance
18. Customers & Customer 360
```text
Customers
|
+-- All Customers
+-- Add Customer
+-- Active
+-- Inactive
+-- Duplicates
+-- Customer 360
```
Customer 360:
Overview
Products
Warranty
Service
Installation
Payments
Claims
RMA
Communication
Documents
A single customer can own products from multiple brands.
19. Brand Management
```text
Brands
|
+-- Brand Master
+-- MakWell
+-- Flyvision
+-- Skevia
+-- Brand Settings
+-- Brand Media
```
Suggested codes:
MW = MakWell
FV = Flyvision
SK = Skevia
20. Product Management
```text
Products
|
+-- Categories
+-- Products
+-- Models / SKUs
+-- Dynamic Attributes
+-- Product Images
+-- Product Videos
+-- Brochures
+-- Manuals
+-- Pricing
```
21. Serial & Registration
```text
Serial & Registration
|
+-- Search Serial
+-- Register Serial
+-- Serial History
+-- Product Registration
+-- Registered Products
+-- Registration History
```
Serial lifecycle:
```text
Dealer Sale
  |
Product Registration
  |
Installation
  |
Service
  |
RMA / Replacement
```
There is no separate Serial Number Master Import.
22. Warranty Management
```text
Warranty
|
+-- Warranty Plans
+-- Coverage Components
+-- Active Warranty
+-- Expired Warranty
+-- Warranty Claims
+-- Exceptions
```
Coverage is linked to:
Brand -> Category -> Model -> Component -> Coverage
23. Dealer Management
```text
Dealers
|
+-- Dealer Applications
+-- All Dealers
+-- Active
+-- Inactive
+-- Dealer Customers
+-- Dealer Sales
+-- Dealer Orders
+-- Dealer Products
+-- Product Registration
+-- Service Requests
+-- RMA
+-- Performance
```
24. Service Hub
```text
Service
|
+-- Service Hub
+-- Service Requests
+-- Installation
+-- Routing & Dispatch
+-- Scheduling
+-- Service Visits
+-- Diagnosis
+-- Service Closure
```
Request flow:
```text
NEW
 |
VALIDATING
 |
ROUTING
 |
CENTER ASSIGNED
 |
TECHNICIAN ASSIGNED
 |
SCHEDULED
 |
ACCEPTED
 |
ON THE WAY
 |
AT CUSTOMER
 |
IN PROGRESS
 |
WAITING FOR SPARE / CUSTOMER / APPROVAL
 |
COMPLETED
 |
VERIFICATION
 |
CLOSED
```
Additional states:
Reassignment Required
Cancelled
Reopened
SLA Breached
25. Service Request Routing
```text
Service Request
 |
Brand
 |
Product Category
 |
State / District / PIN
 |
Eligible Service Centers
 |
Eligible Technicians
 |
Availability
 |
Workload
 |
Distance
 |
Priority
 |
SLA
 |
Spare Availability
 |
Assignment
```
Routing module:
Unassigned
Auto Routing
Center Assignment
Technician Assignment
Dispatch Board
Reassignment
Escalation
Assignment History
26. Service Center Management
```text
Service Centers
|
+-- All Centers
+-- Pending Approval
+-- Active
+-- Inactive
+-- Center Profile
+-- Coverage Areas
+-- Center Technicians
+-- Center Inventory
+-- Center Requests
+-- Center Claims
+-- Performance
```
A service center can support multiple brands, but every request remains brand-specific.
27. Technician Management
```text
Technicians
|
+-- All Technicians
+-- Pending Approval
+-- Active
+-- Inactive
+-- Technician Profile
+-- Skills
+-- Brand Authorization
+-- Service Areas
+-- Availability
+-- Schedule
+-- Jobs
+-- Spare Bag
+-- Claims
+-- Earnings
+-- Performance
```
Technicians can only receive jobs for authorized brands/categories.
28. Spare Parts
```text
Spare Parts
|
+-- Part Master
+-- Categories
+-- Brand Compatibility
+-- Model Compatibility
+-- Prices
+-- Suppliers
+-- Reorder Levels
```
Compatibility must be explicit. Similar descriptions do not imply compatibility.
29. Inventory
```text
Inventory
|
+-- Head Office Warehouse
+-- Service Center Stock
+-- Technician Stock
+-- Stock Summary
+-- Reserved Stock
+-- Low Stock
+-- Out of Stock
+-- Damaged Stock
+-- Returned Stock
```
Stock buckets:
Total
Reserved
Available
In Transit
Damaged
Returned
Consumed
30. Stock Movement
```text
Stock Movement
|
+-- Receive
+-- Issue
+-- Transfers
+-- Adjustments
+-- Returns
+-- Movement History
```
No silent quantity editing.
31. Spare Request & Logistics
```text
Spare Request & Logistics
|
+-- New Requests
+-- Approved
+-- Picking
+-- Packing
+-- Dispatch
+-- In Transit
+-- Received
+-- Back Order
+-- Resend
+-- History
```
Flow:
```text
Diagnosis
 |
Spare Required
 |
Spare Request
 |
Warehouse
 |
Check Stock
 |
Reserve
 |
Pick
 |
Pack
 |
Dispatch
 |
Receive
 |
Issue / Use
```
32. Warehouse — Secondary Admin
Warehouse is a Secondary Admin focused on operational inventory and spare logistics.
```text
WAREHOUSE
|
+-- ⭐ Operational Dashboard
|
+-- Spare Requests & Dispatch
+-- Inventory
+-- Stock Movement
+-- Spare Parts
+-- Local Purchase
+-- Claims
+-- Returns & Defects
+-- Service Visibility
+-- Master Data
+-- Reports
+-- Notifications
+-- Audit Logs
+-- Profile
```
The Operational Dashboard is the primary screen and prioritizes:
Urgent spare requests
SLA-critical requests
Pending spare requests
Waiting-for-spare service requests
Picking pending
Packing pending
Dispatch pending
In-transit shipments
Receiving pending
Low stock
Out of stock
Local purchase requests
Claims requiring verification
Returns/defective parts
Today's stock movement
Today's dispatches
Warehouse does not control:
Users & permissions
Routing rules
Warranty rules
Commission rules
SLA configuration
Final financial approval
Final payment settlement
Firebase/system configuration
33. Local Purchase
```text
Local Purchase
|
+-- Requests
+-- Emergency Purchase
+-- Invoice Verification
+-- Claim Processing
+-- History
```
Flow:
```text
Spare unavailable
 |
Local Purchase Request
 |
Warehouse Verification
 |
Purchase
 |
Invoice Upload
 |
Spare Used
 |
Claim
 |
Finance / Admin Approval
 |
Reimbursement
```
34. Claims
```text
Claims
|
+-- Technician Claims
+-- Service Center Claims
+-- Local Purchase Claims
+-- Verification
+-- Submitted
+-- History
```
Statuses:
Draft
Submitted
Under Review
Approved
Partially Approved
Rejected
Resubmitted
Payable
Paid
35. Returns & Defects
```text
Returns & Defects
|
+-- Spare Returns
+-- Defective Parts
+-- Supplier Returns
+-- Disposal
```
36. Finance
```text
Finance
|
+-- Estimates
+-- Invoices
+-- Customer Payments
+-- Technician Claims
+-- Service Center Claims
+-- Local Purchase Reimbursement
+-- Settlements
+-- Payment History
```
Customer payments and operational claims remain separate financial flows.
37. RMA & Replacement
```text
RMA & Replacement
|
+-- New RMA
+-- Pending Approval
+-- Approved
+-- Product Return
+-- Inspection
+-- Replacement
+-- Old Serial
+-- New Serial
+-- Rejected
+-- Closed
```
Old Serial -> New Serial history must always be preserved.
38. Approvals
```text
Approvals
|
+-- Dealer
+-- Service Center
+-- Technician
+-- Spare Request
+-- Local Purchase
+-- Claims
+-- RMA
+-- Replacement
+-- Discount
+-- Master Data
```
39. SLA & Escalation
```text
SLA & Escalation
|
+-- SLA Dashboard
+-- Due Soon
+-- Breached
+-- Escalated
+-- SLA Rules
+-- Escalation Rules
```
40. Communication
```text
Communication
|
+-- WhatsApp
+-- Inbox
+-- Conversations
+-- Templates
+-- Automated Messages
+-- Broadcasts
+-- SMS
+-- Email
+-- Notifications
+-- Communication History
```
WhatsApp can integrate through Evolution API.
41. Reports
```text
Reports
|
+-- Sales
+-- Products
+-- Customers
+-- Service
+-- Warranty
+-- Installation
+-- Inventory
+-- Spare Consumption
+-- RMA
+-- Claims
+-- Payments
+-- Dealers
+-- Service Centers
+-- Technicians
+-- SLA
+-- Brand-wise Reports
```
42. Website Management
```text
Website Management
|
+-- Website Requests
+-- Leads
+-- Dealer Enquiries
+-- Product Enquiries
+-- Contact Enquiries
+-- Product Catalogue
+-- Home Banner
+-- Website Settings
```
Website content is database-driven.
43. Master Data
```text
Master Data
|
+-- Download Sample Files
+-- Import Masters
+-- Upload
+-- Validation
+-- Preview
+-- Error Report
+-- Pending Approval
+-- Publish
+-- Export
+-- Import History
```
Importable masters include:
Brands
Product Categories
Products
Models / SKUs
Dynamic Attributes
Warranty Plans
Warranty Components
Spare Parts
Spare Compatibility
Spare Prices
Suppliers
Dealers
Service Centers
Technicians
Customers
Product Registrations
Opening Stock
Other configured masters
Serial Number Master Import is excluded.
44. Users & Access
```text
Users & Access
|
+-- Users
+-- Roles
+-- Permissions
+-- Login Activity
+-- Access History
```
Recommended roles:
Super Admin
Warehouse / Secondary Admin
Service Center
Technician
Dealer
45. Administration
```text
Administration
|
+-- General Settings
+-- State & District
+-- Product Configuration
+-- Warranty Configuration
+-- Service Configuration
+-- Inventory Configuration
+-- Claim Rules
+-- Commission Rules
+-- SLA Rules
+-- Audit Logs
```
46. Customer / Brand Relationship
A single customer can own products from multiple brands.
```text
Customer
|
+-- MakWell TV
+-- Skevia Washing Machine
+-- Flyvision Sound System
```
Customer is company-level; each product registration is brand-specific.
47. Core Business Flow
```text
                         MAKWELL.CO
                             |
                     BRAND SELECTION
                             |
          +------------------+------------------+
          |                  |                  |
       MAKWELL            FLYVISION           SKEVIA
          |                  |                  |
          +------------------+------------------+
                             |
                     CUSTOMER SERVICES
                             |
          +------------------+------------------+
          |                  |                  |
     Registration        Book Service       Track Service
          |                  |
          +----------+-------+
                     |
          PUSHPAK ENTERPRISES CRM
                     |
          +----------+----------+
          |                     |
      Customer                Product
          |                     |
          +----------+----------+
                     |
                  Warranty
                     |
              Service Request
                     |
               Routing Engine
                     |
               Service Center
                     |
                 Technician
                     |
                 Diagnosis
                     |
                Spare Required
                     |
                  Warehouse
                     |
               Spare Dispatch
                     |
                Service Visit
                     |
                 Completion
                     |
             Claim / Payment / RMA
```
48. Firestore Data Architecture
```text
Firestore
|
+-- brands
+-- users
+-- roles
+-- permissions
|
+-- customers
|
+-- productCategories
+-- products
+-- models
+-- productAttributes
+-- productMedia
+-- productDocuments
|
+-- serials
+-- registrations
+-- warranties
|
+-- dealers
+-- dealerSales
+-- dealerOrders
|
+-- serviceRequests
+-- serviceVisits
+-- diagnosis
+-- appointments
+-- installations
|
+-- serviceCenters
+-- serviceAreas
+-- technicians
+-- technicianSkills
+-- technicianSchedules
|
+-- spareParts
+-- spareCompatibility
+-- sparePrices
+-- suppliers
|
+-- inventory
+-- stockTransactions
+-- stockTransfers
+-- spareRequests
+-- dispatches
+-- receipts
+-- returns
|
+-- localPurchases
+-- claims
+-- settlements
|
+-- estimates
+-- invoices
+-- payments
|
+-- rmas
+-- replacements
|
+-- notifications
+-- communications
+-- whatsappMessages
|
+-- leads
+-- websiteRequests
|
+-- slaRules
+-- routingRules
+-- claimRules
|
+-- imports
+-- auditLogs
+-- settings
```
49. Brand Data Rule
All brand-dependent records must have a controlled `brandId`.
Examples:
products
models
serials
registrations
warranties
serviceRequests
spareParts
claims
rmas
dealerSales
Conceptually:
```text
product.brandId
model.brandId
serial.brandId
registration.brandId
warranty.brandId
serviceRequest.brandId
```
Frontend and backend must enforce the appropriate brand filter.
50. Storage Architecture
Firebase Storage should contain files and media:
```text
products/
customers/
registrations/
service/
installation/
spares/
local-purchases/
claims/
rma/
payments/
website/
```
Firestore stores file metadata; large files and Base64 content should not be stored directly in Firestore.
51. Brand-Aware Access
Super Admin
```text
Brand: [ All Brands | MakWell | Flyvision | Skevia ]
```
Brand-restricted user
```text
Brand: [ MakWell 🔒 ]
```
Warehouse
Can operate across all brands while stock remains brand-separated.
Service Center
Can support multiple authorized brands.
Technician
Can service only authorized brands/categories.
Dealer
Can be authorized for one or multiple brands.
52. URL Structure
```text
makwell.co/
    -> Main Landing / Brand Selection

makwell.co/makwell/
makwell.co/makwell/products/
makwell.co/makwell/products/[product]
makwell.co/makwell/about/
makwell.co/makwell/contact/

makwell.co/flyvision/
makwell.co/flyvision/products/
makwell.co/flyvision/products/[product]
makwell.co/flyvision/about/
makwell.co/flyvision/contact/

makwell.co/skevia/
makwell.co/skevia/products/
makwell.co/skevia/products/[product]
makwell.co/skevia/about/
makwell.co/skevia/contact/

makwell.co/register/
makwell.co/service/
makwell.co/track/
makwell.co/warranty/
makwell.co/support/

makwell.co/crm/
    -> Pushpak Enterprises CRM
```
53. Final Architecture Principle
> **ONE COMPANY -> ONE DOMAIN -> THREE BRANDS -> SEPARATED BRAND EXPERIENCE -> ONE CENTRAL CRM**
Non-negotiable rules:
Categories are database-driven.
Products are database-driven.
Models/SKUs are database-driven.
Dynamic attributes are database-driven.
Product media/documents are database-driven.
Every product belongs to a brand.
Products never leak into another brand website.
One customer can own products from multiple brands.
One CRM manages all three brands.
Warehouse operates across brands but stock remains brand-separated.
Service Centers can support multiple brands.
Technicians require brand/category authorization.
Warranty is brand/model/component aware.
Serials are captured through operational workflows.
Important actions are auditable.
Public website and CRM are separate user experiences.
Future brands, categories, products and models can be added from the backend without rebuilding the frontend.
54. Technology Direction
```text
Public Website
       |
Firebase / Backend
       |
+------+-------------------+
|                          |
Firestore              Storage
|                          |
CRM Data             Photos/Documents
|
+-- Authentication
+-- Cloud Functions / Backend Logic
|
+-- WhatsApp / Evolution API
+-- Email
+-- SMS
```
Recommended production architecture:
Firebase Blaze
Firestore
Firebase Authentication
Firebase Storage
Cloud Functions / backend services
Evolution API for WhatsApp where appropriate
---
END OF MASTER SITE PLAN
