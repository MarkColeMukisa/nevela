#!/usr/bin/env bash
# The Online shop tutorial (apps/docs/src/content/docs/tutorials/online-shop.md), as commands.
#
# Run from the top of a new app. CI runs it on every change, so the tutorial can't go
# stale without a build going red. Each `nevela …` line here, and each file in files/,
# appears in the tutorial exactly as it is here (scripts/tutorials.test.mjs checks).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
# The tutorial types `nevela`. A machine without it installed has the app's own launcher
# (PHP=php.bat where php is a .bat, as with Herd in Git Bash).
nevela() { "${PHP:-php}" nevela "$@"; }
# Merges a JSON file of the tutorial's into a key of a descriptor, as you would by hand.
merge() { node -e '
  const fs = require("fs"), [file, key, from] = process.argv.slice(1);
  const descriptor = JSON.parse(fs.readFileSync(file, "utf8"));
  descriptor[key] = { ...(descriptor[key] ?? {}), ...JSON.parse(fs.readFileSync(from, "utf8")) };
  fs.writeFileSync(file, JSON.stringify(descriptor, null, 4) + "\n");
' "$@"; }
# Puts a method of the tutorial's in a model, under the line that says where your own code goes.
yours() { node -e '
  const fs = require("fs"), [file, from] = process.argv.slice(1);
  const marker = "    // Your own relationships, scopes and accessors go here — outside the generated block.";
  const model = fs.readFileSync(file, "utf8");
  if (!model.includes(marker)) throw new Error(`${file} has no line for your own code`);
  fs.writeFileSync(file, model.replace(marker, `${marker}\n\n${fs.readFileSync(from, "utf8").trimEnd()}`));
' "$@"; }

# 1. The shop's currency
printf '\nNEVELA_CURRENCY=USD\n' >> apps/api/.env

# 2. Categories
nevela resource Category --fields="name:string!, slug:slug(name)!, image:image?" --icon=tags --seed=8

# 3. Products
nevela resource Product --fields="name:string, slug:slug(name)!, price:money, image:image(product)?, category:belongsTo(Category), description:richtext?, active:boolean=true" --icon=package --seed=40

# 5. Orders and their items
nevela resource Order --fields="number:string!, customer:string, email:email, status:enum(pending|paid|shipped|cancelled)=pending, total:money?" --items="OrderItem: product:belongsTo(Product), quantity:int, price:money" --icon=shopping-cart --seed=20

# 6. The total
yours apps/api/app/Models/Order.php "$here/files/itemsSaved.php"

# 7. Products anyone may see
merge apps/api/nevela/resources/product.json public "$here/files/public.json"
nevela generate Product
yours apps/api/app/Models/Product.php "$here/files/publicQuery.php"

# 8. The shop's page
mkdir -p apps/web/app/shop
cp "$here/files/page.tsx" apps/web/app/shop/page.tsx

# Checks: what the tutorial says you have. Nothing below here is a step of the tutorial.
# Read, not trusted for its exit code: it is red for a port 8000 another app is using.
nevela status > status.log || true
grep -q "Resource: Category .* 8 records" status.log
grep -q "Resource: Product .* 40 records" status.log
grep -q "Resource: Order .* 20 records" status.log
grep -q "none pending" status.log
grep -q 'price: field.float({ format: "money", currency: "USD" })' apps/web/resources/product.resource.ts
grep -q '"items": "OrderItem"' apps/api/nevela/resources/order.json
# An order made over the API has the total of its items, and the public list has products on sale only.
check="$here/check.php"
command -v cygpath > /dev/null && check="$(cygpath -w "$check")" # a Windows PHP reads Windows paths
(cd apps/api && "${PHP:-php}" "$check") | tee shop.log
grep -q "^total 107.5$" shop.log
grep -q "^public only on sale: yes$" shop.log
grep -q "^public fields: id,name,slug,price,image,imageFile,description$" shop.log
