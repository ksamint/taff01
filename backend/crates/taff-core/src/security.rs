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

/// Recursive canonical JSON, mirroring `canonicalJson` in
/// `packages/core/src/trusted-review.ts`: arrays keep order, object keys sort
/// lexicographically, and primitives serialize with standard JSON escaping.
pub fn canonical_json(value: &Value) -> String {
    match value {
        Value::Array(items) => {
            let rendered: Vec<String> = items.iter().map(canonical_json).collect();
            format!("[{}]", rendered.join(","))
        }
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            let rendered: Vec<String> = keys
                .into_iter()
                .map(|key| {
                    let key_json = serde_json::to_string(key).expect("string key serializes");
                    format!("{key_json}:{}", canonical_json(&map[key]))
                })
                .collect();
            format!("{{{}}}", rendered.join(","))
        }
        other => serde_json::to_string(other).expect("primitive serializes"),
    }
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
}
