use schemars::schema_for;
use serde_json::json;
use taff_contract::{ProjectActual, ProjectBudget};

fn main() -> Result<(), serde_json::Error> {
    let mut actual = schema_for!(ProjectActual);
    actual.schema.object().required.insert("budget".to_owned());
    let schemas = json!({
        "budget": schema_for!(ProjectBudget),
        "actual": actual,
    });
    println!("{}", serde_json::to_string_pretty(&schemas)?);
    Ok(())
}
