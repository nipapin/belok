ALTER TABLE products ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS slug TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS products_slug_key ON products(slug);
CREATE UNIQUE INDEX IF NOT EXISTS product_variants_product_slug_key ON product_variants("productId",slug);

CREATE OR REPLACE FUNCTION belok_slugify(value TEXT, fallback TEXT DEFAULT 'blyudo') RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  letters JSONB := '{"а":"a","б":"b","в":"v","г":"g","д":"d","е":"e","ё":"yo","ж":"zh","з":"z","и":"i","й":"i","к":"k","л":"l","м":"m","н":"n","о":"o","п":"p","р":"r","с":"s","т":"t","у":"u","ф":"f","х":"kh","ц":"ts","ч":"ch","ш":"sh","щ":"shch","ъ":"","ы":"y","ь":"","э":"e","ю":"yu","я":"ya"}';
  result TEXT := ''; letter TEXT;
BEGIN
  FOREACH letter IN ARRAY regexp_split_to_array(lower(COALESCE(value,'')), '') LOOP
    result := result || COALESCE(letters ->> letter, letter);
  END LOOP;
  result := trim(both '-' from left(regexp_replace(result, '[^a-z0-9]+', '-', 'g'),100));
  RETURN COALESCE(NULLIF(result,''),fallback);
END $$;

CREATE OR REPLACE FUNCTION belok_product_slug() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE base TEXT; candidate TEXT; suffix INTEGER := 1;
BEGIN
  IF NULLIF(NEW.slug,'') IS NOT NULL THEN RETURN NEW; END IF;
  base := belok_slugify(NEW.name);
  IF base = ANY(ARRAY['categories','search','toppings','reorder','new'])
     OR base ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    base := 'blyudo-' || base;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('belok:product-slugs'));
  candidate := base;
  WHILE EXISTS(SELECT 1 FROM products WHERE (slug=candidate OR id=candidate) AND id<>NEW.id) LOOP
    suffix := suffix + 1; candidate := base || '-' || suffix;
  END LOOP;
  NEW.slug := candidate;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS products_assign_slug ON products;
CREATE TRIGGER products_assign_slug BEFORE INSERT OR UPDATE OF slug ON products FOR EACH ROW EXECUTE FUNCTION belok_product_slug();

CREATE OR REPLACE FUNCTION belok_variant_slug() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE base TEXT; candidate TEXT; suffix INTEGER := 1;
BEGIN
  IF NULLIF(NEW.slug,'') IS NOT NULL THEN RETURN NEW; END IF;
  base := belok_slugify(NEW.name,'variant');
  PERFORM pg_advisory_xact_lock(hashtext('belok:variant-slugs:' || NEW."productId"));
  candidate := base;
  WHILE EXISTS(SELECT 1 FROM product_variants WHERE "productId"=NEW."productId" AND (slug=candidate OR id=candidate) AND id<>NEW.id) LOOP
    suffix := suffix + 1; candidate := base || '-' || suffix;
  END LOOP;
  NEW.slug := candidate;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS variants_assign_slug ON product_variants;
CREATE TRIGGER variants_assign_slug BEFORE INSERT OR UPDATE OF slug ON product_variants FOR EACH ROW EXECUTE FUNCTION belok_variant_slug();

DO $$ DECLARE item RECORD;
BEGIN
  FOR item IN SELECT id FROM products WHERE slug IS NULL ORDER BY "createdAt",id LOOP
    UPDATE products SET slug=NULL WHERE id=item.id;
  END LOOP;
  FOR item IN SELECT id FROM product_variants WHERE slug IS NULL ORDER BY "productId","sortOrder",id LOOP
    UPDATE product_variants SET slug=NULL WHERE id=item.id;
  END LOOP;
END $$;
ALTER TABLE products ALTER COLUMN slug SET NOT NULL;
ALTER TABLE product_variants ALTER COLUMN slug SET NOT NULL;
