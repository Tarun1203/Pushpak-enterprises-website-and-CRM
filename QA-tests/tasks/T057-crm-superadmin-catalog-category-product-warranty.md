# T057-crm-superadmin-catalog-category-product-warranty: Category → Warranty plan → Product (with and without model) → Variant

| Field | Value |
|---|---|
| Route | `/crm/CRMsuperadmin.html` → nav **Categories**, **Warranty Plans**, **Products** |
| Source | `crm/CRMsuperadmin.html` (`category-form` submit ~3458, `wplan-form` ~3950, `product-form` ~2779, `model-form` ~2900) |
| Flow | Create a category, a warranty plan, a product with no model number (product shell only), a product with a model, and a variant |
| Requires auth | yes |
| Required role | superadmin |
| Destructive | no |
| Estimated steps | 40 |

## Preconditions
- App running at `http://localhost:8080`
- Signed in as `superadmin` (env `QA_CRED_SUPERADMIN_USERNAME` / `QA_CRED_SUPERADMIN_PASSWORD`).
- **Run only against the Firebase emulator or a dedicated test project — never the live makwell-websiteandcrm data.** Categories are marked `live on the brand site`. The page hard-codes the live config with no emulator switch. If traffic would reach the live project, **mark this task BLOCKED** and stop.
- Writes `productCategories`, `categoryHistory`, `warrantyPlans`, `products`, `productModels`.
- Run before T052, because T052 needs the category.

## Test data
- Category: `name = "QA-AUTO Geyser {runId}"`, `code = "QAG"`, `brand = "MakWell"`, `description = "QA-AUTO test category"`, `icon = "QA"`, `order = 99`, `status = "Active"`, `needsService = ✓`, `needsInstallation = ✓`, `sizeBuckets = "15\n25,35"`
- Warranty plan: `name = "QA-AUTO Geyser Warranty {runId}"`, `brand = "MakWell"`, `category = "QA-AUTO Geyser {runId}"`, `status = "Active"`, component `Full Product` / `1` / `QA-AUTO full cover`, plus component `Heating Element` / `2` / blank
- Product A (no model): `name = "QA-AUTO Geyser Shell {runId}"`, `brand = "MakWell"`, `category = "QA-AUTO Geyser {runId}"`, every model-level field left empty
- Product B: `name = "QA-AUTO Geyser 15L {runId}"`, `brand = "MakWell"`, `category = "QA-AUTO Geyser {runId}"`, `modelNumber = "QAMW15{runId}"`, `sku = "QA-MW-GY-15"`, `price = 5499`, `gst = "18%"`, `hsn = "8516"`, `specs = "QA-AUTO 15 litre"`, `warranty = "QA-AUTO Geyser Warranty {runId}"`, `status = "Active"`
- Variant on Product B: `modelNumber = "QAMW25{runId}"`, `price = 6999`, `gst = "18%"`, `hsn = "8516"`
- Invalid: `emptyRequired = ""`, `codeOverflow = "ABCDEFGHIJK"` (11 chars), `iconOverflow = "ABCDE"`, `hsnOverflow = "851600001"` (9 chars), `price = -1`

## Steps

### TC-01: Happy path — create a category
1. Click nav **Categories**. Assert: subtitle `Category master, per brand`, and tabs `All Categories`, `Active`, `Inactive`, `Category History`, `Dynamic Attributes`.
2. Click **+ Add Category**. Assert: dialog `Add category`, both checkboxes ticked by default, Display order `0`.
3. Fill every field with the Test data and click **Save category**.
4. Assert: green `Saved — live on the brand site.` The modal closes and the row `QA | QA-AUTO Geyser {runId} | QAG | MakWell | 99 | active` appears (icon prefix `QA`).
5. Click the **Category History** tab. Assert: the top row shows Category `QA-AUTO Geyser {runId}`, Action `created`, Changed By = superadmin email, Details `MakWell — active`.

### TC-02: Happy path — warranty plan
1. Click nav **Warranty Plans**, then **+ Add Plan**. Assert: dialog `Add warranty plan` with one empty component row.
2. Clear the component name and click **Save plan**. Assert: `Add at least one component (e.g. "Full Product", 12 months).`
3. Fill the plan data. Select category `QA-AUTO Geyser {runId}` (the list loads after brand MakWell). Click **+ Add Component** for the second component. Click **Save plan**.
4. Assert: `Saved.` and the row `QA-AUTO Geyser Warranty {runId} | MakWell | QA-AUTO Geyser {runId} | Full Product: 1y, Heating Element: 2y | active`.

### TC-03: Happy path — product with NO model number selected
1. Click nav **Products**, then **+ Add Product**. Assert: dialog `Add product`, button `Save product`, and the image grid `No images yet`.
2. Fill Name = `QA-AUTO Geyser Shell {runId}` and keep Brand `MakWell`. Wait for **Category** to load, then select `QA-AUTO Geyser {runId}`. Leave Model Number, SKU, Price, GST (`— not set —`), HSN, notes, and Warranty (`No plan linked`) empty.
3. Click **Save product**. Assert: `Saved.` and the modal closes.
4. Assert: the row shows Product `QA-AUTO Geyser Shell {runId}`, Model No. `No variant yet`, Category `QA-AUTO Geyser {runId}`, Brand `MakWell`, Price `—`, Status `—`, and buttons **Edit** and **+ Variant**.
5. Assert in Firestore: one `products` doc is created and **no** `productModels` doc has `productId` equal to it.

### TC-04: Happy path — product with a model, then a variant
1. Click **+ Add Product** and fill every Product B field. Click **Save product**. Assert: `Saved.` and the row shows Model No. `QAMW15{runId}`, Price `₹5499`, Status `active`.
2. Click **+ Variant** on that row. Assert: dialog `Add variant` with label `QA-AUTO Geyser 15L {runId} (MakWell)`.
3. Click **Save variant** with Model Number empty. Assert: native `required` tooltip.
4. Fill the variant data and click **Save variant**. Assert: `Saved.` The product now shows two rows, `QAMW15{runId}` and `QAMW25{runId}` (`₹6999`), sorted by model number.
5. Click **Edit** on Product A (the shell), enter Model Number `QAMW10{runId}`, and click **Save changes**. Assert: its `No variant yet` row is replaced by `QAMW10{runId}`.

### TC-05: Form validation
| Form | Field | Empty value error | Pattern / range | Max-length overflow |
|---|---|---|---|---|
| category-form | Category name | native `required` tooltip | n/a | n/a |
| category-form | Category code | optional | n/a | typing `ABCDEFGHIJK` keeps 10 chars |
| category-form | Icon | optional | n/a | typing `ABCDE` keeps 4 chars |
| category-form | Display order | defaults `0` | `-1` → native `min=0` tooltip | n/a |
| product-form | Name | native `required` tooltip | n/a | n/a |
| product-form | Price (₹) | optional | `-1` → native `min=0` tooltip | n/a |
| product-form | HSN code | optional | n/a | typing 9 chars keeps 8 |
| product-form | Category | if the brand has no categories: option `No categories yet for this brand — add one under Categories`; saving is allowed with `categoryId: null` | n/a | n/a |
| wplan-form | Plan name | native `required` tooltip | n/a | n/a |
| model-form | Model Number | native `required` tooltip | n/a | n/a |

### TC-06: Modal coverage — Cancel and overlay
For `Add category`, `Add warranty plan`, `Add product` and `Add variant`: open the modal, type `QA-AUTO discard`, and click **Cancel**. Assert: it closes with no new row. Reopen and click the overlay. Assert: it closes, and the reopened form is reset.

### TC-07: Negative & edge cases
- In Add product, attach an image over 10 MB (`qa-large.jpg`). Assert: the product saves and shows the red `Saved, but "qa-large.jpg" is over 10MB and was skipped.`
- Product name `QA-AUTO <i>x</i> {runId}`: the Products table must show the literal text. Then check Model Number `<i>QA</i>` on a variant. The Model No. cell is **not escaped** in source (`m.modelNumber`), so if it renders italic, log the defect `Unescaped modelNumber in Products table`.

## Assertions
- [ ] Category, warranty plan, product shell, product with model, and variant all save with the exact messages above.
- [ ] A product saved without a model number creates no `productModels` doc and shows `No variant yet`.
- [ ] Validation table outcomes hold, including `Add at least one component (e.g. "Full Product", 12 months).`
- [ ] No console errors in DevTools at any step.
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected.

## Screenshots required
- Each modal opened (category, plan, product, variant)
- Each validation error state
- Products table after TC-04 (shell row + 2-variant product)
- Category History tab

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
