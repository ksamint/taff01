use schemars::schema_for;
use serde_json::json;
use taff_contract::{ProjectHealthInput, ProjectHealthPage, ProjectHealthUpdate};

fn main() -> Result<(), serde_json::Error> {
    let contracts = json!({
        "input": schema_for!(ProjectHealthInput),
        "page": schema_for!(ProjectHealthPage),
        "update": schema_for!(ProjectHealthUpdate),
    });
    println!("{}", serde_json::to_string_pretty(&contracts)?);
    Ok(())
}
