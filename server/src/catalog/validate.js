// The app's catalog rules, ported line by line from autoload/ConfigManager.gd
// (validate_config, image_file_name, is_valid_image_url) with the same error text.
// If the app's rules change, change this file in the same commit (plan §3.2).

export const MAX_HOPPER = 6;

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const isString = (v) => typeof v === 'string';

// Godot's str(): null → "<null>".
function godotStr(v) {
  if (v === null) return '<null>';
  return String(v);
}

// Godot's String.is_valid_filename(): no surrounding whitespace, not empty,
// none of : / \ ? * " | % < >.
function isValidFilename(name) {
  if (name.trim() !== name || name === '') return false;
  return !/[:/\\?*"|%<>]/.test(name);
}

function uriDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** The cache key of an image URL: its last path segment, decoded, no query or fragment. "" if none. */
export function imageFileName(url) {
  const rest = url.split('#')[0].split('?')[0];
  const schemeEnd = rest.indexOf('://');
  if (schemeEnd < 0) return '';
  const pathStart = rest.indexOf('/', schemeEnd + 3);
  if (pathStart < 0) return '';
  const name = uriDecode(rest.slice(rest.lastIndexOf('/') + 1));
  if (name === '' || name.startsWith('.') || !isValidFilename(name)) return '';
  return name;
}

/** https://<host>/…/<file>, or http:// for 127.0.0.1 / localhost only. */
export function isValidImageUrl(url) {
  let host = '';
  if (url.startsWith('https://')) {
    host = url.slice('https://'.length).split('/')[0];
  } else if (url.startsWith('http://')) {
    host = url.slice('http://'.length).split('/')[0];
    if (!['127.0.0.1', 'localhost'].includes(host.split(':')[0])) return false;
  } else {
    return false;
  }
  return host.split(':')[0] !== '' && imageFileName(url) !== '';
}

/** The app's validate_config(): a list of error strings, empty when the config is valid. */
export function validateConfig(data) {
  const errors = [];
  if (!isObject(data)) {
    errors.push('config is not an object');
    return errors;
  }
  const flavors = data.flavors;
  if (!Array.isArray(flavors) || flavors.length === 0) {
    errors.push('flavors must be a non-empty array');
    return errors;
  }
  if (!Array.isArray(data.bases ?? [])) errors.push('bases must be an array');
  if ('tenant' in data && !isObject(data.tenant)) errors.push('tenant must be an object');
  if ('maintenance' in data) {
    if (!isObject(data.maintenance)) {
      errors.push('maintenance must be an object');
    } else if ('faults' in data.maintenance && !Array.isArray(data.maintenance.faults)) {
      errors.push('maintenance.faults must be an array');
    }
  }
  const usedHoppers = new Map();
  for (const f of flavors) {
    if (!isObject(f)) {
      errors.push('flavor is not an object');
      continue;
    }
    const fid = 'id' in f ? godotStr(f.id) : '?';
    if (!isString(f.id) || f.id === '') errors.push('flavor id missing');
    if (!isString(f.name) || f.name === '') errors.push(`${fid}: name missing`);
    const h = f.hopper;
    const hopperOk = isNumber(h) && h === Math.floor(h) && h >= 1 && h <= MAX_HOPPER;
    if (!hopperOk) errors.push(`${fid}: hopper must be a whole number 1-${MAX_HOPPER}`);
    const price = f.actual_price;
    if (!isNumber(price) || price <= 0) errors.push(`${fid}: actual_price must be > 0`);
    const offer = f.offer_price;
    if (offer !== undefined && offer !== null && (!isNumber(offer) || offer <= 0)) {
      errors.push(`${fid}: offer_price must be null or > 0`);
    }
    const image = f.image;
    const imageUrl = f.image_url;
    if (image !== undefined && image !== null && !isString(image)) {
      errors.push(`${fid}: image must be a string`);
    }
    const hasUrl = isString(imageUrl) && imageUrl !== '';
    if (imageUrl !== undefined && imageUrl !== null && !isString(imageUrl)) {
      errors.push(`${fid}: image_url must be a string`);
    } else if (hasUrl && !isValidImageUrl(imageUrl)) {
      errors.push(`${fid}: image_url must be https:// with a file name`);
    }
    if (!hasUrl && !(isString(image) && image !== '')) {
      errors.push(`${fid}: image or image_url required`);
    }
    if ('sold_out' in f && typeof f.sold_out !== 'boolean') errors.push(`${fid}: sold_out must be bool`);
    if ('badge' in f && f.badge !== null && !isString(f.badge)) {
      errors.push(`${fid}: badge must be string or null`);
    }
    if ('nutrition' in f && !isObject(f.nutrition)) errors.push(`${fid}: nutrition must be an object`);
    if (hopperOk && f.enabled === true) {
      if (usedHoppers.has(h)) {
        errors.push(`${fid}: hopper ${h} already used by ${usedHoppers.get(h)}`);
      } else {
        usedHoppers.set(h, fid);
      }
    }
  }
  return errors;
}

/**
 * Rules the server adds on top of the app's (plan §3.2): whole-rupee prices and one entry per
 * flavor id. The app would accept these configs but could misbehave (it truncates prices).
 */
export function validateServerRules(data) {
  const errors = [];
  if (!isObject(data) || !Array.isArray(data.flavors)) return errors;
  const seen = new Set();
  for (const f of data.flavors) {
    if (!isObject(f)) continue;
    const fid = 'id' in f ? godotStr(f.id) : '?';
    if (isNumber(f.actual_price) && !Number.isInteger(f.actual_price)) {
      errors.push(`${fid}: actual_price must be whole rupees`);
    }
    if (isNumber(f.offer_price) && !Number.isInteger(f.offer_price)) {
      errors.push(`${fid}: offer_price must be whole rupees`);
    }
    if (isString(f.id) && f.id !== '') {
      if (seen.has(f.id)) errors.push(`${fid}: flavor listed twice`);
      seen.add(f.id);
    }
  }
  return errors;
}

/** Both rule sets. */
export function validateAll(data) {
  return [...validateConfig(data), ...validateServerRules(data)];
}
