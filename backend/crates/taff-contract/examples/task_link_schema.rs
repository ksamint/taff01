use schemars::schema_for;
use serde_json::json;
use taff_contract::{TaskLink, TaskLinkInput};

fn main() -> Result<(), serde_json::Error> {
    let contracts = json!({
        "input": schema_for!(TaskLinkInput),
        "link": schema_for!(TaskLink),
    });
    println!("{}", serde_json::to_string_pretty(&contracts)?);
    Ok(())
}
