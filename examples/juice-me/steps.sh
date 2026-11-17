#!/usr/bin/env bash
# The Juice Me tutorial (apps/docs/src/content/docs/tutorials/juice-me.md), as commands.
#
# Run from the top of a new app made with `nevela new juice-me --mobile` (new-args says so
# to CI). CI runs it on every change, so the tutorial can't go stale without a build going
# red. Each `nevela …` line here, and each file in files/, appears in the tutorial exactly
# as it is here (scripts/tutorials.test.mjs checks).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
# The tutorial types `nevela`. A machine without it installed has the app's own launcher
# (PHP=php.bat where php is a .bat, as with Herd in Git Bash).
nevela() { "${PHP:-php}" nevela "$@"; }
# Puts a method of the tutorial's in a model, under the line that says where your own code goes.
yours() { node -e '
  const fs = require("fs"), [file, from] = process.argv.slice(1);
  const marker = "    // Your own relationships, scopes and accessors go here — outside the generated block.";
  const model = fs.readFileSync(file, "utf8");
  if (!model.includes(marker)) throw new Error(`${file} has no line for your own code`);
  fs.writeFileSync(file, model.replace(marker, `${marker}\n\n${fs.readFileSync(from, "utf8").trimEnd()}`));
' "$@"; }
# Adds a section to a descriptor, as the tutorial has you do in your editor.
merge() { node -e '
  const fs = require("fs"), [file, key, from] = process.argv.slice(1);
  const descriptor = JSON.parse(fs.readFileSync(file, "utf8"));
  descriptor[key] = { ...(descriptor[key] ?? {}), ...JSON.parse(fs.readFileSync(from, "utf8")) };
  fs.writeFileSync(file, JSON.stringify(descriptor, null, 4) + "\n");
' "$@"; }
# Does what the tutorial does by hand on the Roles screen.
by_hand() {
  local script="$here/by-hand.php"
  command -v cygpath > /dev/null && script="$(cygpath -w "$script")" # a Windows PHP reads Windows paths
  (cd apps/api && "${PHP:-php}" "$script" "$@")
}

# 1. The bar's currency, and who may sign up
printf '\nNEVELA_CURRENCY=UGX\nNEVELA_REGISTRATION=true\nNEVELA_DEFAULT_ROLE=CUSTOMER\n' >> apps/api/.env

# 2. Categories
nevela resource Category --fields="name:string!, image:image?" --icon=tags --seed=4

# 3. Beverages
nevela resource Beverage --fields="name:string, description:text?, price:money, size:enum(small|medium|large)=medium, image:image(product)?, category:belongsTo(Category), available:boolean=true" --icon=cup-soda --seed=16

# 3b. A real menu: what the tutorial has you rename and price on the Beverages page
by_hand menu

# 4. Orders and what is in them
nevela resource Order --fields="number:auto(JM), customer:string, email:email, phone:tel?, delivery:enum(collection|delivery)=collection, details:text?, status:enum(pending|accepted|preparing|ready|completed|cancelled)=pending, total:money?" --items="OrderItem: beverage:belongsTo(Beverage), quantity:int, price:money(beverage.price)" --owner=email --fixed --icon=shopping-bag --seed=12

# 5. What happens to an order: buttons, not edits
merge apps/api/nevela/resources/order.json actions "$here/files/actions.json"
nevela generate Order

# 6. The total, and what only the bar decides
yours apps/api/app/Models/Order.php "$here/files/itemsSaved.php"
yours apps/api/app/Models/Order.php "$here/files/placed.php"

# 7. Customers and staff
by_hand role CUSTOMER beverages.view categories.view orders.create orders.view orders.cancel
by_hand role STAFF beverages.view beverages.create beverages.edit beverages.delete categories.view categories.create categories.edit orders.view orders.edit orders.accept orders.start_preparing orders.mark_ready orders.complete orders.call_off
nevela user --name="Mercy Auma" --email=mercy@example.com --password=password --role=STAFF

# Checks: what the tutorial says you have. Nothing below here is a step of the tutorial.
# Read, not trusted for its exit code: it is red for a port 8000 another app is using.
nevela status > status.log || true
grep -q "Resource: Beverage .* 16 records" status.log
grep -q "Resource: Order .* 12 records" status.log
grep -q "none pending" status.log
grep -q 'price: field.float({ format: "money", currency: "UGX" })' apps/web/resources/beverage.resource.ts
grep -q '"owner": "email"' apps/api/nevela/resources/order.json
grep -q '"fixed": true' apps/api/nevela/resources/order.json
# Buttons that only set the status have no class to write.
test ! -e apps/api/app/Nevela/Actions/Order/Accept.php
# Customers who sign up, what they order and see, and what only the bar decides.
check="$here/check.php"
command -v cygpath > /dev/null && check="$(cygpath -w "$check")" # a Windows PHP reads Windows paths
(cd apps/api && "${PHP:-php}" "$check") | tee bar.log
grep -q "^sign-up 201 CUSTOMER$" bar.log
grep -q "^order 201 pending numbered amara@example.com$" bar.log
grep -q "^prices from the beverages: yes$" bar.log
grep -q "^total is theirs: yes$" bar.log
grep -q "^forged order 201: amara@example.com pending numbered and priced by Laravel$" bar.log
grep -q "^a line of minus two: 422 items.1.quantity$" bar.log
grep -q "^amara sees: 2 only her own$" bar.log
grep -q "^bo sees: 0$" bar.log
grep -q "^bo opens amara's order: 404$" bar.log
grep -q "^bo changes it: 404$" bar.log
grep -q "^amara changes her own status: 403$" bar.log
grep -q "^still pending$" bar.log
grep -q "^mercy sees: 14 of 14$" bar.log
grep -q "^mercy edits it: 409$" bar.log
grep -q "^the administrator deletes it: 409$" bar.log
grep -q "^mercy accepts it: 200 accepted$" bar.log
grep -q "^amara sees it accepted$" bar.log
grep -q "^amara is told: Your order JM-[0-9]* is now Accepted$" bar.log
grep -q "^its history: Accept by Mercy Auma, pending to accepted$" bar.log
grep -q "^amara cancels it while it is made: 409$" bar.log
grep -q "^mercy cancels it without a reason: 422$" bar.log
grep -q "^mercy cancels it: 200 cancelled, Out of mangoes today$" bar.log
grep -q "^amara cancels an accepted one: 200 cancelled$" bar.log
grep -q "^the bar hears: By Amara Okafor. Plans changed$" bar.log
grep -q "^on the shelf: only what is available$" bar.log
# The mobile app, reading the same resources, finds a shop with nothing written for it.
node --experimental-strip-types --no-warnings "$here/shop-check.mjs" | tee shop.log
grep -q "^shop: Beverage sold in Order, lines OrderItem$" shop.log
grep -q "^asked at checkout: customer,phone,delivery,details$" shop.log
grep -q "^price price, picture image, available available, category categoryId$" shop.log
(cd apps/mobile && npx tsc --noEmit)
