import assert from 'node:assert/strict';
import { test } from 'node:test';
import { productHref } from '../src/lib/productHref';

test('catalog links use readable product and variant slugs', () => {
  assert.equal(productHref({id:'uuid',slug:'test-svyazei-toppingov'},{id:'variant-uuid',slug:'ovsyanaya'}),'/menu/test-svyazei-toppingov?v=ovsyanaya');
  assert.equal(productHref({id:'uuid',slug:'syrniki'}),'/menu/syrniki');
});
test('old cached catalog entries retain working ID links', () => {
  assert.equal(productHref({id:'uuid'},{id:'variant-uuid'}),'/menu/uuid?v=variant-uuid');
  assert.equal(productHref({id:'uuid',slug:'syrniki'},{id:'variant-uuid'}),'/menu/syrniki?v=variant-uuid');
});
