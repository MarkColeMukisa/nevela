// The tutorial's app, as the mobile app reads it: from the resources, is there a shop? Run from the
// top of the app (apps/mobile is there when it was made with --mobile). Nothing is written in the
// app for it: the shop is found in what the API describes.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = path.resolve('apps/api/nevela/resources');
const resources = fs.readdirSync(dir).filter((file) => file.endsWith('.json')).map((file) => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')));
const { findShop } = await import(pathToFileURL(path.resolve('apps/mobile/src/lib/shop.ts')).href);

const shop = findShop(resources, {});
if (!shop) {
  console.log('shop: none');
} else {
  console.log(`shop: ${shop.catalogue.name} sold in ${shop.orders.name}, lines ${shop.lines.name}`);
  console.log(`asked at checkout: ${shop.checkout.join(',')}`);
  console.log(`price ${shop.price}, picture ${shop.image}, available ${shop.available}, category ${shop.category}`);
}
