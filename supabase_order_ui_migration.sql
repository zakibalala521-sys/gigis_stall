-- Apply once after supabase_order_workflow_migration.sql.
-- Adds the single supported payment method and a safe pending-order edit RPC.

ALTER TABLE orders
  ALTER COLUMN order_type SET DEFAULT 'take-out';
ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_order_type_check;
UPDATE orders SET order_type = 'take-out' WHERE order_type <> 'take-out';
ALTER TABLE orders
  ADD CONSTRAINT orders_order_type_check CHECK (order_type = 'take-out');

UPDATE customer_order_history
SET order_type = 'take-out'
WHERE order_type <> 'take-out';

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_method varchar(40) NOT NULL DEFAULT 'Cash on Pick-up';

ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method = 'Cash on Pick-up');

ALTER TABLE customer_order_history
  ADD COLUMN IF NOT EXISTS payment_method varchar(40) NOT NULL DEFAULT 'Cash on Pick-up';
ALTER TABLE customer_order_history
  DROP CONSTRAINT IF EXISTS customer_order_history_payment_method_check;
ALTER TABLE customer_order_history
  ADD CONSTRAINT customer_order_history_payment_method_check
  CHECK (payment_method = 'Cash on Pick-up');

CREATE OR REPLACE FUNCTION update_pending_customer_order(
  p_order_id integer,
  p_customer_id integer,
  p_notes varchar,
  p_items jsonb
)
RETURNS TABLE(total_amount numeric)
LANGUAGE plpgsql
AS $$
DECLARE
  entry jsonb;
  item_product_id integer;
  item_quantity integer;
  item_product_numeric numeric;
  item_quantity_numeric numeric;
  item_price numeric(8,2);
  order_total numeric(10,2) := 0;
  item_count integer;
  seen_product_ids integer[] := ARRAY[]::integer[];
BEGIN
  IF p_order_id < 1 OR p_customer_id < 1
     OR length(COALESCE(p_notes, '')) > 255
     OR jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid order details.';
  END IF;

  PERFORM 1 FROM orders
  WHERE orders.order_id = p_order_id
    AND orders.customer_id = p_customer_id
    AND orders.status = 'pending'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only your pending order can be edited.';
  END IF;

  item_count := jsonb_array_length(p_items);
  IF item_count < 1 OR item_count > 50 THEN
    RAISE EXCEPTION 'Order must contain between 1 and 50 items.';
  END IF;

  FOR entry IN SELECT jsonb_array_elements(p_items)
  LOOP
    IF jsonb_typeof(entry) <> 'object'
       OR COALESCE(entry->>'product_id', '') !~ '^[0-9]+$'
       OR COALESCE(entry->>'quantity', '') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'Order items are invalid.';
    END IF;
    item_product_numeric := (entry->>'product_id')::numeric;
    item_quantity_numeric := (entry->>'quantity')::numeric;
    IF item_product_numeric < 1 OR item_product_numeric > 2147483647
       OR item_product_numeric <> trunc(item_product_numeric)
       OR item_quantity_numeric < 1 OR item_quantity_numeric > 99
       OR item_quantity_numeric <> trunc(item_quantity_numeric) THEN
      RAISE EXCEPTION 'Order item quantity or product is invalid.';
    END IF;
    item_product_id := item_product_numeric::integer;
    IF item_product_id = ANY(seen_product_ids) THEN
      RAISE EXCEPTION 'Order items are duplicated.';
    END IF;
    seen_product_ids := array_append(seen_product_ids, item_product_id);
  END LOOP;

  DELETE FROM order_items WHERE order_items.order_id = p_order_id;
  FOR entry IN SELECT jsonb_array_elements(p_items)
  LOOP
    item_product_id := (entry->>'product_id')::integer;
    item_quantity := (entry->>'quantity')::integer;
    SELECT price INTO item_price
    FROM products
    WHERE product_id = item_product_id
      AND is_available = 1
      AND is_archived = 0
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'A menu item is unavailable.';
    END IF;

    INSERT INTO order_items (order_id, product_id, quantity, unit_price)
    VALUES (p_order_id, item_product_id, item_quantity, item_price);
    order_total := order_total + item_quantity * item_price;
  END LOOP;

  UPDATE orders
  SET notes = NULLIF(BTRIM(p_notes), '')
  WHERE orders.order_id = p_order_id;
  RETURN QUERY SELECT order_total;
END;
$$;

REVOKE ALL ON FUNCTION update_pending_customer_order(integer, integer, varchar, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION update_pending_customer_order(integer, integer, varchar, jsonb) TO service_role;
