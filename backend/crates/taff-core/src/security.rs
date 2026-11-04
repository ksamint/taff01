use serde_json::Value;
use sha2::{Digest, Sha256};

/// `sha256(token + pepper)` as hex, mirroring `hashToken` in
/// `packages/core/src/index.ts`. Agent tokens are stored only as this hash;
/// the raw token is shown once and never logged.
pub fn hash_token(token: &str, pepper: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hasher.update(pepper.as_bytes());
    hex::encode(hasher.finalize())
}

/// Recursive canonical JSON, byte-identical to `canonicalJson` in
/// `packages/core/src/trusted-review.ts`: arrays keep order, object keys sort
/// by UTF-16 code unit order (what `Array#sort` does for strings), strings use
/// `JSON.stringify` escaping, and numbers use ECMAScript `Number::toString`.
/// The output is HMAC-signed, so every byte matters.
pub fn canonical_json(value: &Value) -> String {
    match value {
        Value::Array(items) => {
            let rendered: Vec<String> = items.iter().map(canonical_json).collect();
            format!("[{}]", rendered.join(","))
        }
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
            let rendered: Vec<String> = keys
                .into_iter()
                .map(|key| {
                    let key_json = serde_json::to_string(key).expect("string key serializes");
                    format!("{key_json}:{}", canonical_json(&map[key]))
                })
                .collect();
            format!("{{{}}}", rendered.join(","))
        }
        Value::Number(number) => js_number_to_string(number.as_f64().unwrap_or(0.0)),
        other => serde_json::to_string(other).expect("primitive serializes"),
    }
}

/// ECMAScript `Number::toString(10)` (ECMA-262 §6.1.6.1.20) for a finite
/// double: shortest round-trip digits, positional form for exponents in
/// `-7 < n <= 21`, otherwise `d.ddde±x`. `-0` prints as `0`; a non-finite
/// value prints as `null` because that is what `JSON.stringify` emits.
pub fn js_number_to_string(x: f64) -> String {
    if !x.is_finite() {
        return "null".to_string();
    }
    if x == 0.0 {
        return "0".to_string();
    }
    let magnitude = x.abs();
    // Rust's `{:e}` is the shortest representation that round-trips, the same
    // digit string the ECMAScript algorithm specifies.
    let sci = format!("{magnitude:e}");
    let (mantissa, exponent) = sci
        .split_once('e')
        .expect("LowerExp always has an exponent");
    let exponent: i32 = exponent.parse().expect("integer exponent");
    let digits: String = mantissa.chars().filter(|c| *c != '.').collect();
    let k = digits.len() as i32;
    let n = exponent + 1;
    let body = if k <= n && n <= 21 {
        format!("{digits}{}", "0".repeat((n - k) as usize))
    } else if 0 < n && n <= 21 {
        format!("{}.{}", &digits[..n as usize], &digits[n as usize..])
    } else if -6 < n && n <= 0 {
        format!("0.{}{digits}", "0".repeat((-n) as usize))
    } else {
        let e = n - 1;
        let sign = if e < 0 { '-' } else { '+' };
        if k == 1 {
            format!("{digits}e{sign}{}", e.abs())
        } else {
            format!("{}.{}e{sign}{}", &digits[..1], &digits[1..], e.abs())
        }
    };
    if x < 0.0 { format!("-{body}") } else { body }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hashes_match_node() {
        // Reference produced by the Node `hashToken("token", "pepper")`.
        assert_eq!(
            hash_token("token", "pepper"),
            "ec0f913a304148b662a2bf4ce89c1ccdc9f6cddc89d389171e49dcc7fa8327f4"
        );
    }

    #[test]
    fn canonical_json_sorts_object_keys_recursively() {
        let value: Value = serde_json::from_str(r#"{"b":1,"a":{"z":2,"c":3}}"#).unwrap();
        assert_eq!(canonical_json(&value), r#"{"a":{"c":3,"z":2},"b":1}"#);
    }

    #[test]
    fn numbers_print_like_javascript() {
        for (x, expected) in [
            (1.0, "1"),
            (-0.0, "0"),
            (100.0, "100"),
            (0.1, "0.1"),
            (1e-7, "1e-7"),
            (1.5e-7, "1.5e-7"),
            (0.000001, "0.000001"),
            (1e20, "100000000000000000000"),
            (1e21, "1e+21"),
            (1.5e300, "1.5e+300"),
            (5e-324, "5e-324"),
            (9007199254740991.0, "9007199254740991"),
            (-2.25, "-2.25"),
            (f64::NAN, "null"),
        ] {
            assert_eq!(js_number_to_string(x), expected, "{x}");
        }
    }
}
