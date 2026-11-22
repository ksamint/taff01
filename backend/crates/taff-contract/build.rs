use anyhow::{Context, Result, ensure};
use proc_macro2::{Ident, TokenStream};
use quote::{format_ident, quote};
use schemars::schema::Schema;
use serde::Deserialize;
use serde_json::Value;
use std::{
    collections::{BTreeMap, BTreeSet},
    env, fs,
    path::{Path, PathBuf},
};
use typify::TypeSpace;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Route {
    request_body: Option<Schema>,
    responses: BTreeMap<u16, Response>,
}

#[derive(Deserialize)]
struct Response {
    json: Option<Schema>,
}

fn read<T: serde::de::DeserializeOwned>(dir: &Path, name: &str) -> Result<T> {
    let path = dir.join(name);
    println!("cargo:rerun-if-changed={}", path.display());
    serde_json::from_slice(&fs::read(&path)?)
        .with_context(|| format!("invalid schema manifest {}", path.display()))
}

fn module_name(key: &str) -> Ident {
    let mut name = key
        .split(|character: char| !character.is_ascii_alphanumeric())
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("_");
    name.make_ascii_lowercase();
    format_ident!("{name}")
}

fn preserve_string_values(schema: &mut Value) {
    match schema {
        Value::Object(fields) => {
            // Meaningful wire spelling includes milliseconds, offsets and UUID case.
            if matches!(
                fields.get("format").and_then(Value::as_str),
                Some("date-time" | "date" | "uuid")
            ) {
                fields.remove("format");
                fields.remove("pattern");
            }
            fields.values_mut().for_each(preserve_string_values);
        }
        Value::Array(items) => items.iter_mut().for_each(preserve_string_values),
        _ => {}
    }
}

fn module(key: &str, schemas: impl IntoIterator<Item = (Ident, Schema)>) -> Result<TokenStream> {
    let name = module_name(key);
    let mut space = TypeSpace::default();
    let mut aliases = TokenStream::new();
    for (alias, schema) in schemas {
        let mut wire_schema = serde_json::to_value(schema)?;
        preserve_string_values(&mut wire_schema);
        let schema = serde_json::from_value(wire_schema)?;
        let id = space
            .add_type_with_name(&schema, Some(format!("{alias}Schema")))
            .with_context(|| format!("{key} {alias}"))?;
        let target = space.get_type(&id)?.ident();
        aliases.extend(quote!(pub type #alias = #target;));
    }
    let types = space.to_stream();
    Ok(quote! {
        pub mod #name {
            #types
            #aliases
        }
    })
}

fn main() -> Result<()> {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../packages/schemas/generated");
    let rest: BTreeMap<String, Route> = read(&dir, "rest.json")?;
    let mcp: BTreeMap<String, Schema> = read(&dir, "mcp-tools.json")?;

    let mut names = BTreeSet::new();
    let mut rest_modules = Vec::new();
    for (key, route) in rest {
        ensure!(
            names.insert(module_name(&key)),
            "duplicate Rust route module: {key}"
        );
        let body = route
            .request_body
            .map(|schema| (format_ident!("RequestBody"), schema));
        let responses = route
            .responses
            .into_iter()
            .filter_map(|(status, response)| {
                response
                    .json
                    .map(|schema| (format_ident!("Response{status}"), schema))
            });
        rest_modules.push(module(&key, body.into_iter().chain(responses))?);
    }

    names.clear();
    let mut tool_modules = Vec::new();
    for (key, schema) in mcp {
        ensure!(
            names.insert(module_name(&key)),
            "duplicate Rust tool module: {key}"
        );
        tool_modules.push(module(&key, [(format_ident!("Arguments"), schema)])?);
    }

    let mut render_modules = Vec::new();
    for image in [
        "calendar-image",
        "daily-summary",
        "graph-image",
        "timeline-image",
    ] {
        let schema = read(&dir, &format!("{image}.json"))?;
        render_modules.push(module(image, [(format_ident!("RequestBody"), schema)])?);
    }

    let generated = quote! {
        pub mod rest { #(#rest_modules)* }
        pub mod mcp { #(#tool_modules)* }
        pub mod render { #(#render_modules)* }
    };
    let out = PathBuf::from(env::var_os("OUT_DIR").context("missing OUT_DIR")?);
    fs::write(
        out.join("contracts.rs"),
        prettyplease::unparse(&syn::parse2(generated)?),
    )?;
    Ok(())
}
