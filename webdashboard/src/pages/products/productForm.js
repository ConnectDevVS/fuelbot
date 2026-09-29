// A product (GET …/products/:pid, dashboard plan §5.11) ⇄ the drawer's form values ⇄ the PATCH / POST
// body. Numbers go as JSON numbers; empty optional fields go as null (the server clears them); lists
// are trimmed and blanks dropped. `image_url` is read-only here (S5 uploads it), so it's never sent.

export const NUTRITION = ['kcal', 'protein_g', 'carbs_g', 'fat_g'];

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const list = (v) => (Array.isArray(v) ? v.map((s) => String(s).trim()).filter(Boolean) : []);

/** The product view → form values (every field present, so dirty tracking compares like with like). */
export function toForm(p = {}) {
  return {
    product_id: p.id ?? '',
    name: p.name ?? '',
    description: p.description ?? '',
    volume_ml: p.volume_ml ?? null,
    nutrition: Object.fromEntries(NUTRITION.map((k) => [k, p.nutrition?.[k] ?? null])),
    ingredients: [...(p.ingredients ?? [])],
    allergens: [...(p.allergens ?? [])],
    image: p.image ?? '',
    actual_price: p.actual_price ?? null,
    offer_price: p.offer_price ?? null,
    portion_g: p.portion_g ?? null,
  };
}

/** Form values → the body. create: adds product_id (a slug; it can't change later). */
export function toBody(v, { create = false } = {}) {
  const nutrition = Object.fromEntries(NUTRITION.map((k) => [k, num(v.nutrition?.[k])]).filter(([, n]) => n !== null));
  const body = {
    name: (v.name ?? '').trim(),
    description: text(v.description),
    volume_ml: num(v.volume_ml),
    nutrition: Object.keys(nutrition).length ? nutrition : null,
    ingredients: list(v.ingredients),
    allergens: list(v.allergens),
    image: text(v.image),
    actual_price: num(v.actual_price),
    offer_price: num(v.offer_price),
    portion_g: num(v.portion_g),
  };
  return create ? { product_id: (v.product_id ?? '').trim(), ...body } : body;
}

/** The file name of a bundled image ('res://assets/…/prymor_guava.png' → 'prymor_guava.png'). */
export function bundledName(image) {
  return image ? String(image).split('/').pop() : null;
}
